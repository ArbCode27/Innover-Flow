import { NextRequest, NextResponse } from "next/server";
import { getCrmAuthContext, CrmAuthError } from "../../_lib/crm-auth-context";
import { getSupabaseAdmin } from "../../_lib/supabase-admin";

export const GET = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    const supabase = getSupabaseAdmin();

    const [{ data: agent, error: agentError }, { data: organization, error: organizationError }] =
      await Promise.all([
        supabase
          .from("agents")
          .select(
            "id, organization_id, name, email, role, department, status, initials, avatar_color, avatar_bg, max_conversations, ui_accent, ui_mode, created_at, updated_at",
          )
          .eq("id", context.agentId)
          .maybeSingle(),
        supabase
          .from("organizations")
          .select("*")
          .eq("id", context.organizationId)
          .maybeSingle(),
      ]);

    if (agentError || organizationError || !agent || !organization) {
      return NextResponse.json(
        { error: "No se pudo restaurar la sesión" },
        { status: 404 },
      );
    }

    const safeAgent = {
      ...agent,
      department: agent.department || "soporte",
    };

    return NextResponse.json({
      agent: safeAgent,
      organization,
      organizationRole: context.organizationRole,
    });
  } catch (error) {
    if (error instanceof CrmAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "No se pudo validar la sesión" },
      { status: 500 },
    );
  }
};
