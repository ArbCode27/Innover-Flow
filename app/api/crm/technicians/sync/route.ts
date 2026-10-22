import { NextRequest, NextResponse } from "next/server";
import {
  canManageOrganization,
  CrmAuthError,
  getCrmAuthContext,
} from "@/app/api/crm/_lib/crm-auth-context";
import { upsertTechnician } from "@/app/api/crm/_lib/field-tickets";
import { decryptIntegrationSecret } from "@/app/api/crm/_lib/integration-secrets";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { getEmployees, isFieldEmployee } from "@/lib/wispro";

export const POST = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    if (!canManageOrganization(context)) {
      throw new CrmAuthError(
        "Solo un administrador puede sincronizar técnicos",
        403,
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: integ, error: integError } = await supabase
      .from("organization_integrations")
      .select("config, credentials_encrypted, status")
      .eq("organization_id", context.organizationId)
      .eq("provider", "wispro")
      .maybeSingle();
    if (integError) throw integError;

    if (integ?.status !== "connected" || !integ.credentials_encrypted) {
      return NextResponse.json(
        { error: "Conecta Wispro en Integraciones antes de sincronizar." },
        { status: 400 },
      );
    }

    const config = (integ.config || {}) as Record<string, unknown>;
    const employees = await getEmployees({
      apiKey: decryptIntegrationSecret(integ.credentials_encrypted),
      baseUrl: String(
        config.base_url || "https://www.cloud.wispro.co/api/v1",
      ),
    });

    const fieldEmployees = employees.filter(isFieldEmployee);
    const synced = [];
    for (const employee of fieldEmployees) {
      const row = await upsertTechnician(supabase, context.organizationId, {
        name: employee.name,
        phone: employee.phone_mobile || employee.phone || null,
        document: employee.national_identification_number || null,
        isSupervisor: Boolean(employee.is_supervisor),
        sourceEmployeeId: employee.id,
      });
      synced.push(row);
    }

    return NextResponse.json({
      ok: true,
      synced: synced.length,
      data: synced,
    });
  } catch (error) {
    if (error instanceof CrmAuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("[TECHNICIANS_SYNC]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron sincronizar los técnicos",
      },
      { status: 500 },
    );
  }
};
