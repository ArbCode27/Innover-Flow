import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { getCrmAuthContext } from "@/app/api/crm/_lib/crm-auth-context";
import { loadAppDeviceTokens, sendToClientDevices } from "@/lib/app-push";
import { buildExpoChatPushMessage } from "@/lib/expo-push";

const groupSchema = z.object({
  board: z.coerce.number().int({ message: "El board (tarjeta) debe ser un entero" }).min(0),
  port: z.coerce.number().int({ message: "El port (puerto PON) debe ser un entero" }).min(0),
  status: z
    .enum(["all", "los", "online", "power_fail", "offline", "altered_power"])
    .optional()
    .default("all"),
});

const requestSchema = z.object({
  organizationId: z.string().optional(),
  title: z.string().trim().min(1, "El título es obligatorio"),
  body: z.string().trim().min(1, "El mensaje es obligatorio"),
  groups: z.array(groupSchema).min(1).optional(),
  // Retrocompatibilidad con payload simple previo
  board: z.coerce.number().int().optional(),
  port: z.coerce.number().int().optional(),
  status: z.string().optional(),
});

export type MassNotificationGroup = z.infer<typeof groupSchema>;

/**
 * POST /api/notifications
 * Envío de difusión masiva push segmentada por múltiples grupos (Board, Port, Status).
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = requestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos de segmentación inválidos" },
        { status: 400 },
      );
    }

    const { title, body } = parsed.data;

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

    // Normalizar grupos a procesar
    const targetGroups: MassNotificationGroup[] = [];
    if (parsed.data.groups && parsed.data.groups.length > 0) {
      targetGroups.push(...parsed.data.groups);
    } else if (parsed.data.board != null && parsed.data.port != null) {
      targetGroups.push({
        board: parsed.data.board,
        port: parsed.data.port,
        status: (parsed.data.status as MassNotificationGroup["status"]) || "all",
      });
    } else {
      return NextResponse.json(
        { error: "Debe especificar al menos un grupo con Tarjeta y Puerto." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    // 1️⃣ Buscar ONUs y filtrar según criterios de cada grupo
    const matchingClientIds = new Set<number>();

    await Promise.all(
      targetGroups.map(async (group) => {
        const { data: onus, error: onuErr } = await supabase
          .from("client_onus")
          .select("client_id, status, rx_signal")
          .eq("board", group.board)
          .eq("port", group.port);

        if (onuErr) {
          console.warn(
            `[MASS_NOTIFICATIONS] Error consultando client_onus B${group.board}:P${group.port}:`,
            onuErr.message,
          );
          return;
        }

        for (const onu of onus || []) {
          if (!onu.client_id) continue;
          const statusLower = (onu.status || "").toLowerCase().trim();
          const rxSignal = onu.rx_signal != null ? Number(onu.rx_signal) : null;

          let matches = false;
          switch (group.status) {
            case "all":
              matches = true;
              break;
            case "los":
              matches = statusLower === "los" || statusLower.includes("loss");
              break;
            case "online":
              matches = statusLower === "online" && (rxSignal === null || rxSignal > -29.0);
              break;
            case "power_fail":
              matches = statusLower === "power fail" || statusLower.includes("power");
              break;
            case "offline":
              matches = statusLower === "offline";
              break;
            case "altered_power":
              matches = rxSignal !== null && rxSignal <= -29.0;
              break;
            default:
              matches = true;
          }

          if (matches) {
            matchingClientIds.add(Number(onu.client_id));
          }
        }
      }),
    );

    const clientIds = Array.from(matchingClientIds);

    if (!clientIds.length) {
      return NextResponse.json(
        {
          message:
            "No se encontraron ONUs de clientes que coincidan con los grupos y estados seleccionados.",
          totalClients: 0,
          deliveredClients: 0,
          groupsCount: targetGroups.length,
        },
        { status: 200 },
      );
    }

    // 2️⃣ Filtrar clientes que pertenezcan a la organización autenticada
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
          message:
            "No hay clientes de esta organización vinculados a los grupos y estados seleccionados.",
          totalClients: 0,
          deliveredClients: 0,
          groupsCount: targetGroups.length,
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
            logContext: {
              kind: "mass_notification",
              groupsCount: targetGroups.length,
              boards: Array.from(new Set(targetGroups.map((g) => g.board))),
              ports: Array.from(new Set(targetGroups.map((g) => g.port))),
            },
          });

          deliveredClients += 1;
        }),
      );
    }

    const targetSummary =
      targetGroups.length === 1
        ? `Tarjeta ${targetGroups[0].board}, Puerto ${targetGroups[0].port}`
        : `${targetGroups.length} grupos de red`;

    return NextResponse.json(
      {
        message: `Notificación masiva enviada a clientes en ${targetSummary} (${deliveredClients} de ${clients.length} clientes con app vinculada).`,
        totalClients: clients.length,
        deliveredClients,
        groupsCount: targetGroups.length,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[MASS_NOTIFICATIONS] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno del servidor" },
      { status: 500 },
    );
  }
}
