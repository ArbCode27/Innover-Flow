import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  getCrmAuthContext,
} from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { listTechnicians } from "@/app/api/crm/_lib/field-tickets";
import { decryptIntegrationSecret } from "@/app/api/crm/_lib/integration-secrets";
import { getEmployees, isFieldEmployee } from "@/lib/wispro";

export const GET = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    const supabase = getSupabaseAdmin();
    const technicians = await listTechnicians(supabase, context.organizationId);
    if (technicians.length) {
      return NextResponse.json({ data: technicians });
    }

    const { data: integ } = await supabase
      .from("organization_integrations")
      .select("config, credentials_encrypted, status")
      .eq("organization_id", context.organizationId)
      .eq("provider", "wispro")
      .maybeSingle();

    if (integ?.status !== "connected" || !integ.credentials_encrypted) {
      return NextResponse.json({ data: [] });
    }

    const config = (integ.config || {}) as Record<string, unknown>;
    const employees = await getEmployees({
      apiKey: decryptIntegrationSecret(integ.credentials_encrypted),
      baseUrl: String(
        config.base_url || "https://www.cloud.wispro.co/api/v1",
      ),
    });

    return NextResponse.json({
      data: employees.filter(isFieldEmployee).map((employee) => ({
        id: employee.id,
        organizationId: context.organizationId,
        name: employee.name,
        phone: employee.phone_mobile || employee.phone || null,
        document: employee.national_identification_number || null,
        isSupervisor: Boolean(employee.is_supervisor),
        sourceEmployeeId: employee.id,
      })),
    });
  } catch (error) {
    if (error instanceof CrmAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[TECHNICIANS]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar los técnicos" },
      { status: 500 },
    );
  }
};
