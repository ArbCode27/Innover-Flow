import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { getAppTechnicianAuthContext } from "../../_lib/app-auth";
import {
  APP_ERROR_CODES,
  AppApiError,
  toAppErrorResponse,
} from "../../_lib/app-errors";
import {
  broadcastIncidentAlert,
  evaluateAndAlertPortIncidents,
  loadManagerDeviceTokens,
} from "@/lib/network-incident-alerts";
import {
  buildExpoNetworkAlertPushMessage,
  sendExpoPushMessages,
} from "@/lib/expo-push";

export const dynamic = "force-dynamic";

const formatDurationAgo = (startedAt: string | Date): { ms: number; text: string } => {
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

export const GET = async (request: NextRequest) => {
  try {
    const session = await getAppTechnicianAuthContext(request);
    if (session.role !== "supervisor") {
      throw new AppApiError(
        APP_ERROR_CODES.VALIDATION_ERROR,
        "Solo un supervisor o gerente puede consultar las incidencias de red.",
        403,
      );
    }

    const boardParam = request.nextUrl.searchParams.get("board");
    const portParam = request.nextUrl.searchParams.get("port");
    const statusFilter = request.nextUrl.searchParams.get("status") || "all";

    const filterBoard = boardParam ? Number(boardParam) : null;
    const filterPort = portParam ? Number(portParam) : null;

    const supabase = getSupabaseAdmin();

    // 1. Obtener clientes de la organización
    const { data: clients, error: clientErr } = await supabase
      .from("clients")
      .select("id, name, phone, cedula, zone")
      .eq("organization_id", session.organizationId);

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
    if (clientIds.length === 0) {
      return NextResponse.json({
        metrics: {
          totalOnus: 0,
          totalOnline: 0,
          totalLos: 0,
          totalAlteredPower: 0,
          totalPowerFail: 0,
          totalOffline: 0,
          totalPortsInAlert: 0,
        },
        incidents: [],
        disconnectedClients: [],
        portsSummary: [],
      });
    }

    // 2. Obtener ONUs asociadas
    let onuQuery = supabase
      .from("client_onus")
      .select("id, client_id, board, port, rx_signal, status, status_changed_at, signal_changed_at, zone, sn, onu_external_id, updated_at, created_at")
      .in("client_id", clientIds);

    if (filterBoard !== null) {
      onuQuery = onuQuery.eq("board", filterBoard);
    }
    if (filterPort !== null) {
      onuQuery = onuQuery.eq("port", filterPort);
    }

    const { data: onus, error: onusErr } = await onuQuery;
    if (onusErr) throw onusErr;

    // 3. Procesar métricas, agrupación por puerto y clientes desconectados
    let totalOnline = 0;
    let totalLos = 0;
    let totalAlteredPower = 0;
    let totalPowerFail = 0;
    let totalOffline = 0;

    const disconnectedClients = [];

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
        affectedClients: Array<Record<string, unknown>>;
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

      const isLos = statusLower === "los" || statusLower.includes("loss");
      const isPowerFail = statusLower === "power fail" || statusLower.includes("power");
      const isOffline = statusLower === "offline";
      const isOnline = statusLower === "online";
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

      const startedAt = isAlteredPower
        ? onu.signal_changed_at || onu.updated_at || onu.created_at || new Date().toISOString()
        : onu.status_changed_at || onu.updated_at || onu.created_at || new Date().toISOString();

      const { ms: durationMs, text: durationText } = formatDurationAgo(startedAt);

      let incidentType: "LOS" | "Potencia alterada" | "Power fail" | "Offline" = "LOS";
      if (isAlteredPower) {
        incidentType = "Potencia alterada";
      } else if (isPowerFail) {
        incidentType = "Power fail";
      } else if (isOffline) {
        incidentType = "Offline";
      }

      if (statusFilter !== "all" && incidentType !== statusFilter) {
        continue;
      }

      const affectedItem = {
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

      disconnectedClients.push(affectedItem);
      portStat.affectedClients.push(affectedItem);
    }

    // Ordenar clientes por duración (los más antiguos primero)
    disconnectedClients.sort((a, b) => b.durationMs - a.durationMs);

    // 4. Consultar alertas activas en pon_incident_alerts
    const { data: activeAlertsData } = await supabase
      .from("pon_incident_alerts")
      .select("*")
      .eq("organization_id", session.organizationId)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    const activeAlertsMap = new Map<string, Record<string, unknown>>();
    for (const alert of activeAlertsData || []) {
      activeAlertsMap.set(`${alert.board}:${alert.port}`, alert);
    }

    const incidents = (activeAlertsData || []).map((alert) => {
      const portKey = `${alert.board}:${alert.port}`;
      const group = portGroups.get(portKey);
      return {
        id: alert.id,
        board: alert.board,
        port: alert.port,
        incidentType: alert.incident_type,
        affectedCount: alert.affected_count,
        losCount: alert.los_count,
        alteredCount: alert.altered_power_count,
        status: alert.status,
        firstDetectedAt: alert.first_detected_at,
        lastAlertSentAt: alert.last_alert_sent_at,
        acknowledgedAt: alert.acknowledged_at,
        durationText: formatDurationAgo(alert.first_detected_at).text,
        clientsCount: group ? group.affectedClients.length : alert.affected_count,
      };
    });

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
          hasActiveAlert: Boolean(alertInfo),
        };
      })
      .sort((a, b) => a.healthRatio - b.healthRatio);

    return NextResponse.json({
      metrics: {
        totalOnus: (onus || []).length,
        totalOnline,
        totalLos,
        totalAlteredPower,
        totalPowerFail,
        totalOffline,
        totalPortsInAlert: incidents.length,
      },
      incidents,
      disconnectedClients,
      portsSummary,
    });
  } catch (error) {
    return toAppErrorResponse(error);
  }
};

/**
 * POST /api/app/supervisor/incidents
 * Acciones operativas para gerentes/supervisores:
 * - acknowledge: Confirmar lectura de la alerta de incidencia
 * - simulate_push: Disparar alerta push de prueba hacia el equipo
 * - resolve: Marcar manualmente la incidencia de un puerto como normalizada
 */
export const POST = async (request: NextRequest) => {
  try {
    const session = await getAppTechnicianAuthContext(request);
    if (session.role !== "supervisor") {
      throw new AppApiError(
        APP_ERROR_CODES.VALIDATION_ERROR,
        "Solo un supervisor o gerente puede ejecutar acciones sobre incidencias.",
        403,
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: "acknowledge" | "simulate_push" | "resolve";
      incidentId?: string;
      board?: number;
      port?: number;
    };

    const action = body.action || "simulate_push";
    const supabase = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    if (action === "acknowledge" && body.incidentId) {
      const { data, error } = await supabase
        .from("pon_incident_alerts")
        .update({
          acknowledged_at: nowIso,
          acknowledged_by: session.technicianId,
          updated_at: nowIso,
        })
        .eq("id", body.incidentId)
        .eq("organization_id", session.organizationId)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, acknowledged: true, incident: data });
    }

    if (action === "resolve" && body.board != null && body.port != null) {
      await supabase
        .from("pon_incident_alerts")
        .update({
          status: "resolved",
          resolved_at: nowIso,
          updated_at: nowIso,
        })
        .eq("organization_id", session.organizationId)
        .eq("board", Number(body.board))
        .eq("port", Number(body.port))
        .eq("status", "active");

      // Broadcast en tiempo real
      await broadcastIncidentAlert(supabase, session.organizationId, {
        event: "incident_resolved",
        board: Number(body.board),
        port: Number(body.port),
        affectedCount: 0,
        severity: "normal",
        title: `✅ Red Normalizada: Tarjeta ${body.board} • Puerto ${body.port}`,
        body: `Incidencia en Tarjeta ${body.board} / Puerto PON ${body.port} marcada como resuelta.`,
        status: "resolved",
      });

      return NextResponse.json({ success: true, resolved: true });
    }

    if (action === "simulate_push") {
      const board = Number(body.board ?? 1);
      const port = Number(body.port ?? 3);

      const evalResult = await evaluateAndAlertPortIncidents({
        organizationId: session.organizationId,
        board,
        port,
      });

      return NextResponse.json({
        success: true,
        action: "simulate_push",
        board,
        port,
        result: evalResult,
      });
    }

    throw new AppApiError(
      APP_ERROR_CODES.VALIDATION_ERROR,
      "Acción solicitada no válida.",
      400,
    );
  } catch (error) {
    return toAppErrorResponse(error);
  }
};
