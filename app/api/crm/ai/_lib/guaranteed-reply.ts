import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureConversationLabel } from "@/app/api/crm/_lib/conversation-labels";
import {
  resolveAiRecoveryMessage,
  type AiRecoveryMessages,
} from "@/app/crm/_lib/ai-recovery-messages";
import {
  resolveOfficeHoursSnapshot,
  withClosedOfficeNotice,
  type OfficeHoursSnapshot,
} from "@/app/crm/_lib/office-hours";
import { getCrmSettings } from "@/app/api/crm/_lib/crm-settings";
import type { AgentHistoryMessage } from "./context-builder";
import { isTransientAiErrorMessage } from "./ai-retry";
import {
  classifyInboundIntent,
  type InboundIntent,
} from "./inbound-intent";
import { getWhatsappRuntimeConfig } from "../../_lib/whatsapp-runtime";

const LOG_PREFIX = "[AI_AGENT]";
const GRAPH_API_VERSION = "v19.0";
/** Soft holds allowed in the window before hard human handoff. */
const SOFT_FAIL_LIMIT = 2;
const SOFT_FAIL_WINDOW_MS = 15 * 60 * 1000;
const ACK_WINDOW_MS = 45 * 1000;

const normalizePhone = (value: string) => value.replace(/\D/g, "");

const sendWhatsAppText = async (to: string, message: string) => {
  const whatsapp = getWhatsappRuntimeConfig();
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${whatsapp.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${whatsapp.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: message },
      }),
    },
  );

  const data = await response.json();
  if (!response.ok || data.error) {
    console.error(`${LOG_PREFIX} whatsapp_send_failed`, {
      to,
      status: response.status,
      error: data.error || data,
    });
    throw new Error(data.error?.message || "Error al enviar fallback a WhatsApp");
  }

  const waMessageId = String(data.messages?.[0]?.id || "").trim();
  if (!waMessageId) {
    throw new Error("WhatsApp no devolvió message id para el fallback");
  }

  return waMessageId;
};

const readMetadata = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
};

const resolveRecipientPhone = (candidates: Array<string | null | undefined>) =>
  candidates
    .map((value) => normalizePhone(String(value || "")))
    .find((value) => value.length >= 8 && value.length <= 15) || null;

const countRecentSoftHolds = async (
  supabase: SupabaseClient,
  conversationId: number,
) => {
  const since = new Date(Date.now() - SOFT_FAIL_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("messages")
    .select("id, metadata")
    .eq("conversation_id", conversationId)
    .eq("type", "out")
    .gte("created_at", since)
    .limit(50);

  if (error) {
    console.warn(`${LOG_PREFIX} soft_fail_count_failed`, {
      conversationId,
      error: error.message,
    });
    return 0;
  }

  return (data || []).filter((row) => {
    const metadata = readMetadata(row.metadata);
    return metadata?.ai_recovery === "soft" || metadata?.ai_ack === true;
  }).length;
};

const loadRecentOutbound = async (
  supabase: SupabaseClient,
  conversationId: number,
  sinceIso: string,
) => {
  const { data, error } = await supabase
    .from("messages")
    .select("id, created_at, metadata")
    .eq("conversation_id", conversationId)
    .eq("type", "out")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.warn(`${LOG_PREFIX} recent_outbound_failed`, {
      conversationId,
      error: error.message,
    });
    return [];
  }

  return data || [];
};

export const hasBotReplyForTrigger = async (
  supabase: SupabaseClient,
  input: {
    conversationId: number;
    triggerMessageId?: number | null;
  },
) => {
  if (!input.triggerMessageId) return false;

  const since = new Date(Date.now() - SOFT_FAIL_WINDOW_MS).toISOString();
  const rows = await loadRecentOutbound(
    supabase,
    input.conversationId,
    since,
  );

  return rows.some((row) => {
    const metadata = readMetadata(row.metadata);
    return Number(metadata?.trigger_message_id) === input.triggerMessageId;
  });
};

const hasRecentAck = async (
  supabase: SupabaseClient,
  input: {
    conversationId: number;
    triggerMessageId?: number | null;
  },
) => {
  const since = new Date(Date.now() - ACK_WINDOW_MS).toISOString();
  const rows = await loadRecentOutbound(
    supabase,
    input.conversationId,
    since,
  );

  return rows.some((row) => {
    const metadata = readMetadata(row.metadata);
    if (metadata?.ai_ack !== true) return false;
    if (!input.triggerMessageId) return true;
    const triggerId = Number(metadata.trigger_message_id);
    return !Number.isFinite(triggerId) || triggerId === input.triggerMessageId;
  });
};

const persistTriggerRecovery = async (
  supabase: SupabaseClient,
  triggerMessageId: number | null | undefined,
  patch: Record<string, unknown>,
) => {
  if (!triggerMessageId) return;

  const { data: trigger } = await supabase
    .from("messages")
    .select("id, metadata")
    .eq("id", triggerMessageId)
    .maybeSingle();

  if (!trigger) return;

  const metadata = readMetadata(trigger.metadata) || {};
  await supabase
    .from("messages")
    .update({
      metadata: {
        ...metadata,
        ...patch,
      },
    })
    .eq("id", trigger.id);
};

export type GuaranteedReplyResult = {
  ok: boolean;
  reason: string;
  messageId?: number | null;
  skipped?: boolean;
  recovery?: "ack" | "soft" | "hard";
};

type RecoveryInput = {
  conversationId: number;
  triggerMessageId?: number | null;
  customerPhone?: string | null;
  whatsappId?: string | null;
  clientPhone?: string | null;
  latestInbound?: AgentHistoryMessage | null;
  messages?: AgentHistoryMessage[];
  intent?: InboundIntent;
  recoveryMessages?: AiRecoveryMessages | null;
  officeHours?: OfficeHoursSnapshot | null;
  errorMessage?: string | null;
};

const resolveIntent = (input: RecoveryInput): InboundIntent =>
  input.intent ||
  classifyInboundIntent({
    latestInbound: input.latestInbound,
    messages: input.messages,
  });

const resolveHoursSnapshot = async (
  supabase: SupabaseClient,
  provided?: OfficeHoursSnapshot | null,
) => {
  if (provided) return provided;
  try {
    const settings = await getCrmSettings(supabase);
    return resolveOfficeHoursSnapshot(new Date(), settings.office_hours);
  } catch {
    return resolveOfficeHoursSnapshot(new Date());
  }
};

/**
 * Early deterministic ack so the client is not left in silence while the AI runs.
 */
export const sendProcessingAck = async (
  supabase: SupabaseClient,
  input: RecoveryInput,
): Promise<GuaranteedReplyResult> => {
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, customer_phone, status")
    .eq("id", input.conversationId)
    .maybeSingle();

  if (conversationError || !conversation) {
    return { ok: false, skipped: true, reason: "conversation_not_found" };
  }

  if (conversation.status === "resuelto") {
    return { ok: false, skipped: true, reason: "conversation_resolved" };
  }

  if (
    await hasBotReplyForTrigger(supabase, {
      conversationId: input.conversationId,
      triggerMessageId: input.triggerMessageId,
    })
  ) {
    return { ok: true, skipped: true, reason: "trigger_already_replied" };
  }

  if (
    await hasRecentAck(supabase, {
      conversationId: input.conversationId,
      triggerMessageId: input.triggerMessageId,
    })
  ) {
    return { ok: true, skipped: true, reason: "ack_already_sent", recovery: "ack" };
  }

  const to = resolveRecipientPhone([
    input.customerPhone,
    conversation.customer_phone,
    input.whatsappId,
    input.clientPhone,
  ]);

  if (!to) {
    return { ok: false, reason: "missing_recipient" };
  }

  const intent = resolveIntent(input);
  const message = resolveAiRecoveryMessage({
    kind: "ack",
    intent,
    overrides: input.recoveryMessages,
  });

  try {
    const waMessageId = await sendWhatsAppText(to, message);
    const now = new Date().toISOString();
    const { data: saved, error: saveError } = await supabase
      .from("messages")
      .insert({
        conversation_id: input.conversationId,
        wa_message_id: waMessageId,
        type: "out",
        content: message,
        sender_type: "bot",
        sent_by: "Bot IA",
        status: "sent",
        created_at: now,
        metadata: {
          engine: "ai",
          action: "ack",
          reason: "ai_processing_ack",
          ai_ack: true,
          ai_recovery: "ack",
          intent,
          trigger_message_id: input.triggerMessageId ?? null,
        },
      })
      .select("id")
      .single();

    if (saveError) {
      console.error(`${LOG_PREFIX} ack_persist_failed`, {
        conversationId: input.conversationId,
        error: saveError.message,
      });
      return { ok: false, reason: "ack_persist_failed", recovery: "ack" };
    }

    await supabase
      .from("conversations")
      .update({
        preview: message,
        updated_at: now,
        last_message_at: now,
      })
      .eq("id", input.conversationId);

    console.log(`${LOG_PREFIX} ack_sent`, {
      conversationId: input.conversationId,
      messageId: saved?.id ?? null,
      intent,
      willReplyToClient: true,
    });

    return {
      ok: true,
      reason: "ack_sent",
      messageId: saved?.id ?? null,
      recovery: "ack",
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} ack_failed`, {
      conversationId: input.conversationId,
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return { ok: false, reason: "ack_send_failed", recovery: "ack" };
  }
};

/**
 * Recovery path after AI failures.
 * Transient errors: soft hold (bot stays active) until SOFT_FAIL_LIMIT, then hard handoff.
 */
export const sendGuaranteedClientReply = async (
  supabase: SupabaseClient,
  input: RecoveryInput & {
    /** Force hard handoff (e.g. failed business handoff send). */
    forceHardHandoff?: boolean;
    /** Skip a second WhatsApp message when an ack already covered this trigger. */
    skipSoftWhatsApp?: boolean;
  },
): Promise<GuaranteedReplyResult> => {
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, human_mode, customer_phone, client_id, status")
    .eq("id", input.conversationId)
    .maybeSingle();

  if (conversationError) {
    console.error(`${LOG_PREFIX} conversation_lookup_failed`, {
      conversationId: input.conversationId,
      error: conversationError.message,
    });
    return { ok: false, reason: "conversation_lookup_failed" };
  }

  if (!conversation) {
    return { ok: false, skipped: true, reason: "conversation_not_found" };
  }

  if (conversation.status === "resuelto") {
    return { ok: false, skipped: true, reason: "conversation_resolved" };
  }

  const { count: messageCount, error: countError } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", input.conversationId);

  if (countError) {
    console.error(`${LOG_PREFIX} message_count_failed`, {
      conversationId: input.conversationId,
      error: countError.message,
    });
    return { ok: false, reason: "message_count_failed" };
  }

  // Do not escalate orphan/empty conversations created by failed webhook inserts.
  if ((messageCount ?? 0) === 0 && !input.triggerMessageId) {
    console.warn(`${LOG_PREFIX} skipped_empty_conversation`, {
      conversationId: input.conversationId,
    });
    return { ok: false, skipped: true, reason: "empty_conversation" };
  }

  const to = resolveRecipientPhone([
    input.customerPhone,
    conversation.customer_phone,
    input.whatsappId,
    input.clientPhone,
  ]);

  if (!to) {
    console.error(`${LOG_PREFIX} missing_recipient`, {
      conversationId: input.conversationId,
    });
    return { ok: false, reason: "missing_recipient" };
  }

  const intent = resolveIntent(input);
  const isPaymentIntent =
    intent === "receipt_image" || intent === "cedula_and_image";
  const recentSoftFails = await countRecentSoftHolds(
    supabase,
    input.conversationId,
  );
  const isTransient = isTransientAiErrorMessage(input.errorMessage);
  const useSoft =
    !input.forceHardHandoff &&
    intent !== "human_request" &&
    isTransient &&
    recentSoftFails < SOFT_FAIL_LIMIT;

  if (useSoft && input.skipSoftWhatsApp) {
    await persistTriggerRecovery(supabase, input.triggerMessageId, {
      ai_recovery: "soft",
      ai_soft_hold: true,
      ai_fallback: false,
      ai_error: input.errorMessage || null,
      ai_fallback_at: new Date().toISOString(),
    });

    console.log(`${LOG_PREFIX} soft_covered_by_ack`, {
      conversationId: input.conversationId,
      intent,
      recentSoftFails,
    });

    return {
      ok: true,
      skipped: true,
      reason: "ack_covers_soft_hold",
      recovery: "soft",
    };
  }

  const message = withClosedOfficeNotice(
    resolveAiRecoveryMessage({
      kind: useSoft ? "soft" : "hard",
      intent,
      overrides: input.recoveryMessages,
    }),
    useSoft ? null : await resolveHoursSnapshot(supabase, input.officeHours),
  );

  const recovery: "soft" | "hard" = useSoft ? "soft" : "hard";

  try {
    const waMessageId = await sendWhatsAppText(to, message);
    const now = new Date().toISOString();

    const { data: saved, error: saveError } = await supabase
      .from("messages")
      .insert({
        conversation_id: input.conversationId,
        wa_message_id: waMessageId,
        type: "out",
        content: message,
        sender_type: "bot",
        sent_by: "Bot IA",
        status: "sent",
        created_at: now,
        metadata: {
          engine: "ai",
          action: recovery === "soft" ? "soft_hold" : "handoff",
          reason:
            recovery === "soft" ? "ai_soft_hold" : "ai_guaranteed_fallback",
          ai_fallback: recovery === "hard",
          ai_recovery: recovery,
          ai_soft_fail_count: recentSoftFails + (recovery === "soft" ? 1 : 0),
          ai_error: input.errorMessage || null,
          intent,
          trigger_message_id: input.triggerMessageId ?? null,
        },
      })
      .select("id")
      .single();

    if (saveError) {
      console.error(`${LOG_PREFIX} message_persist_failed`, {
        conversationId: input.conversationId,
        error: saveError.message,
        recovery,
      });
      return { ok: false, reason: "fallback_persist_failed", recovery };
    }

    if (recovery === "hard") {
      await supabase
        .from("conversations")
        .update({
          human_mode: true,
          preview: message,
          updated_at: now,
          last_message_at: now,
        })
        .eq("id", input.conversationId);

      await ensureConversationLabel(supabase, input.conversationId, "ia_error");
      if (isPaymentIntent) {
        await ensureConversationLabel(
          supabase,
          input.conversationId,
          "verificar_pago",
        );
      } else if (intent !== "human_request") {
        await ensureConversationLabel(supabase, input.conversationId, "soporte");
      }
    } else {
      await supabase
        .from("conversations")
        .update({
          preview: message,
          updated_at: now,
          last_message_at: now,
        })
        .eq("id", input.conversationId);
    }

    await persistTriggerRecovery(supabase, input.triggerMessageId, {
      ai_recovery: recovery,
      ai_fallback: recovery === "hard",
      ai_soft_hold: recovery === "soft",
      ai_fallback_at: now,
      ai_error: input.errorMessage || null,
    });

    console.log(`${LOG_PREFIX} sent`, {
      conversationId: input.conversationId,
      messageId: saved?.id ?? null,
      to,
      intent,
      recovery,
      recentSoftFails,
      softFailLimit: SOFT_FAIL_LIMIT,
      isTransient,
      willReplyToClient: true,
    });

    return {
      ok: true,
      reason: recovery === "soft" ? "soft_hold_sent" : "fallback_sent",
      messageId: saved?.id ?? null,
      recovery,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} failed`, {
      conversationId: input.conversationId,
      recovery,
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return {
      ok: false,
      reason: "fallback_send_failed",
      recovery,
    };
  }
};
