import type { SupabaseClient } from "@supabase/supabase-js";

export type CrmAutoLabelKey =
  | "verificar_pago"
  | "pagado_api"
  | "soporte"
  | "ia_error";

const LOG_PREFIX = "[CRM_LABELS]";

const LABEL_ENV_KEYS: Record<CrmAutoLabelKey, string> = {
  verificar_pago: "CRM_LABEL_VERIFICAR_PAGO_ID",
  pagado_api: "CRM_LABEL_PAGADO_API_ID",
  soporte: "CRM_LABEL_SOPORTE_ID",
  ia_error: "CRM_LABEL_IA_ERROR_ID",
};

/** Name fallbacks when env ID is not set (matched case-insensitive). */
const LABEL_NAME_CANDIDATES: Record<CrmAutoLabelKey, string[]> = {
  verificar_pago: ["verificar pago", "verificar_pago", "verificacion de pago"],
  pagado_api: ["pagado api", "pagado_api", "pago api"],
  soporte: ["soporte", "soporte tecnico", "soporte técnico", "falla tecnica"],
  ia_error: [
    "ia error",
    "error ia",
    "ia_error",
    "requiere asesor",
    "requiere_asesor",
  ],
};

const normalizeLabelName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const parseLabelId = (raw: string | undefined): number | null => {
  if (!raw?.trim()) return null;
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const resolveLabelIdFromEnv = (key: CrmAutoLabelKey): number | null =>
  parseLabelId(process.env[LABEL_ENV_KEYS[key]]);

const resolveLabelIdByName = async (
  supabase: SupabaseClient,
  key: CrmAutoLabelKey,
  organizationId: string,
): Promise<number | null> => {
  const { data, error } = await supabase
    .from("labels")
    .select("id, name")
    .eq("organization_id", organizationId)
    .order("id", { ascending: true });

  if (error) {
    console.warn(`${LOG_PREFIX} labels_query_failed`, {
      key,
      error: error.message,
    });
    return null;
  }

  const candidates = new Set(
    LABEL_NAME_CANDIDATES[key].map((name) => normalizeLabelName(name)),
  );

  const match = (data || []).find((label) =>
    candidates.has(normalizeLabelName(String(label.name || ""))),
  );

  return match?.id ?? null;
};

export const resolveAutoLabelId = async (
  supabase: SupabaseClient,
  key: CrmAutoLabelKey,
  organizationId: string,
): Promise<number | null> => {
  const fromEnv = resolveLabelIdFromEnv(key);
  if (fromEnv) {
    const { data } = await supabase
      .from("labels")
      .select("id")
      .eq("id", fromEnv)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (data) return fromEnv;
  }
  return resolveLabelIdByName(supabase, key, organizationId);
};

const readConversationLabelIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((id) => Number.isFinite(id) && id > 0);
};

/**
 * Appends a label to conversation.label_ids without duplicates.
 * Soft-fails (logs) if the label cannot be resolved or the update fails.
 */
export const ensureConversationLabel = async (
  supabase: SupabaseClient,
  conversationId: number,
  key: CrmAutoLabelKey,
): Promise<{ applied: boolean; labelId: number | null }> => {
  const { data: conversation, error: readError } = await supabase
    .from("conversations")
    .select("id, organization_id, label_ids")
    .eq("id", conversationId)
    .maybeSingle();

  if (readError || !conversation) {
    console.warn(`${LOG_PREFIX} conversation_read_failed`, {
      conversationId,
      key,
      error: readError?.message || "not_found",
    });
    return { applied: false, labelId: null };
  }

  const labelId = await resolveAutoLabelId(
    supabase,
    key,
    String(conversation.organization_id),
  );
  if (!labelId) {
    console.warn(`${LOG_PREFIX} label_not_resolved`, {
      conversationId,
      key,
      hint: `Define ${LABEL_ENV_KEYS[key]} o crea la etiqueta con nombre canónico`,
    });
    return { applied: false, labelId: null };
  }

  const currentIds = readConversationLabelIds(conversation.label_ids);

  if (currentIds.includes(labelId)) {
    return { applied: true, labelId };
  }

  const nextIds = [...currentIds, labelId];
  const { error: updateError } = await supabase
    .from("conversations")
    .update({
      label_ids: nextIds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("organization_id", conversation.organization_id);

  if (updateError) {
    console.warn(`${LOG_PREFIX} label_apply_failed`, {
      conversationId,
      key,
      labelId,
      error: updateError.message,
    });
    return { applied: false, labelId };
  }

  console.log(`${LOG_PREFIX} label_applied`, {
    conversationId,
    key,
    labelId,
    labelIds: nextIds,
  });

  return { applied: true, labelId };
};

/**
 * Removes a resolved auto-label from conversation.label_ids if present.
 * Soft-fails on missing label or update errors.
 */
export const removeConversationLabel = async (
  supabase: SupabaseClient,
  conversationId: number,
  key: CrmAutoLabelKey,
): Promise<{ removed: boolean; labelId: number | null }> => {
  const { data: conversation, error: readError } = await supabase
    .from("conversations")
    .select("id, organization_id, label_ids")
    .eq("id", conversationId)
    .maybeSingle();

  if (readError || !conversation) {
    console.warn(`${LOG_PREFIX} conversation_read_failed_on_remove`, {
      conversationId,
      key,
      error: readError?.message || "not_found",
    });
    return { removed: false, labelId: null };
  }

  const labelId = await resolveAutoLabelId(
    supabase,
    key,
    String(conversation.organization_id),
  );
  if (!labelId) {
    return { removed: false, labelId: null };
  }

  const currentIds = readConversationLabelIds(conversation.label_ids);
  if (!currentIds.includes(labelId)) {
    return { removed: false, labelId };
  }

  const nextIds = currentIds.filter((id) => id !== labelId);
  const { error: updateError } = await supabase
    .from("conversations")
    .update({
      label_ids: nextIds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("organization_id", conversation.organization_id);

  if (updateError) {
    console.warn(`${LOG_PREFIX} label_remove_failed`, {
      conversationId,
      key,
      labelId,
      error: updateError.message,
    });
    return { removed: false, labelId };
  }

  console.log(`${LOG_PREFIX} label_removed`, {
    conversationId,
    key,
    labelId,
    labelIds: nextIds,
  });

  return { removed: true, labelId };
};

/**
 * After payment approval: apply PAGADO API and drop Verificar pago if present.
 */
export const applyPaymentApprovedLabels = async (
  supabase: SupabaseClient,
  conversationId: number,
): Promise<{
  pagadoApi: { applied: boolean; labelId: number | null };
  verificarPagoRemoved: boolean;
}> => {
  const pagadoApi = await ensureConversationLabel(
    supabase,
    conversationId,
    "pagado_api",
  );
  const removed = await removeConversationLabel(
    supabase,
    conversationId,
    "verificar_pago",
  );
  return {
    pagadoApi,
    verificarPagoRemoved: removed.removed,
  };
};
