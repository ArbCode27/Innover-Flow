import { NextRequest, NextResponse } from "next/server";
import { getCrmAuthContext } from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { loadManagerDeviceTokens } from "@/lib/network-incident-alerts";
import {
  buildExpoIncidentPushMessage,
  sendExpoPushMessages,
  type ExpoPushMessage,
} from "@/lib/expo-push";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/monitoring/test-alert
 * Envía una alerta de prueba a los dispositivos móviles (Expo) de los gerentes/supervisores.
 */
export async function POST(req: NextRequest) {
  try {
    const context = await getCrmAuthContext(req);
    const body = await req.json().catch(() => ({}));
    const board = Number(body.board ?? 1);
    const port = Number(body.port ?? 1);

    const supabase = getSupabaseAdmin();
    const tokens = await loadManagerDeviceTokens(supabase, context.organizationId);

    if (tokens.length === 0) {
      return NextResponse.json(
        {
          success: false,
          recipientsCount: 0,
          message:
            "No hay dispositivos de gerentes o supervisores vinculados en la app móvil. Inicia sesión en la app como supervisor para registrar tu dispositivo.",
        },
        { status: 404 },
      );
    }

    const messages: ExpoPushMessage[] = tokens.map((token) =>
      buildExpoIncidentPushMessage({
        token,
        title: `🚨 [PRUEBA] ALERTA PON: Tarjeta ${board} / Puerto ${port}`,
        body: `⚠️ Alerta de prueba de monitoreo: 3 clientes afectados en Tarjeta ${board}, Puerto PON ${port}. Sistema de alerta temprana operativo.`,
        board,
        port,
        incidentType: "massive_outage",
        affectedCount: 3,
        losCount: 3,
        alteredCount: 0,
      }),
    );

    const tickets = await sendExpoPushMessages(messages);

    return NextResponse.json({
      success: true,
      recipientsCount: tokens.length,
      message: `Alerta de prueba enviada a ${tokens.length} dispositivo(s) de gerentes/supervisores.`,
      tickets,
    });
  } catch (error) {
    console.error("[MONITORING_TEST_ALERT] Error:", error);
    const message = error instanceof Error ? error.message : "Error al enviar alerta de prueba";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
