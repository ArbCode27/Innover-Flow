import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadAppDeviceTokens, sendToClientDevices } from "@/lib/app-push";
import { buildExpoChatPushMessage } from "@/lib/expo-push";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/notifications
 * Body: { organizationId: string, zones: string[], title: string, body: string }
 */
export async function POST(req: NextRequest) {
  const { organizationId, zones, title, body } = await req.json();

  // 1️⃣  Obtener clientes filtrados por zona
  const { data: clients, error: clientErr } = await supabase
    .from("clients")
    .select("id")
    .eq("organization_id", organizationId)
    .in("zone", zones);

  if (clientErr) {
    return new Response(JSON.stringify({ error: clientErr.message }), { status: 500 });
  }

  if (!clients?.length) {
    return new Response(
      JSON.stringify({ message: "No hay clientes para esas zonas." }),
      { status: 200 }
    );
  }

  // 2️⃣  Envío en paralelo (límite de concurrencia)
  const MAX_CONCURRENCY = 10;
  const pending: Promise<void>[] = [];

  for (const { id: clientId } of clients) {
    const task = (async () => {
      const tokens = await loadAppDeviceTokens(
        supabase,
        organizationId,
        Number(clientId)
      );

      const messages = tokens.map((token) =>
        buildExpoChatPushMessage({
          token,
          conversationId: 0,
          messageId: 0,
          body: `${title}\n${body}`,
        })
      );

      await sendToClientDevices(supabase, {
        organizationId,
        clientId: Number(clientId),
        messages,
        logContext: { kind: "mass_notification", zones },
      });
    })();

    pending.push(task);
    if (pending.length >= MAX_CONCURRENCY) {
      await Promise.race(pending);
    }
  }

  await Promise.all(pending);

  return new Response(
    JSON.stringify({ message: `Enviadas a ${clients.length} clientes.` }),
    { status: 200 }
  );
}
