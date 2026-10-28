import { cookies } from "next/headers";
import { CRM_SESSION_COOKIE, verifySignedSessionToken } from "@/app/api/crm/_lib/crm-session";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import type { BoardPortTarget } from "@/app/crm/_lib/types";
import { NewMassNotificationForm } from "./NewMassNotificationForm";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(CRM_SESSION_COOKIE)?.value;
  const session = await verifySignedSessionToken(token);

  let targetOptions: BoardPortTarget[] = [];

  try {
    const supabase = getSupabaseAdmin();
    let clientQuery = supabase.from("clients").select("id");

    if (session?.organizationId) {
      clientQuery = clientQuery.eq("organization_id", session.organizationId);
    }

    const { data: clients, error: clientErr } = await clientQuery;

    if (!clientErr && clients?.length) {
      const clientIds = clients.map((c) => c.id);
      const { data: onus } = await supabase
        .from("client_onus")
        .select("board, port, client_id")
        .in("client_id", clientIds)
        .not("board", "is", null)
        .not("port", "is", null);

      if (onus) {
        const groups = new Map<string, { board: number; port: number; clientIds: Set<number> }>();
        for (const item of onus) {
          if (item.board == null || item.port == null) continue;
          const key = `${item.board}:${item.port}`;
          const group = groups.get(key) || {
            board: Number(item.board),
            port: Number(item.port),
            clientIds: new Set<number>(),
          };
          if (item.client_id) {
            group.clientIds.add(Number(item.client_id));
          }
          groups.set(key, group);
        }

        targetOptions = Array.from(groups.values())
          .map((g) => ({
            board: g.board,
            port: g.port,
            clientCount: g.clientIds.size,
          }))
          .sort((a, b) => a.board - b.board || a.port - b.port);
      }
    }
  } catch (error) {
    console.warn("[NOTIFICATIONS_PAGE] unexpected error loading targets:", error);
  }

  return (
    <section className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Notificaciones masivas
        </h1>
        <p className="text-sm text-muted-foreground">
          Envía notificaciones push segmentadas por Board (Tarjeta) y Port (Puerto PON) de Smart OLT a los dispositivos móviles vinculados de tus clientes.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Difusión por Smart OLT (Board & Port)
            </h2>
            <p className="text-sm text-muted-foreground">
              {targetOptions.length > 0
                ? `${targetOptions.length} combinación(es) de Board/Port detectadas con clientes.`
                : "Aún no hay ONUs con Board y Port registradas para clientes de esta organización."}
            </p>
          </div>
          <NewMassNotificationForm
            targetOptions={targetOptions}
            organizationId={session?.organizationId}
          />
        </div>
      </div>
    </section>
  );
}
