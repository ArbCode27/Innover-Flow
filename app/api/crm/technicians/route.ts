import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  getCrmAuthContext,
} from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { listTechnicians } from "@/app/api/crm/_lib/field-tickets";

export const GET = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    const supabase = getSupabaseAdmin();
    const technicians = await listTechnicians(supabase, context.organizationId);
    return NextResponse.json({ data: technicians });
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
