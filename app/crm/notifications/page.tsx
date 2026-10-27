import { cookies } from "next/headers";
import { CRM_SESSION_COOKIE, verifySignedSessionToken } from "@/app/api/crm/_lib/crm-session";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { NewMassNotificationForm } from "./NewMassNotificationForm";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(CRM_SESSION_COOKIE)?.value;
  const session = await verifySignedSessionToken(token);

  let zoneOptions: { label: string; value: string }[] = [];

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("clients")
      .select("zone")
      .not("zone", "is", null);

    if (session?.organizationId) {
      query = query.eq("organization_id", session.organizationId);
    }

    const { data: clients, error } = await query;

    if (error) {
      console.warn("[NOTIFICATIONS_PAGE] zones lookup failed:", error.message);
    } else if (clients) {
      const distinctZones = Array.from(
        new Set(
          clients
            .map((row: { zone: string | null }) => String(row.zone || "").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b));

      zoneOptions = distinctZones.map((zone) => ({
        label: zone,
        value: zone,
      }));
    }
  } catch (error) {
    console.warn("[NOTIFICATIONS_PAGE] unexpected error loading zones:", error);
  }

  return (
    <section className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Notificaciones masivas
        </h1>
        <p className="text-sm text-muted-foreground">
          Envía notificaciones push segmentadas por zona geográfica a los dispositivos móviles vinculados de tus clientes.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Difusión por zonas
            </h2>
            <p className="text-sm text-muted-foreground">
              {zoneOptions.length > 0
                ? `${zoneOptions.length} zona(s) disponibles para difusión.`
                : "No hay zonas registradas para clientes de esta organización."}
            </p>
          </div>
          <NewMassNotificationForm
            zoneOptions={zoneOptions}
            organizationId={session?.organizationId}
          />
        </div>
      </div>
    </section>
  );
}
