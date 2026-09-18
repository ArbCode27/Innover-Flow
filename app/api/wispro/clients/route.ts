import { NextRequest, NextResponse } from "next/server";
import { getClients } from "@/lib/wispro";
import { getCrmAuthContext } from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { decryptIntegrationSecret } from "@/app/api/crm/_lib/integration-secrets";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";

    let override: { apiKey?: string; baseUrl?: string } | undefined;
    try {
      const context = await getCrmAuthContext(req);
      if (context?.organizationId) {
        const { data: integ } = await getSupabaseAdmin()
          .from("organization_integrations")
          .select("config, credentials_encrypted, status")
          .eq("organization_id", context.organizationId)
          .eq("provider", "wispro")
          .maybeSingle();

        if (integ?.status === "connected" && integ.credentials_encrypted) {
          const config = (integ.config || {}) as Record<string, unknown>;
          override = {
            apiKey: decryptIntegrationSecret(integ.credentials_encrypted),
            baseUrl: String(config.base_url || "https://www.cloud.wispro.co/api/v1"),
          };
        }
      }
    } catch {
      // Sesión opcional
    }

    const clients = await getClients(search, override);
    return NextResponse.json({ data: clients });
  } catch (error) {
    console.error("[API_WISPRO_CLIENTS_ERROR]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error al buscar clientes en Wispro",
      },
      { status: 500 },
    );
  }
}
