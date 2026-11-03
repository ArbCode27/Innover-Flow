import { NextRequest, NextResponse } from "next/server";
import { getCrmAuthContext } from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import {
  broadcastIncidentAlert,
  loadManagerDeviceTokens,
} from "@/lib/network-incident-alerts";
import {
  buildExpoNetworkAlertPushMessage,
  sendExpoPushMessages,
} from "@/lib/expo-push";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/incidents/simulate-push
 * Endpoint gerencial para simular o disparar un evento push de incidencia desde InnoverCorp.
 * Emite por Supabase Realtime (broadcast y postgres_changes), actualiza pon_incident_alerts
 * y opcionalmente despacha notificación push a dispositivos de gerentes.
 */
export async function POST(req: NextRequest) {
  try {
    const context = await getCrmAuthContext(req);
    const body = (await req.json().catch(() => ({}))) as {
      board?: number;
      port?: number;
      dispatchPush?: boolean;
    };

    const supabase = getSupabaseAdmin();
    const board = Number(body.board ?? 1);
    const port = Number(body.port ?? 3);
    const shouldDispatchPush = Boolean(body.dispatchPush);

    // 1. Contar clientes desconectados reales en ese board y port si existen
    const { data: clients } = await supabase
      .from("clients")
      .select("id")
      .eq("organization_id", context.organizationId);

    const clientIds = (clients || []).map((c) => c.id);
    let realAffectedCount = 0;

    if (clientIds.length > 0) {
      const { data: onus } = await supabase
        .from("client_onus")
        .select("id, status, rx_signal")
        .in("client_id", clientIds)
        .eq("board", board)
        .eq("port", port);

      for (const onu of onus || []) {
        const s = (onu.status || "").toLowerCase();
        const rx = onu.rx_signal != null ? Number(onu.rx_signal) : null;
        if (s === "los" || s.includes("loss") || s === "offline" || (rx !== null && rx <= -29.0)) {
          realAffectedCount++;
        }
      }
    }

    const affectedCount = realAffectedCount > 0 ? realAffectedCount : 4;
    const severity = affectedCount >= 3 ? "critical" : "warning";
    const title = `🚨 Alerta InnoverCorp: Incidencia en Tarjeta ${board} • Puerto ${port}`;
    const bodyText = `Se han detectado ${affectedCount} clientes desconectados en Tarjeta ${board} / Puerto PON ${port}.`;
    const nowIso = new Date().toISOString();

    // 2. Registrar o actualizar en pon_incident_alerts para que postgres_changes también se dispare
    const { data: existingAlert } = await supabase
      .from("pon_incident_alerts")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("board", board)
      .eq("port", port)
      .eq("status", "active")
      .maybeSingle();

    if (existingAlert) {
      await supabase
        .from("pon_incident_alerts")
        .update({
          affected_count: affectedCount,
          last_alert_sent_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", existingAlert.id);
    } else {
      await supabase.from("pon_incident_alerts").insert({
        organization_id: context.organizationId,
        board,
        port,
        incident_type: severity === "critical" ? "massive_outage" : "altered_power",
        affected_count: affectedCount,
        los_count: affectedCount,
        altered_power_count: 0,
        status: "active",
        first_detected_at: nowIso,
        last_alert_sent_at: nowIso,
      });
    }

    // 3. Emitir broadcast hacia los paneles web de gerentes
    await broadcastIncidentAlert(supabase, context.organizationId, {
      event: "incident_push",
      board,
      port,
      affectedCount,
      severity,
      title,
      body: bodyText,
      status: "active",
    });

    let recipientsCount = 0;
    if (shouldDispatchPush) {
      const tokens = await loadManagerDeviceTokens(supabase, context.organizationId);
      recipientsCount = tokens.length;
      if (tokens.length > 0) {
        const messages = tokens.map((token) =>
          buildExpoNetworkAlertPushMessage({
            token,
            fallbackBoard: board,
            fallbackPort: port,
            forcedSeverity: severity,
          }),
        );
        void sendExpoPushMessages(messages).catch((e) =>
          console.warn("[SIMULATE_PUSH] Error enviando push Expo:", e),
        );
      }
    }

    return NextResponse.json({
      success: true,
      simulated: true,
      board,
      port,
      affectedCount,
      severity,
      title,
      body: bodyText,
      pushSent: shouldDispatchPush,
      recipientsCount,
      timestamp: nowIso,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    const status = message.toLowerCase().includes("sesión") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
