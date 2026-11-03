import { NextRequest, NextResponse } from "next/server";
import { getCrmAuthContext } from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { loadManagerDeviceTokens } from "@/lib/network-incident-alerts";
import {
  buildExpoNetworkAlertPushMessage,
  sendExpoPushMessages,
  type ExpoPushMessage,
} from "@/lib/expo-push";
import type { AffectedClient } from "@/types/smartolt";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/monitoring/test-alert
 * Notifica a los dispositivos móviles (Expo) de los gerentes y supervisores
 * sobre los clientes desconectados actualmente según la tabla de incidencias de red,
 * con tipografía limpia, sin ALL CAPS, y canales nativos Android/iOS.
 */
export async function POST(req: NextRequest) {
  try {
    const context = await getCrmAuthContext(req);
    const body = await req.json().catch(() => ({}));

    const supabase = getSupabaseAdmin();
    const tokens = await loadManagerDeviceTokens(supabase, context.organizationId);

    if (tokens.length === 0) {
      return NextResponse.json(
        {
          success: false,
          recipientsCount: 0,
          message:
            "No hay dispositivos de gerentes o supervisores vinculados en la app móvil. Inicia sesión en la app como supervisor o gerente para registrar tu dispositivo.",
        },
        { status: 404 },
      );
    }

    let affectedList: AffectedClient[] = Array.isArray(body.affectedClients)
      ? body.affectedClients
      : [];

    // Si no se suministró la lista desde el frontend, consultarla directamente en la BD
    if (!Array.isArray(body.affectedClients)) {
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name, phone, cedula, zone")
        .eq("organization_id", context.organizationId);

      const clientIds = (clients || []).map((c) => c.id);
      if (clientIds.length > 0) {
        const { data: onus } = await supabase
          .from("client_onus")
          .select("id, client_id, board, port, rx_signal, status, zone, sn, onu_external_id, status_changed_at, signal_changed_at")
          .in("client_id", clientIds);

        const clientsMap = new Map((clients || []).map((c) => [c.id, c]));

        for (const onu of onus || []) {
          const statusLower = (onu.status || "").toLowerCase().trim();
          const rxSignal = onu.rx_signal != null ? Number(onu.rx_signal) : null;
          const isLos = statusLower === "los" || statusLower.includes("loss");
          const isPowerFail = statusLower === "power fail" || statusLower.includes("power");
          const isOffline = statusLower === "offline";
          const isAlteredPower = rxSignal !== null && rxSignal <= -29.0;

          if (isLos || isPowerFail || isOffline || isAlteredPower) {
            const client = onu.client_id ? clientsMap.get(onu.client_id) : null;
            let incidentType: AffectedClient["incidentType"] = "LOS";
            if (isAlteredPower) incidentType = "Potencia alterada";
            else if (isPowerFail) incidentType = "Power fail";
            else if (isOffline) incidentType = "Offline";

            affectedList.push({
              id: onu.id,
              clientId: client?.id || 0,
              name: client?.name || "Cliente sin registrar",
              phone: client?.phone || null,
              cedula: client?.cedula || null,
              zone: client?.zone || onu.zone || null,
              board: onu.board != null ? Number(onu.board) : 0,
              port: onu.port != null ? Number(onu.port) : 0,
              sn: onu.sn,
              onuExternalId: onu.onu_external_id,
              status: onu.status || "Desconocido",
              rxSignal,
              incidentType,
              startedAt: onu.status_changed_at || new Date().toISOString(),
              durationMs: 0,
              durationText: "",
            });
          }
        }
      }
    }

    const totalAffected = affectedList.length;

    // Generar mensajes push con formato tipográfico optimizado
    const messages: ExpoPushMessage[] = tokens.map((token) =>
      buildExpoNetworkAlertPushMessage({
        token,
        clients: affectedList,
        fallbackBoard: 1,
        fallbackPort: 1,
      }),
    );

    const tickets = await sendExpoPushMessages(messages);

    const feedbackMessage = totalAffected > 0
      ? `Alerta enviada a ${tokens.length} dispositivo(s) de gerentes informando sobre ${totalAffected} cliente(s) afectado(s).`
      : `Reporte de red 100% operativa enviado a ${tokens.length} dispositivo(s) de gerentes.`;

    return NextResponse.json({
      success: true,
      recipientsCount: tokens.length,
      affectedCount: totalAffected,
      message: feedbackMessage,
      payloadSample: messages[0] || null,
      tickets,
    });
  } catch (error) {
    console.error("[MONITORING_ALERT_MANAGERS] Error:", error);
    const message = error instanceof Error ? error.message : "Error al enviar alerta a gerentes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
