import { NextRequest, NextResponse } from "next/server";
import { getCrmAuthContext } from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { loadManagerDeviceTokens } from "@/lib/network-incident-alerts";
import {
  buildExpoIncidentPushMessage,
  sendExpoPushMessages,
  type ExpoPushMessage,
} from "@/lib/expo-push";
import type { AffectedClient } from "@/types/smartolt";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/monitoring/test-alert
 * Notifica a los dispositivos móviles (Expo) de los gerentes y supervisores
 * sobre los clientes desconectados actualmente según la tabla de incidencias.
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
    let title: string;
    let alertBody: string;
    let incidentType: "massive_outage" | "altered_power" | "mixed" | "resolved" = "massive_outage";
    let representativeBoard = 1;
    let representativePort = 1;

    let losCount = 0;
    let alteredCount = 0;

    if (totalAffected > 0) {
      losCount = affectedList.filter(
        (c) => c.incidentType === "LOS" || c.incidentType === "Offline" || c.incidentType === "Power fail",
      ).length;
      alteredCount = affectedList.filter((c) => c.incidentType === "Potencia alterada").length;

      incidentType = losCount > 0 && alteredCount > 0 ? "mixed" : losCount > 0 ? "massive_outage" : "altered_power";
      representativeBoard = affectedList[0]?.board || 1;
      representativePort = affectedList[0]?.port || 1;

      // Agrupación de puertos afectados para el reporte
      const uniquePorts = Array.from(
        new Set(affectedList.map((c) => `Tarjeta ${c.board} / P${c.port}`)),
      );

      // Resumen de clientes (primeros 3 nombres)
      const previewClients = affectedList
        .slice(0, 3)
        .map((c) => `• ${c.name} (${c.incidentType} - T${c.board}:P${c.port})`)
        .join("\n");

      const remaining = totalAffected - 3;
      const extraText = remaining > 0 ? `\n...y ${remaining} cliente(s) más.` : "";

      title = `🚨 ALERTA RED: ${totalAffected} Cliente(s) Desconectado(s)`;
      alertBody = `Incidencia detectada en ${uniquePorts.slice(0, 2).join(", ")}${uniquePorts.length > 2 ? ` (+${uniquePorts.length - 2} puertos)` : ""}:\n${previewClients}${extraText}`;
    } else {
      title = "✅ RED OPERATIVA: Sin Clientes Desconectados";
      alertBody = "Monitoreo en tiempo real: Todos los clientes y puertos PON se encuentran en línea y con potencia óptica normal.";
      incidentType = "resolved";
    }

    const messages: ExpoPushMessage[] = tokens.map((token) =>
      buildExpoIncidentPushMessage({
        token,
        title,
        body: alertBody,
        board: representativeBoard,
        port: representativePort,
        incidentType,
        affectedCount: totalAffected,
        losCount,
        alteredCount,
      }),
    );

    const tickets = await sendExpoPushMessages(messages);

    const feedbackMessage = totalAffected > 0
      ? `Alerta enviada a ${tokens.length} dispositivo(s) de gerentes informando sobre ${totalAffected} cliente(s) desconectado(s).`
      : `Reporte de red 100% operativa enviado a ${tokens.length} dispositivo(s) de gerentes.`;

    return NextResponse.json({
      success: true,
      recipientsCount: tokens.length,
      affectedCount: totalAffected,
      message: feedbackMessage,
      tickets,
    });
  } catch (error) {
    console.error("[MONITORING_ALERT_MANAGERS] Error:", error);
    const message = error instanceof Error ? error.message : "Error al enviar alerta a gerentes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
