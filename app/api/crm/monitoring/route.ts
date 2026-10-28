import { NextRequest, NextResponse } from "next/server";
import { getCrmAuthContext } from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import type {
  AffectedClient,
  MonitoringIncident,
  MonitoringSummaryMetrics,
} from "@/types/smartolt";

export const dynamic = "force-dynamic";

/**
 * Convierte una diferencia de milisegundos en texto legible en español.
 * Ej: "Hace 45 min", "Hace 2h 15m", "Hace 3d 4h"
 */
export const formatDurationAgo = (startedAt: string | Date): { ms: number; text: string } => {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - start);

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) {
    return { ms: diffMs, text: "Hace menos de 1 min" };
  }
  if (diffMinutes < 60) {
    return { ms: diffMs, text: `Hace ${diffMinutes} min` };
  }
  if (diffHours < 24) {
    const remMinutes = diffMinutes % 60;
    return { ms: diffMs, text: `Hace ${diffHours}h ${remMinutes}m` };
  }
  const remHours = diffHours % 24;
  return { ms: diffMs, text: `Hace ${diffDays}d ${remHours}h` };
};

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await getCrmAuthContext(req);
    const supabase = getSupabaseAdmin();

    // 1. Obtener clientes de la organización
    const { data: clients, error: clientErr } = await supabase
      .from("clients")
      .select("id, name, phone, cedula, zone")
      .eq("organization_id", organizationId);

    if (clientErr) throw clientErr;

    const clientsMap = new Map<number, {
      id: number;
      name: string;
      phone: string | null;
      cedula: string | null;
      zone: string | null;
    }>();

    for (const c of clients || []) {
      clientsMap.set(c.id, {
        id: c.id,
        name: c.name,
        phone: c.phone,
        cedula: c.cedula,
        zone: c.zone,
      });
    }

    const clientIds = Array.from(clientsMap.keys());
    if (!clientIds.length) {
      const emptyMetrics: MonitoringSummaryMetrics = {
        totalOnus: 0,
        totalOnline: 0,
        totalLos: 0,
        totalAlteredPower: 0,
        totalPowerFail: 0,
        totalOffline: 0,
        totalPortsInAlert: 0,
      };
      return NextResponse.json({
        metrics: emptyMetrics,
        incidents: [],
        affectedClients: [],
        portsSummary: [],
      });
    }

    // 2. Obtener ONUs asociadas a estos clientes
    const { data: onus, error: onusErr } = await supabase
      .from("client_onus")
      .select("*")
      .in("client_id", clientIds);

    if (onusErr) throw onusErr;

    // 3. Métricas acumuladas y detección de anomalías
    let totalOnline = 0;
    let totalLos = 0;
    let totalAlteredPower = 0;
    let totalPowerFail = 0;
    let totalOffline = 0;

    const affectedClientsList: AffectedClient[] = [];

    // Agrupación por puerto para detectar cortes masivos y degradación
    const portGroups = new Map<
      string,
      {
        board: number;
        port: number;
        total: number;
        online: number;
        los: number;
        altered: number;
        powerFail: number;
        offline: number;
        affectedClients: AffectedClient[];
      }
    >();

    for (const onu of onus || []) {
      const clientId = onu.client_id;
      const client = clientId ? clientsMap.get(clientId) : null;
      const statusLower = (onu.status || "").toLowerCase().trim();
      const rxSignal = onu.rx_signal != null ? Number(onu.rx_signal) : null;

      const board = onu.board != null ? Number(onu.board) : 0;
      const port = onu.port != null ? Number(onu.port) : 0;
      const portKey = `${board}:${port}`;

      if (!portGroups.has(portKey)) {
        portGroups.set(portKey, {
          board,
          port,
          total: 0,
          online: 0,
          los: 0,
          altered: 0,
          powerFail: 0,
          offline: 0,
          affectedClients: [],
        });
      }
      const portStat = portGroups.get(portKey)!;
      portStat.total += 1;

      // Clasificación de condición de red
      const isLos = statusLower === "los" || statusLower.includes("loss");
      const isPowerFail = statusLower === "power fail" || statusLower.includes("power");
      const isOffline = statusLower === "offline";
      const isOnline = statusLower === "online";

      // Criterio del usuario: Potencia alterada se mide cuando está en peor de -29 dBm
      const isAlteredPower = rxSignal !== null && rxSignal <= -29.0;

      if (isOnline && !isAlteredPower) {
        totalOnline += 1;
        portStat.online += 1;
        continue;
      }

      if (isLos) {
        totalLos += 1;
        portStat.los += 1;
      } else if (isPowerFail) {
        totalPowerFail += 1;
        portStat.powerFail += 1;
      } else if (isOffline) {
        totalOffline += 1;
        portStat.offline += 1;
      }

      if (isAlteredPower) {
        totalAlteredPower += 1;
        portStat.altered += 1;
      }

      // Determinar la fecha de inicio de la incidencia
      const startedAt = isAlteredPower
        ? onu.signal_changed_at || onu.updated_at || onu.created_at || new Date().toISOString()
        : onu.status_changed_at || onu.updated_at || onu.created_at || new Date().toISOString();

      const { ms: durationMs, text: durationText } = formatDurationAgo(startedAt);

      let incidentType: AffectedClient["incidentType"] = "LOS";
      if (isAlteredPower) {
        incidentType = "Potencia alterada";
      } else if (isPowerFail) {
        incidentType = "Power fail";
      } else if (isOffline) {
        incidentType = "Offline";
      }

      const affectedItem: AffectedClient = {
        id: onu.id,
        clientId: client?.id || 0,
        name: client?.name || "Cliente sin registrar",
        phone: client?.phone || null,
        cedula: client?.cedula || null,
        zone: client?.zone || onu.zone || null,
        board,
        port,
        sn: onu.sn,
        onuExternalId: onu.onu_external_id,
        status: onu.status || "Desconocido",
        rxSignal,
        incidentType,
        startedAt,
        durationMs,
        durationText,
      };

      affectedClientsList.push(affectedItem);
      portStat.affectedClients.push(affectedItem);
    }

    // 4. Formulación de Incidencias Agrupadas
    const incidents: MonitoringIncident[] = [];
    let portsInAlert = 0;

    for (const [key, p] of portGroups.entries()) {
      const disconnectedCount = p.los + p.offline;
      const isMassiveOutage = disconnectedCount >= 2;
      const isMassiveAltered = p.altered >= 2;

      if (isMassiveOutage || isMassiveAltered || p.affectedClients.length > 0) {
        portsInAlert += 1;
      }

      if (isMassiveOutage) {
        const earliestTime = p.affectedClients
          .filter((c) => c.incidentType === "LOS" || c.incidentType === "Offline")
          .sort((a, b) => b.durationMs - a.durationMs)[0]?.startedAt || new Date().toISOString();

        incidents.push({
          id: `outage-${key}`,
          category: "port_outage",
          title: `Caída masiva en Tarjeta ${p.board} / Puerto PON ${p.port}`,
          description: `${disconnectedCount} de ${p.total} clientes desconectados simultáneamente. Posible corte o rotura en el hilo troncal/splitter del puerto PON.`,
          board: p.board,
          port: p.port,
          affectedCount: disconnectedCount,
          severity: "critical",
          startedAt: earliestTime,
          durationText: formatDurationAgo(earliestTime).text,
          clients: p.affectedClients.filter((c) => c.incidentType === "LOS" || c.incidentType === "Offline"),
        });
      }

      if (isMassiveAltered) {
        const alteredClients = p.affectedClients.filter((c) => c.incidentType === "Potencia alterada");
        const earliestTime = alteredClients.sort((a, b) => b.durationMs - a.durationMs)[0]?.startedAt || new Date().toISOString();

        incidents.push({
          id: `degraded-${key}`,
          category: "altered_power",
          title: `Atenuación severa en Tarjeta ${p.board} / Puerto PON ${p.port}`,
          description: `${p.altered} clientes con potencia óptica degradada (peor de -29 dBm). Causa alta latencia e intermitencia en el enlace.`,
          board: p.board,
          port: p.port,
          affectedCount: p.altered,
          severity: "warning",
          startedAt: earliestTime,
          durationText: formatDurationAgo(earliestTime).text,
          clients: alteredClients,
        });
      }
    }

    // Ordenar clientes afectados por duración (los más antiguos primero)
    affectedClientsList.sort((a, b) => b.durationMs - a.durationMs);
    incidents.sort((a, b) => (b.severity === "critical" ? 1 : 0) - (a.severity === "critical" ? 1 : 0));

    // Consultar alertas activas en pon_incident_alerts
    const { data: activeAlertsData } = await supabase
      .from("pon_incident_alerts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "active");

    const activeAlertsMap = new Map<string, { last_alert_sent_at: string; incident_type: string }>();
    for (const alert of activeAlertsData || []) {
      activeAlertsMap.set(`${alert.board}:${alert.port}`, alert);
    }

    // Enriquecer incidencias con datos de alerta push
    const enrichedIncidents = incidents.map((inc) => {
      const alertInfo = activeAlertsMap.get(`${inc.board}:${inc.port}`);
      return {
        ...inc,
        managerAlertSent: Boolean(alertInfo),
        managerAlertSentAt: alertInfo?.last_alert_sent_at || null,
        managerAlertAgo: alertInfo ? formatDurationAgo(alertInfo.last_alert_sent_at).text : null,
      };
    });

    const metrics: MonitoringSummaryMetrics = {
      totalOnus: (onus || []).length,
      totalOnline,
      totalLos,
      totalAlteredPower,
      totalPowerFail,
      totalOffline,
      totalPortsInAlert: portsInAlert,
    };

    const portsSummary = Array.from(portGroups.values())
      .filter((p) => p.board > 0 || p.port > 0)
      .map((p) => {
        const alertInfo = activeAlertsMap.get(`${p.board}:${p.port}`);
        return {
          board: p.board,
          port: p.port,
          total: p.total,
          online: p.online,
          affected: p.affectedClients.length,
          healthRatio: p.total > 0 ? Math.round((p.online / p.total) * 100) : 100,
          managerAlertSent: Boolean(alertInfo),
          managerAlertSentAt: alertInfo?.last_alert_sent_at || null,
        };
      })
      .sort((a, b) => a.board - b.board || a.port - b.port);

    return NextResponse.json({
      metrics,
      incidents: enrichedIncidents,
      affectedClients: affectedClientsList,
      portsSummary,
    });
  } catch (error) {
    console.error("[MONITORING_API] Error:", error);
    const message = error instanceof Error ? error.message : "Error al procesar monitoreo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
