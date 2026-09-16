import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_BOT_ENGINE,
  normalizeBotEngine,
  type BotEngine,
} from "./bot-engine";
import {
  DEFAULT_AFTER_HOURS_PAYMENTS,
  DEFAULT_OFFICE_HOURS,
  parseAfterHoursPaymentsConfig,
  parseOfficeHoursConfig,
  resolveOfficeHoursFromEnv,
  type AfterHoursPaymentsConfig,
  type OfficeHoursConfig,
} from "./office-hours";
import {
  EMPTY_AI_RECOVERY_MESSAGES,
  parseAiRecoveryMessages,
  type AiRecoveryMessages,
} from "@/app/crm/_lib/ai-recovery-messages";
import { DEFAULT_AI_MODEL, isRetiredAiModel } from "@/app/crm/_lib/ai-models";
import {
  DEFAULT_CRM_ACCENT,
  parseCrmAccentId,
  type CrmAccentId,
} from "@/app/crm/_lib/crm-accents";

export type CrmSettings = {
  id: number;
  bot_engine: BotEngine;
  ai_model: string;
  ai_system_prompt: string | null;
  payment_success_message: string | null;
  ai_recovery_messages: AiRecoveryMessages;
  office_hours: OfficeHoursConfig;
  after_hours_payments: AfterHoursPaymentsConfig;
  ui_accent: CrmAccentId;
  updated_at: string | null;
  updated_by: number | null;
};


const resolveStoredAiModel = (value: unknown) => {
  const model =
    typeof value === "string" && value.trim()
      ? value.trim()
      : DEFAULT_AI_MODEL;
  if (isRetiredAiModel(model)) return DEFAULT_AI_MODEL;
  return model;
};

const DEFAULT_SETTINGS: CrmSettings = {
  id: 1,
  bot_engine: DEFAULT_BOT_ENGINE,
  ai_model: DEFAULT_AI_MODEL,
  ai_system_prompt: null,
  payment_success_message: null,
  ai_recovery_messages: { ...EMPTY_AI_RECOVERY_MESSAGES },
  office_hours: DEFAULT_OFFICE_HOURS,
  after_hours_payments: DEFAULT_AFTER_HOURS_PAYMENTS,
  ui_accent: DEFAULT_CRM_ACCENT,
  updated_at: null,
  updated_by: null,
};

const mapSettingsRow = (row: Record<string, unknown> | null): CrmSettings => {
  if (!row) {
    return {
      ...DEFAULT_SETTINGS,
      office_hours: resolveOfficeHoursFromEnv(),
    };
  }

  const officeFromDb =
    row.office_hours !== undefined && row.office_hours !== null
      ? parseOfficeHoursConfig(row.office_hours)
      : resolveOfficeHoursFromEnv();

  const afterHoursFromDb =
    row.after_hours_payments !== undefined && row.after_hours_payments !== null
      ? parseAfterHoursPaymentsConfig(row.after_hours_payments)
      : DEFAULT_AFTER_HOURS_PAYMENTS;

  return {
    id: Number(row.id) || 1,
    bot_engine: normalizeBotEngine(row.bot_engine),
    ai_model: resolveStoredAiModel(row.ai_model ?? row.gemini_model),
    ai_system_prompt:
      typeof row.ai_system_prompt === "string" ? row.ai_system_prompt : null,
    payment_success_message:
      typeof row.payment_success_message === "string"
        ? row.payment_success_message
        : null,
    ai_recovery_messages: parseAiRecoveryMessages(row.ai_recovery_messages),
    office_hours: officeFromDb,
    after_hours_payments: afterHoursFromDb,
    ui_accent: parseCrmAccentId(row.ui_accent),
    updated_at:
      typeof row.updated_at === "string" ? row.updated_at : null,
    updated_by:
      typeof row.updated_by === "number"
        ? row.updated_by
        : row.updated_by
          ? Number(row.updated_by)
          : null,
  };
};

export const getCrmSettings = async (
  supabase: SupabaseClient,
  organizationId?: string,
): Promise<CrmSettings> => {
  let query = supabase
    .from("crm_settings")
    .select("*");
  query = organizationId
    ? query.eq("organization_id", organizationId)
    : query.eq("id", 1);
  const { data, error } = await query.maybeSingle();

  if (error) {
    // Table may not exist yet before migration; fail soft to AI defaults.
    console.error("[crm_settings] load_failed", error.message);
    return {
      ...DEFAULT_SETTINGS,
      office_hours: resolveOfficeHoursFromEnv(),
    };
  }

  if (!data) {
    const seed = {
      ...(!organizationId ? { id: 1 } : {}),
      ...(organizationId ? { organization_id: organizationId } : {}),
      bot_engine: DEFAULT_BOT_ENGINE,
      ai_model: DEFAULT_AI_MODEL,
      updated_at: new Date().toISOString(),
    };
    const { data: inserted, error: insertError } = await supabase
      .from("crm_settings")
      .upsert(seed, {
        onConflict: organizationId ? "organization_id" : "id",
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("[crm_settings] seed_failed", insertError.message);
      return DEFAULT_SETTINGS;
    }

    return mapSettingsRow(inserted as Record<string, unknown>);
  }

  return mapSettingsRow(data as Record<string, unknown>);
};

export const updateCrmSettings = async (
  supabase: SupabaseClient,
  payload: {
    bot_engine?: BotEngine;
    ai_model?: string;
    ai_system_prompt?: string | null;
    payment_success_message?: string | null;
    ai_recovery_messages?: AiRecoveryMessages;
    office_hours?: OfficeHoursConfig;
    after_hours_payments?: AfterHoursPaymentsConfig;
    ui_accent?: CrmAccentId;
    updated_by?: number | null;
  },
  organizationId?: string,
): Promise<CrmSettings> => {
  const current = await getCrmSettings(supabase, organizationId);
  const nextOfficeHours = payload.office_hours
    ? parseOfficeHoursConfig(payload.office_hours)
    : current.office_hours;
  const nextAfterHours = payload.after_hours_payments
    ? parseAfterHoursPaymentsConfig(payload.after_hours_payments)
    : current.after_hours_payments;

  const next = {
    ...(!organizationId ? { id: 1 } : {}),
    ...(organizationId ? { organization_id: organizationId } : {}),
    bot_engine: payload.bot_engine ?? current.bot_engine,
    ai_model: payload.ai_model?.trim() || current.ai_model,
    ai_system_prompt:
      payload.ai_system_prompt === undefined
        ? current.ai_system_prompt
        : payload.ai_system_prompt,
    payment_success_message:
      payload.payment_success_message === undefined
        ? current.payment_success_message
        : payload.payment_success_message,
    ai_recovery_messages:
      payload.ai_recovery_messages === undefined
        ? current.ai_recovery_messages
        : parseAiRecoveryMessages(payload.ai_recovery_messages),
    office_hours: nextOfficeHours,
    after_hours_payments: nextAfterHours,
    updated_at: new Date().toISOString(),
    updated_by:
      payload.updated_by === undefined
        ? current.updated_by
        : payload.updated_by,
    ...(payload.ui_accent !== undefined
      ? { ui_accent: payload.ui_accent }
      : {}),
  };

  const { data, error } = await supabase
    .from("crm_settings")
    .upsert(next, {
      onConflict: organizationId ? "organization_id" : "id",
    })
    .select("*")
    .single();

  if (error) {
    // Soft message if migration not applied yet.
    if (
      /office_hours|after_hours_payments|ai_recovery_messages|ui_accent|column/i.test(
        error.message || "",
      )
    ) {
      throw new Error(
        "Falta una migración de ajustes en Supabase. Ejecuta supabase/migrations/20260817140000_crm_settings_office_hours.sql, supabase/migrations/20260827120000_ai_agent_reliability.sql y supabase/migrations/20260901140000_crm_ui_appearance.sql",
      );
    }
    throw error;
  }

  return mapSettingsRow(data as Record<string, unknown>);
};
