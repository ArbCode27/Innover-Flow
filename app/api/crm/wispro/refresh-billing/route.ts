import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { refreshClientBillingFromWispro } from "@/app/api/crm/_lib/wispro-billing-refresh";
import { withOrganizationWispro } from "@/app/api/crm/_lib/wispro-api";
import { getCrmAuthContext } from "../../_lib/crm-auth-context";

const LOG_PREFIX = "[WISPRO_REFRESH_BILLING]";

const bodySchema = z.object({
  clientId: z.coerce.number().int().positive(),
  force: z.boolean().optional(),
});

const getServerEnv = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
};

export async function POST(req: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const context = await getCrmAuthContext(req);
    const supabase = createClient(
      getServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, name, wispro_id, envoicing")
      .eq("id", parsed.data.clientId)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (clientError) {
      console.error(`${LOG_PREFIX} client_lookup_failed`, clientError);
      return NextResponse.json(
        { error: "No se pudo cargar el cliente" },
        { status: 500 },
      );
    }

    if (!client) {
      return NextResponse.json(
        { error: "Cliente no encontrado" },
        { status: 404 },
      );
    }

    if (!String(client.wispro_id || "").trim()) {
      return NextResponse.json(
        { error: "El cliente no está vinculado a Wispro" },
        { status: 400 },
      );
    }

    const result = await withOrganizationWispro(
      context.organizationId,
      () =>
        refreshClientBillingFromWispro({
          supabase,
          clientId: client.id,
          wisproId: client.wispro_id,
          envoicing: client.envoicing,
          clientName: client.name,
          force: parsed.data.force ?? true,
        }),
    );

    const { data: refreshedClient } = await supabase
      .from("clients")
      .select("id, name, account, wispro_id, envoicing, zone, plan")
      .eq("id", client.id)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    return NextResponse.json({
      ...result,
      client: refreshedClient,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Missing environment")
    ) {
      console.error(`${LOG_PREFIX} config`, error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.error(`${LOG_PREFIX} unexpected`, error);
    return NextResponse.json(
      { error: "No se pudo refrescar el estado de facturación" },
      { status: 500 },
    );
  }
}
