import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { getCrmAuthContext } from "@/app/api/crm/_lib/crm-auth-context";
import { loadAppDeviceTokens, sendToClientDevices } from "@/lib/app-push";
import { buildExpoChatPushMessage } from "@/lib/expo-push";

const requestSchema = z.object({
  organizationId: z.string().optional(),
  zones: z.array(z.string().min(1)).min(1, "Debes seleccionar al menos una zona"),
  title: z.string().trim().min(1, "El título es obligatorio"),
  body: z.string().trim().min(1, "El mensaje es obligatorio"),
});

/**
 * POST /api/notifications
 * Body: { organizationId?: string, zones: string[], title: string, body: string }
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = requestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }

    const { zones, title, body } = parsed.data;

    let organizationId = parsed.data.organizationId;
    try {
      const context = await getCrmAuthContext(req);
      organizationId = context.organizationId;
    } catch {
      if (!organizationId) {
        return NextResponse.json(
          { error: "No autorizado. Sesión no válida o falta organizationId." },
          { status: 401 },
        );
      }
    }

    const supabase = getSupabaseAdmin();

    // 1️⃣ Obtener clientes filtrados por zona y organización
    const { data: clients, error: clientErr } = await supabase
      .from("clients")
      .select("id")
      .eq("organization_id", organizationId)
      .in("zone", zones);

    if (clientErr) {
      return NextResponse.json({ error: clientErr.message }, { status: 500 });
    }

    if (!clients?.length) {
      return NextResponse.json(
        { message: "No se encontraron clientes registrados en las zonas seleccionadas." },
        { status: 200 },
      );
    }

    // 2️⃣ Envío concurrente por lotes controlados
    const BATCH_SIZE = 10;
    let deliveredClients = 0;

    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
      const batch = clients.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async ({ id: clientId }) => {
          const tokens = await loadAppDeviceTokens(
            supabase,
            organizationId,
            Number(clientId),
          );

          if (!tokens.length) return;

          const messages = tokens.map((token: string) =>
            buildExpoChatPushMessage({
              token,
              conversationId: 0,
              messageId: 0,
              body: `${title}\n${body}`,
            }),
          );

          await sendToClientDevices(supabase, {
            organizationId,
            clientId: Number(clientId),
            messages,
            logContext: { kind: "mass_notification", zones },
          });

          deliveredClients += 1;
        }),
      );
    }

    return NextResponse.json(
      {
        message: `Notificación enviada a clientes con dispositivos vinculados (${deliveredClients} de ${clients.length} clientes encontrados).`,
        totalClients: clients.length,
        deliveredClients,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno del servidor" },
      { status: 500 },
    );
  }
}
