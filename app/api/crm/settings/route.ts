import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { AI_SYSTEM_PROMPT_MAX_LENGTH } from "@/app/crm/_lib/ai-default-prompt";
import { PAYMENT_SUCCESS_MESSAGE_MAX_LENGTH } from "@/app/crm/_lib/payment-success-message";
import { AI_RECOVERY_MESSAGE_MAX_LENGTH } from "@/app/crm/_lib/ai-recovery-messages";
import { getSupabaseAdmin } from "../_lib/supabase-admin";
import { getCrmSettings, updateCrmSettings } from "../_lib/crm-settings";
import {
  canManageOrganization,
  getCrmAuthContext,
} from "../_lib/crm-auth-context";
import {
  DEFAULT_AFTER_HOURS_PAYMENT_TOOLS,
  parseAfterHoursPaymentsConfig,
  parseOfficeHoursConfig,
} from "../_lib/office-hours";

const timeWindowSchema = z.tuple([
  z.string().regex(/^\d{1,2}:\d{2}$/, "Hora inválida"),
  z.string().regex(/^\d{1,2}:\d{2}$/, "Hora inválida"),
]);

const weekdayWindowsSchema = z.array(timeWindowSchema);

const officeHoursSchema = z.object({
  enabled: z.boolean(),
  timezone: z.string().trim().min(1).max(80),
  days: z.object({
    mon: weekdayWindowsSchema,
    tue: weekdayWindowsSchema,
    wed: weekdayWindowsSchema,
    thu: weekdayWindowsSchema,
    fri: weekdayWindowsSchema,
    sat: weekdayWindowsSchema,
    sun: weekdayWindowsSchema,
  }),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

const recoveryMessageSchema = z
  .string()
  .max(
    AI_RECOVERY_MESSAGE_MAX_LENGTH,
    `El mensaje no puede superar ${AI_RECOVERY_MESSAGE_MAX_LENGTH} caracteres`,
  )
  .nullable();

const aiRecoveryMessagesSchema = z.object({
  ack: recoveryMessageSchema,
  soft_hold: recoveryMessageSchema,
  hard_fallback: recoveryMessageSchema,
});

const afterHoursPaymentsSchema = z.object({
  enabled: z.boolean(),
  allowedTools: z.array(z.string().trim().min(1)).min(1).optional(),
});

const updateSchema = z
  .object({
    agent_id: z.coerce.number().int().positive("agent_id es requerido"),
    ai_model: z.string().trim().min(1).max(120).optional(),
    ai_system_prompt: z
      .string()
      .max(
        AI_SYSTEM_PROMPT_MAX_LENGTH,
        `El prompt no puede superar ${AI_SYSTEM_PROMPT_MAX_LENGTH} caracteres`,
      )
      .nullable()
      .optional(),
    payment_success_message: z
      .string()
      .max(
        PAYMENT_SUCCESS_MESSAGE_MAX_LENGTH,
        `El mensaje no puede superar ${PAYMENT_SUCCESS_MESSAGE_MAX_LENGTH} caracteres`,
      )
      .nullable()
      .optional(),
    ai_recovery_messages: aiRecoveryMessagesSchema.optional(),
    office_hours: officeHoursSchema.optional(),
    after_hours_payments: afterHoursPaymentsSchema.optional(),
  })
  .refine(
    (value) =>
      value.ai_model !== undefined ||
      value.ai_system_prompt !== undefined ||
      value.payment_success_message !== undefined ||
      value.ai_recovery_messages !== undefined ||
      value.office_hours !== undefined ||
      value.after_hours_payments !== undefined,
    { message: "Debes enviar al menos un campo para actualizar" },
  );

const assertAdminAgent = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  agentId: number,
) => {
  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id, role")
    .eq("id", agentId)
    .maybeSingle();

  if (agentError) {
    return {
      error: NextResponse.json(
        { error: "No se pudo validar el agente" },
        { status: 500 },
      ),
    } as const;
  }

  if (!agent) {
    return {
      error: NextResponse.json({ error: "Agente no encontrado" }, { status: 404 }),
    } as const;
  }

  const role = String(agent.role || "").toLowerCase();
  if (role !== "admin" && role !== "administrador") {
    return {
      error: NextResponse.json(
        { error: "Solo un administrador puede cambiar los ajustes" },
        { status: 403 },
      ),
    } as const;
  }

  return { agent } as const;
};

export async function GET(req: NextRequest) {
  try {
    const context = await getCrmAuthContext(req);
    const supabase = getSupabaseAdmin();
    const settings = await getCrmSettings(supabase, context.organizationId);
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[CRM_SETTINGS] get_failed", error);
    return NextResponse.json(
      { error: "No se pudieron cargar los ajustes" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const payload = updateSchema.safeParse(await req.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const context = await getCrmAuthContext(req);
    if (
      context.agentId !== payload.data.agent_id ||
      !canManageOrganization(context)
    ) {
      return NextResponse.json(
        { error: "No tienes permiso para cambiar estos ajustes" },
        { status: 403 },
      );
    }

    const officeHours = payload.data.office_hours
      ? parseOfficeHoursConfig(payload.data.office_hours)
      : undefined;

    const afterHoursPayments = payload.data.after_hours_payments
      ? parseAfterHoursPaymentsConfig({
          enabled: payload.data.after_hours_payments.enabled,
          allowedTools:
            payload.data.after_hours_payments.allowedTools ||
            [...DEFAULT_AFTER_HOURS_PAYMENT_TOOLS],
        })
      : undefined;

    const settings = await updateCrmSettings(supabase, {
      ai_model: payload.data.ai_model,
      ai_system_prompt:
        typeof payload.data.ai_system_prompt === "string"
          ? payload.data.ai_system_prompt.trim() || null
          : payload.data.ai_system_prompt,
      payment_success_message:
        typeof payload.data.payment_success_message === "string"
          ? payload.data.payment_success_message.trim() || null
          : payload.data.payment_success_message,
      ai_recovery_messages: payload.data.ai_recovery_messages
        ? {
            ack: payload.data.ai_recovery_messages.ack?.trim() || null,
            soft_hold:
              payload.data.ai_recovery_messages.soft_hold?.trim() || null,
            hard_fallback:
              payload.data.ai_recovery_messages.hard_fallback?.trim() || null,
          }
        : undefined,
      office_hours: officeHours,
      after_hours_payments: afterHoursPayments,
      updated_by: payload.data.agent_id,
    }, context.organizationId);

    if (
      payload.data.ai_model !== undefined ||
      payload.data.ai_system_prompt !== undefined
    ) {
      try {
        await supabase.from("crm_settings_history").insert({
          organization_id: context.organizationId,
          changed_by: payload.data.agent_id,
          ai_model: payload.data.ai_model ?? settings.ai_model,
          ai_system_prompt:
            payload.data.ai_system_prompt ?? settings.ai_system_prompt,
        });
      } catch (historyError) {
        console.warn("[CRM_SETTINGS] history_insert_soft_failed", historyError);
      }
    }

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[CRM_SETTINGS] update_failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron guardar los ajustes",
      },
      { status: 500 },
    );
  }
}
