import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  CRM_ACCENT_IDS,
  CRM_COLOR_MODES,
  parseCrmAccentId,
} from "@/app/crm/_lib/crm-accents";
import { getCrmSettings, updateCrmSettings } from "../_lib/crm-settings";
import { isAdminRole } from "@/app/crm/_lib/agent-role-utils";
import { getSupabaseAdmin } from "../_lib/supabase-admin";
import {
  canManageOrganization,
  getCrmAuthContext,
} from "../_lib/crm-auth-context";

const updateSchema = z
  .object({
    agent_id: z.coerce.number().int().positive("agent_id es requerido"),
    ui_accent: z.enum(CRM_ACCENT_IDS).optional(),
    ui_mode: z.enum(CRM_COLOR_MODES).optional(),
    office_ui_accent: z.enum(CRM_ACCENT_IDS).optional(),
  })
  .refine(
    (value) =>
      value.ui_accent !== undefined ||
      value.ui_mode !== undefined ||
      value.office_ui_accent !== undefined,
    { message: "Debes enviar al menos un campo de apariencia" },
  );

const missingColumnError = (message: string) =>
  /ui_accent|ui_mode|column/i.test(message);

export async function PATCH(req: NextRequest) {
  try {
    const payload = updateSchema.safeParse(await req.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const context = await getCrmAuthContext(req);
    if (context.agentId !== payload.data.agent_id) {
      return NextResponse.json({ error: "Agente inválido" }, { status: 403 });
    }
    const supabase = getSupabaseAdmin();
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, role")
      .eq("id", payload.data.agent_id)
      .eq("organization_id", context.organizationId)
      .maybeSingle();

    if (agentError) {
      if (missingColumnError(agentError.message || "")) {
        return NextResponse.json(
          {
            error:
              "Falta la migración de apariencia. Ejecuta supabase/migrations/20260901140000_crm_ui_appearance.sql en Supabase.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: "No se pudo validar el agente" },
        { status: 500 },
      );
    }

    if (!agent) {
      return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
    }

    if (
      payload.data.office_ui_accent !== undefined &&
      (!isAdminRole(String(agent.role || "")) ||
        !canManageOrganization(context))
    ) {
      return NextResponse.json(
        { error: "Solo un administrador puede cambiar el tema predeterminado" },
        { status: 403 },
      );
    }

    const agentPatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (payload.data.ui_accent !== undefined) {
      agentPatch.ui_accent = payload.data.ui_accent;
    }
    if (payload.data.ui_mode !== undefined) {
      agentPatch.ui_mode = payload.data.ui_mode;
    }

    if (payload.data.ui_accent !== undefined || payload.data.ui_mode !== undefined) {
      const { error: updateError } = await supabase
        .from("agents")
        .update(agentPatch)
        .eq("id", payload.data.agent_id)
        .eq("organization_id", context.organizationId);

      if (updateError) {
        if (missingColumnError(updateError.message || "")) {
          return NextResponse.json(
            {
              error:
                "Falta la migración de apariencia. Ejecuta supabase/migrations/20260901140000_crm_ui_appearance.sql en Supabase.",
            },
            { status: 503 },
          );
        }
        throw updateError;
      }
    }

    let officeAccent = parseCrmAccentId(
      (await getCrmSettings(supabase, context.organizationId)).ui_accent,
    );
    if (payload.data.office_ui_accent !== undefined) {
      const settings = await updateCrmSettings(supabase, {
        ui_accent: payload.data.office_ui_accent,
        updated_by: payload.data.agent_id,
      }, context.organizationId);
      officeAccent = parseCrmAccentId(settings.ui_accent);
    }

    return NextResponse.json({
      ui_accent: payload.data.ui_accent,
      ui_mode: payload.data.ui_mode,
      office_ui_accent: officeAccent,
    });
  } catch (error) {
    console.error("[CRM_APPEARANCE] update_failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo guardar la apariencia",
      },
      { status: 500 },
    );
  }
}
