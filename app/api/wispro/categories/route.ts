import { NextRequest, NextResponse } from "next/server";
import { getCategories, WisproCategory } from "@/lib/wispro";
import { getCrmAuthContext } from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { decryptIntegrationSecret } from "@/app/api/crm/_lib/integration-secrets";

// Caché en memoria del servidor con TTL de 10 minutos
let categoriesCache: { data: WisproCategory[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get("refresh") === "true";
    const now = Date.now();

    // Intentar resolver credenciales por organización si hay sesión activa
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
      // Sesión opcional: usar variables de entorno del servidor
    }

    if (!forceRefresh && categoriesCache && now - categoriesCache.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({
        data: categoriesCache.data,
        cached: true,
      });
    }

    const categories = await getCategories(override);
    categoriesCache = {
      data: categories,
      timestamp: now,
    };

    return NextResponse.json({
      data: categories,
      cached: false,
    });
  } catch (error) {
    console.error("[API_WISPRO_CATEGORIES_ERROR]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error al obtener categorías de Wispro",
      },
      { status: 500 },
    );
  }
}
