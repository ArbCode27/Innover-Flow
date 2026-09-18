import { NextRequest, NextResponse } from "next/server";
import { getEmployees, WisproEmployee } from "@/lib/wispro";
import { getCrmAuthContext } from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { decryptIntegrationSecret } from "@/app/api/crm/_lib/integration-secrets";
import fs from "fs";
import path from "path";

let employeesCache: { data: WisproEmployee[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

const getTecnicosWhitelist = (): string[] => {
  try {
    const configPath = path.join(process.cwd(), "config", "tecnicos.json");
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        return list.map((id) => String(id).toLowerCase().trim());
      }
    }
  } catch (err) {
    console.warn("[WISPRO_EMPLOYEES] No se pudo leer config/tecnicos.json", err);
  }
  return [];
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get("refresh") === "true";
    const showAll = searchParams.get("all") === "true";
    const now = Date.now();

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

    let allEmployees: WisproEmployee[];

    if (!forceRefresh && employeesCache && now - employeesCache.timestamp < CACHE_TTL_MS) {
      allEmployees = employeesCache.data;
    } else {
      allEmployees = await getEmployees(override);
      employeesCache = {
        data: allEmployees,
        timestamp: now,
      };
    }

    const whitelist = getTecnicosWhitelist();
    const isFiltered = !showAll && whitelist.length > 0;

    const filteredEmployees = isFiltered
      ? allEmployees.filter((emp) => whitelist.includes(String(emp.id).toLowerCase().trim()))
      : allEmployees;

    return NextResponse.json({
      data: filteredEmployees,
      cached: Boolean(employeesCache && now - employeesCache.timestamp < CACHE_TTL_MS && !forceRefresh),
      isFiltered,
      total: allEmployees.length,
      whitelistCount: whitelist.length,
    });
  } catch (error) {
    console.error("[API_WISPRO_EMPLOYEES_ERROR]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error al obtener empleados de Wispro",
      },
      { status: 500 },
    );
  }
}
