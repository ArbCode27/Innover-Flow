import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { getCrmAuthContext } from "@/app/api/crm/_lib/crm-auth-context";
import { loadAppDeviceTokens, sendToClientDevices } from "@/lib/app-push";
import { buildExpoChatPushMessage } from "@/lib/expo-push";

const requestSchema = z.object({
  organizationId: z.string().optional(),
  board: z.coerce.number().int({ message: "El board (tarjeta/slot) es obligatorio" }),
  port: z.coerce.number().int({ message: "El port (puerto PON) es obligatorio" }),
  title: z.string().trim().min(1, "El título es obligatorio"),
  body: z.string().trim().min(1, "El mensaje es obligatorio"),
});

/**
 * POST /api/notifications
 * Body: { organizationId?: string, board: number, port: number, title: string, body: string }
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

    const { board, port, title, body } = parsed.data;

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

    // 1️⃣ Buscar ONUs registradas en el board y port indicados
    const { data: onus, error: onuErr } = await supabase
      .from("client_onus")
      .select("client_id")
      .eq("board", board)
      .eq("port", port);

    if (onuErr) {
      return NextResponse.json({ error: onuErr.message }, { status: 500 });
    }

    const clientIds = Array.from(
      new Set((onus || []).map((row) => row.client_id).filter(Boolean)),
    );

    if (!clientIds.length) {
      return NextResponse.json(
        {
          message: `No se encontraron ONUs registradas en Board ${board}, Port ${port}.`,
          totalClients: 0,
          deliveredClients: 0,
        },
        { status: 200 },
      );
    }

    // 2️⃣ Filtrar clientes de la organización actual
    const { data: clients, error: clientErr } = await supabase
      .from("clients")
      .select("id")
      .eq("organization_id", organizationId)
      .in("id", clientIds);

    if (clientErr) {
      return NextResponse.json({ error: clientErr.message }, { status: 500 });
    }

    if (!clients?.length) {
      return NextResponse.json(
        {
          message: `No hay clientes de esta organización vinculados al Board ${board}, Port ${port}.`,
          totalClients: 0,
          deliveredClients: 0,
        },
        { status: 200 },
      );
    }

    // 3️⃣ Envío concurrente por lotes controlados
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
            logContext: { kind: "mass_notification", board, port },
          });

          deliveredClients += 1;
        }),
      );
    }

    return NextResponse.json(
      {
        message: `Notificación enviada a clientes en Board ${board}, Port ${port} (${deliveredClients} de ${clients.length} clientes con dispositivos vinculados).`,
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
