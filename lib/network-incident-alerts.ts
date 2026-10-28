import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import {
  buildExpoIncidentPushMessage,
  collectUnregisteredExpoTokens,
  sendExpoPushMessages,
  type ExpoPushMessage,
} from "@/lib/expo-push";

const LOG_PREFIX = "[INCIDENT_ALERTS]";

/** Cooldown entre alertas push a gerentes por el mismo puerto (20 minutos) */
const ALERT_COOLDOWN_MS = 20 * 60 * 1000;

export interface EvaluatePortParams {
  organizationId: string;
  board: number;
  port: number;
}

export interface IncidentEvaluationResult {
  hasIncident: boolean;
  board: number;
  port: number;
  totalAffected: number;
  losCount: number;
  alteredPowerCount: number;
  alertSent: boolean;
  recipientsCount: number;
  status: "active" | "resolved" | "normal";
  reason?: string;
}

/**
 * Obtiene los tokens Expo Push de gerentes y supervisores registrados en la organización.
 * Prioriza:
 * 1. Dispositivos con role = 'supervisor', 'manager' o 'admin'
 * 2. Técnicos con is_supervisor = true
 * 3. En caso de no haber supervisores registrados, busca cualquier staff activo
 */
export const loadManagerDeviceTokens = async (
  supabase: SupabaseClient,
  organizationId: string,
): Promise<string[]> => {
  try {
    // 1. Obtener IDs de técnicos con rol de supervisor
    const { data: supervisors } = await supabase
      .from("technicians")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_supervisor", true);

    const supervisorIds = (supervisors || []).map((s) => s.id);

    // 2. Consultar app_devices filtrando por supervisores o roles gerenciales
    let query = supabase
      .from("app_devices")
      .select("push_token, role, technician_id")
      .eq("organization_id", organizationId);

    const { data: devices, error } = await query;
    if (error) {
      console.warn(`${LOG_PREFIX} error obteniendo app_devices:`, error.message);
      return [];
    }

    const tokens = new Set<string>();

    for (const d of devices || []) {
      const token = String(d.push_token || "").trim();
      if (!token) continue;

      const isSupervisorRole = d.role === "supervisor" || d.role === "manager" || d.role === "admin";
      const isSupervisorTech = d.technician_id && supervisorIds.includes(d.technician_id);

      // Si coincide con rol supervisor o técnico supervisor, agregar
      if (isSupervisorRole || isSupervisorTech) {
        tokens.add(token);
      }
    }

    // Fallback: Si no hay supervisores explícitos, enviar a técnicos registrados
    if (tokens.size === 0) {
      for (const d of devices || []) {
        const token = String(d.push_token || "").trim();
        if (token && (d.role === "technician" || d.technician_id)) {
          tokens.add(token);
        }
      }
    }

    return Array.from(tokens);
  } catch (err) {
    console.error(`${LOG_PREFIX} error inesperado en loadManagerDeviceTokens:`, err);
    return [];
  }
};

/**
 * Evalúa el estado de un puerto PON (Board y Port) en una organización.
 * Si detecta 3 o más clientes caídos (LOS) o con potencia alterada (<= -29 dBm),
 * despacha una alerta push inmediata a los gerentes/supervisores respetando el cooldown.
 */
export const evaluateAndAlertPortIncidents = async ({
  organizationId,
  board,
  port,
}: EvaluatePortParams): Promise<IncidentEvaluationResult> => {
  if (board == null || port == null || !organizationId) {
    return {
      hasIncident: false,
      board: board ?? 0,
      port: port ?? 0,
      totalAffected: 0,
      losCount: 0,
      alteredPowerCount: 0,
      alertSent: false,
      recipientsCount: 0,
      status: "normal",
      reason: "Parametros invalidos",
    };
  }

  const supabase = getSupabaseAdmin();

  try {
    // 1. Obtener los IDs de clientes de la organización
    const { data: orgClients, error: clientsErr } = await supabase
      .from("clients")
      .select("id")
      .eq("organization_id", organizationId);

    if (clientsErr) throw clientsErr;
    const clientIds = (orgClients || []).map((c) => c.id);

    if (!clientIds.length) {
      return {
        hasIncident: false,
        board,
        port,
        totalAffected: 0,
        losCount: 0,
        alteredPowerCount: 0,
        alertSent: false,
        recipientsCount: 0,
        status: "normal",
        reason: "No hay clientes en esta organizacion",
      };
    }

    // 2. Consultar todas las ONUs en este Board y Port
    const { data: onus, error: onuErr } = await supabase
      .from("client_onus")
      .select("id, status, rx_signal, client_id")
      .eq("board", board)
      .eq("port", port)
      .in("client_id", clientIds);

    if (onuErr) throw onuErr;

    // 3. Contabilizar anomalías
    let losCount = 0;
    let alteredPowerCount = 0;

    for (const onu of onus || []) {
      const statusLower = (onu.status || "").toLowerCase().trim();
      const rxSignal = onu.rx_signal != null ? Number(onu.rx_signal) : null;

      const isLos =
        statusLower === "los" ||
        statusLower.includes("loss") ||
        statusLower === "power fail" ||
        statusLower.includes("power") ||
        statusLower === "offline";

      // Criterio solicitado: potencia alterada en <= -29 dBm
      const isAlteredPower = rxSignal !== null && rxSignal <= -29.0;

      if (isLos) {
        losCount += 1;
      } else if (isAlteredPower) {
        alteredPowerCount += 1;
      }
    }

    const totalAffected = losCount + alteredPowerCount;
    const hasIncident = totalAffected >= 3;

    // 4. Consultar si existe una alerta previa activa en este puerto
    const { data: activeAlert } = await supabase
      .from("pon_incident_alerts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("board", board)
      .eq("port", port)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = new Date();
    const nowIso = now.toISOString();

    // =========================================================================
    // CASO A: HAY INCIDENCIA MASIVA (>= 3 CLIENTES AFECTADOS)
    // =========================================================================
    if (hasIncident) {
      let incidentType: "massive_outage" | "altered_power" | "mixed" = "mixed";
      if (losCount >= 3 && alteredPowerCount === 0) {
        incidentType = "massive_outage";
      } else if (alteredPowerCount >= 3 && losCount === 0) {
        incidentType = "altered_power";
      }

      // Comprobar si debemos enviar notificación (respetando cooldown)
      let shouldSendPush = true;
      if (activeAlert) {
        const lastSent = new Date(activeAlert.last_alert_sent_at).getTime();
        const elapsed = now.getTime() - lastSent;
        if (elapsed < ALERT_COOLDOWN_MS) {
          shouldSendPush = false;
        }
      }

      let recipientsCount = 0;
      let alertSent = false;

      if (shouldSendPush) {
        const tokens = await loadManagerDeviceTokens(supabase, organizationId);
        recipientsCount = tokens.length;

        if (tokens.length > 0) {
          let pushTitle = `🚨 ALERTA PON: Tarjeta ${board} / Puerto ${port}`;
          let pushBody = "";

          if (incidentType === "massive_outage") {
            pushBody = `⚠️ Caída masiva: ${losCount} clientes sin conexión (LOS/Offline). Posible corte de fibra o falla en splitter.`;
          } else if (incidentType === "altered_power") {
            pushBody = `⚡ Atenuación crítica: ${alteredPowerCount} clientes con potencia alterada (≤ -29 dBm). Alta degradación e intermitencia.`;
          } else {
            pushBody = `⚠️ Incidencia múltiple: ${totalAffected} clientes afectados (${losCount} caídos, ${alteredPowerCount} con potencia alterada ≤ -29 dBm).`;
          }

          const messages: ExpoPushMessage[] = tokens.map((token) =>
            buildExpoIncidentPushMessage({
              token,
              title: pushTitle,
              body: pushBody,
              board,
              port,
              incidentType,
              affectedCount: totalAffected,
              losCount,
              alteredCount: alteredPowerCount,
            }),
          );

          try {
            const tickets = await sendExpoPushMessages(messages);
            alertSent = true;

            // Limpieza de tokens inválidos
            const staleTokens = collectUnregisteredExpoTokens(tokens, tickets);
            if (staleTokens.length > 0) {
              await supabase
                .from("app_devices")
                .delete()
                .eq("organization_id", organizationId)
                .in("push_token", staleTokens);
            }

            console.log(
              `${LOG_PREFIX} alerta enviada a ${tokens.length} gerentes para Board ${board}/Port ${port}`,
            );
          } catch (pushErr) {
            console.error(`${LOG_PREFIX} error enviando mensajes Expo:`, pushErr);
          }
        } else {
          console.warn(
            `${LOG_PREFIX} Incidencia en Board ${board}/Port ${port} pero no hay tokens de gerentes registrados`,
          );
        }
      }

      // Actualizar o crear registro en pon_incident_alerts
      if (activeAlert) {
        await supabase
          .from("pon_incident_alerts")
          .update({
            affected_count: totalAffected,
            los_count: losCount,
            altered_power_count: alteredPowerCount,
            incident_type: incidentType,
            updated_at: nowIso,
            ...(alertSent ? { last_alert_sent_at: nowIso } : {}),
          })
          .eq("id", activeAlert.id);
      } else {
        await supabase.from("pon_incident_alerts").insert({
          organization_id: organizationId,
          board,
          port,
          incident_type: incidentType,
          affected_count: totalAffected,
          los_count: losCount,
          altered_power_count: alteredPowerCount,
          status: "active",
          first_detected_at: nowIso,
          last_alert_sent_at: nowIso,
        });
      }

      return {
        hasIncident: true,
        board,
        port,
        totalAffected,
        losCount,
        alteredPowerCount,
        alertSent,
        recipientsCount,
        status: "active",
      };
    }

    // =========================================================================
    // CASO B: NORMALIZACIÓN (< 3 AFECTADOS) Y HABÍA ALERTA ACTIVA PREVIA
    // =========================================================================
    if (!hasIncident && activeAlert) {
      // Marcar alerta previa como resuelta
      await supabase
        .from("pon_incident_alerts")
        .update({
          status: "resolved",
          resolved_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", activeAlert.id);

      // Notificar resolución a gerentes
      const tokens = await loadManagerDeviceTokens(supabase, organizationId);
      if (tokens.length > 0) {
        const resolutionMessages: ExpoPushMessage[] = tokens.map((token) =>
          buildExpoIncidentPushMessage({
            token,
            title: `✅ Puerto Normalizado: PON ${board}/${port}`,
            body: `La incidencia en Tarjeta ${board}, Puerto PON ${port} se ha normalizado. Los clientes han restablecido conexión.`,
            board,
            port,
            incidentType: "resolved",
            affectedCount: totalAffected,
            losCount,
            alteredCount: alteredPowerCount,
          }),
        );
        void sendExpoPushMessages(resolutionMessages).catch((e) =>
          console.warn(`${LOG_PREFIX} error enviando notificacion de resolucion:`, e),
        );
      }

      return {
        hasIncident: false,
        board,
        port,
        totalAffected,
        losCount,
        alteredPowerCount,
        alertSent: true,
        recipientsCount: tokens.length,
        status: "resolved",
      };
    }

    return {
      hasIncident: false,
      board,
      port,
      totalAffected,
      losCount,
      alteredPowerCount,
      alertSent: false,
      recipientsCount: 0,
      status: "normal",
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} error en evaluateAndAlertPortIncidents:`, error);
    return {
      hasIncident: false,
      board,
      port,
      totalAffected: 0,
      losCount: 0,
      alteredPowerCount: 0,
      alertSent: false,
      recipientsCount: 0,
      status: "normal",
      reason: error instanceof Error ? error.message : "Error interno",
    };
  }
};
