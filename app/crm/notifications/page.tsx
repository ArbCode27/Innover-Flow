// Server component – carga zonas únicas y muestra el formulario de notificaciones masivas

import { createClient } from "@supabase/supabase-js";
import { NewMassNotificationForm } from "./NewMassNotificationForm";

export default async function NotificationsPage() {
  // Cliente Supabase con clave anón (solo lectura)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_ANON_KEY!
  );

  // Obtener todas las zonas distintas de la tabla clients
  const { data: zones } = await supabase
    .from("clients")
    .select("zone")
    .neq("zone", null)
    .group("zone");

  const zoneOptions = (zones ?? []).map((row) => ({
    label: row.zone as string,
    value: row.zone as string,
  }));

  return (
    <section className="max-w-4xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-4">Notificaciones masivas</h1>
      <NewMassNotificationForm zoneOptions={zoneOptions} />
    </section>
  );
}
