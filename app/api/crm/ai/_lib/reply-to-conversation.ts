import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveBotReplyPolicy } from "@/app/api/crm/_lib/bot-reply-policy";
import type { AiRecoveryMessages } from "@/app/crm/_lib/ai-recovery-messages";
import { resolveOfficeHoursSnapshot } from "@/app/crm/_lib/office-hours";
import { getCrmSettings } from "../../_lib/crm-settings";
import { finishAiRun, markAiRunAckSent, startAiRun, type AiRunHandle } from "./ai-runs";
import type { AgentHistoryMessage } from "./context-builder";
import { runAiAgent, type AgentClientSnapshot } from "./agent-runner";
import {
  getAiCircuitState,
  isCapacityFailureMessage,
  recordAiCircuitFailureMessage,
  recordAiCircuitSuccess,
} from "./ai-circuit";
import {
  sendGuaranteedClientReply,
  sendProcessingAck,
  type GuaranteedReplyResult,
} from "./guaranteed-reply";
import { classifyInboundIntent, getLatestInboundMessage, type InboundIntent } from "./inbound-intent";
import {
  detectInternalLeakInCustomerReply,
  SAFE_INTERNAL_LEAK_CUSTOMER_REPLY,
} from "./reply-sanitizer";
import { getWhatsappRuntimeConfig } from "../../_lib/whatsapp-runtime";
import {
  claimConversationAiLock,
  findLatestInboundId,
  FORCE_RUN_LOCK_RETRIES,
  FORCE_RUN_LOCK_WAIT_MS,
  isCommittedAgentDecision,
  releaseConversationAiLock,
  resolveTurnDebounceMs,
  sleepMs,
} from "./turn-coordinator";

const LOG_PREFIX = "[AI_AGENT]";
const GRAPH_API_VERSION = "v19.0";
const HISTORY_LIMIT = 24;
const ACK_DELAY_MS = 5000;
const HISTORY_SELECT =
  "id, type, content, sender_type, created_at, media_url, media_type, mime_type, caption, metadata";

type ConversationRow = {
  id: number;
  organization_id: string;
  client_id: number | null;
  human_mode: boolean | null;
  customer_phone: string | null;
  status: string | null;
  bot_engine: string | null;
};

const normalizePhone = (value: string) => value.replace(/\D/g, "");

const logAiNoReply = (
  kind: "skipped" | "failed",
  details: Record<string, unknown>,
) => {
  const payload = {
    ...details,
    willReplyToClient: false,
  };

  if (kind === "failed") {
    console.error(`${LOG_PREFIX} no_reply`, payload);
    return;
  }

  console.warn(`${LOG_PREFIX} no_reply`, payload);
};

const resolveRecipient = (
  conversation: ConversationRow,
  client: AgentClientSnapshot | null,
) => {
  const candidates = [
    conversation.customer_phone,
    client?.whatsapp_id,
    client?.phone,
  ]
    .map((value) => normalizePhone(String(value || "")))
    .filter((value) => value.length >= 8 && value.length <= 15);

  return candidates[0] || null;
};

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
    throw new Error(data.error?.message || "Error al enviar a WhatsApp");
  }

  return String(data.messages?.[0]?.id || "") || null;
};

const mapFallbackResult = (
  fallback: GuaranteedReplyResult,
  runId?: string,
): AiReplyResult => {
  if (fallback.ok) {
    const isSoft = fallback.recovery === "soft" || fallback.recovery === "ack";
    return {
      ok: true,
      reason: fallback.reason,
      action: isSoft ? "reply" : "handoff",
      messageId: fallback.messageId ?? null,
      runId,
    };
  }

  return {
    ok: false,
    skipped: fallback.skipped,
    reason: fallback.reason || "fallback_failed_after_api_error",
    runId,
  };
};

const startDelayedAck = (input: {
  supabase: SupabaseClient;
  conversationId: number;
  triggerMessageId?: number | null;
  customerPhone?: string | null;
  whatsappId?: string | null;
  clientPhone?: string | null;
  latestInbound?: AgentHistoryMessage | null;
  messages?: AgentHistoryMessage[];
  intent: InboundIntent;
  recoveryMessages?: AiRecoveryMessages | null;
  runHandle: AiRunHandle | null;
}) => {
  let cancelled = false;
  let started = false;
  let sent = false;
  let settled = false;
  let settle: ((value: { sent: boolean }) => void) | null = null;
  const finished = new Promise<{ sent: boolean }>((resolve) => {
    settle = resolve;
  });

  const resolveOnce = (value: { sent: boolean }) => {
    if (settled) return;
    settled = true;
    settle?.(value);
  };

  const timer = setTimeout(() => {
    started = true;
    void (async () => {
      if (cancelled) {
        resolveOnce({ sent: false });
        return;
      }

      try {
        const result = await sendProcessingAck(input.supabase, {
          conversationId: input.conversationId,
          triggerMessageId: input.triggerMessageId,
          customerPhone: input.customerPhone,
          whatsappId: input.whatsappId,
          clientPhone: input.clientPhone,
          latestInbound: input.latestInbound,
          messages: input.messages,
          intent: input.intent,
          recoveryMessages: input.recoveryMessages,
        });
        sent = Boolean(result.ok && result.reason === "ack_sent");
        if (sent) {
          await markAiRunAckSent(input.supabase, input.runHandle);
        }
      } catch (error) {
        console.warn(`${LOG_PREFIX} delayed_ack_failed`, {
          conversationId: input.conversationId,
          error: error instanceof Error ? error.message : "unknown_error",
        });
      } finally {
        resolveOnce({ sent });
      }
    })();
  }, ACK_DELAY_MS);

  return {
    cancel: () => {
      cancelled = true;
      clearTimeout(timer);
      if (!started) resolveOnce({ sent: false });
    },
    wait: async () => finished,
  };
};

export type AiReplyResult = {
  ok: boolean;
  skipped?: boolean;
  reason: string;
  action?: "reply" | "handoff";
  messageId?: number | null;
  runId?: string;
};

export const replyToConversationWithAi = async (
  supabase: SupabaseClient,
  input: {
    conversationId: number;
    triggerMessageId?: number | null;
    /**
     * Agent-initiated runs (e.g. process payment receipt) may bypass human_mode
     * so the AI can still extract/submit while an advisor owns the chat.
     */
    forceRun?: boolean;
    paymentRequestedByAgentId?: number | null;
  },
): Promise<AiReplyResult> => {
  const forceRun = Boolean(input.forceRun);
  const baseContext = {
    conversationId: input.conversationId,
    triggerMessageId: input.triggerMessageId ?? null,
    forceRun,
  };

  console.log(`${LOG_PREFIX} started`, baseContext);

  let conversation: ConversationRow | null = null;
  let client: AgentClientSnapshot | null = null;
  let chronological: AgentHistoryMessage[] = [];
  let latestInbound: AgentHistoryMessage | null | undefined = null;
  let recoveryMessages: AiRecoveryMessages | null = null;
  let officeHoursSnapshot: ReturnType<typeof resolveOfficeHoursSnapshot> | null =
    null;
  let intent: InboundIntent = "general";
  let runHandle: AiRunHandle | null = null;
  let modelName: string | null = null;
  let effectiveTriggerId = input.triggerMessageId ?? null;
  let lockToken: string | null = null;
  let lockUnsupported = false;

  const closeRun = async (
    status: Parameters<typeof finishAiRun>[2]["status"],
    extra?: {
      error?: string | null;
      circuitOpen?: boolean;
      metadata?: Record<string, unknown>;
    },
  ) => {
    await finishAiRun(supabase, runHandle, {
      status,
      model: modelName,
      error: extra?.error,
      circuitOpen: extra?.circuitOpen,
      metadata: extra?.metadata,
    });
  };

  try {
    const { data: conversationRow, error: conversationError } = await supabase
      .from("conversations")
      .select(
        "id, organization_id, client_id, human_mode, customer_phone, status, bot_engine",
      )
      .eq("id", input.conversationId)
      .maybeSingle<ConversationRow>();

    if (conversationError) throw conversationError;
    conversation = conversationRow;
    if (!conversation) {
      const result = {
        ok: false,
        skipped: true,
        reason: "conversation_not_found",
      } as const;
      logAiNoReply("skipped", { ...baseContext, ...result });
      return result;
    }
    const activeConversation = conversation;

    if (conversation.status === "resuelto") {
      const result = {
        ok: false,
        skipped: true,
        reason: "conversation_resolved",
      } as const;
      logAiNoReply("skipped", {
        ...baseContext,
        ...result,
        status: conversation.status,
      });
      return result;
    }

    const settings = await getCrmSettings(
      supabase,
      conversation.organization_id,
    );
    recoveryMessages = settings.ai_recovery_messages;
    modelName = settings.ai_model;
    officeHoursSnapshot = resolveOfficeHoursSnapshot(
      new Date(),
      settings.office_hours,
    );
    const replyPolicy = resolveBotReplyPolicy({
      humanMode: Boolean(conversation.human_mode),
      forceRun,
      officeHours: settings.office_hours,
      afterHoursPayments: settings.after_hours_payments,
    });

    console.log(`${LOG_PREFIX} bot_reply_policy`, {
      ...baseContext,
      humanMode: Boolean(conversation.human_mode),
      mode: replyPolicy.mode,
      reason: replyPolicy.reason,
      officeClosed: replyPolicy.officeClosed,
      shouldRun: replyPolicy.shouldRun,
    });

    if (!replyPolicy.shouldRun) {
      const result = {
        ok: false,
        skipped: true,
        reason: replyPolicy.reason,
      } as const;
      logAiNoReply("skipped", {
        ...baseContext,
        ...result,
        humanMode: Boolean(conversation.human_mode),
        replyMode: replyPolicy.mode,
      });
      return result;
    }

    if (conversation.client_id) {
      const { data: clientRow, error: clientError } = await supabase
        .from("clients")
        .select(
          "id, name, phone, whatsapp_id, wa_name, plan, zone, account, wispro_id, envoicing",
        )
        .eq("id", conversation.client_id)
        .maybeSingle<AgentClientSnapshot>();

      if (clientError) throw clientError;
      client = clientRow;
    }

    const loadHistory = async () => {
      const { data: history, error: historyError } = await supabase
        .from("messages")
        .select(HISTORY_SELECT)
        .eq("conversation_id", activeConversation.id)
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT);

      if (historyError) throw historyError;

      chronological = ([...(history || [])] as AgentHistoryMessage[]).reverse();
      latestInbound = getLatestInboundMessage(chronological);
    };

    await loadHistory();

    const initialLatestInbound = latestInbound as AgentHistoryMessage | null;
    const hasInboundSignal = Boolean(
      initialLatestInbound &&
        (initialLatestInbound.content?.trim() ||
          initialLatestInbound.media_url ||
          initialLatestInbound.caption?.trim()),
    );

    if (!hasInboundSignal) {
      const result = {
        ok: false,
        skipped: true,
        reason: "no_inbound_content",
      } as const;
      logAiNoReply("skipped", {
        ...baseContext,
        ...result,
        historyCount: chronological.length,
      });
      return result;
    }

    if (!forceRun) {
      const triggerMessage =
        chronological.find((message) => message.id === input.triggerMessageId) ||
        latestInbound;
      const debounceMs = resolveTurnDebounceMs(triggerMessage);
      console.log(`${LOG_PREFIX} turn_debounce`, {
        ...baseContext,
        debounceMs,
        triggerMediaType: triggerMessage?.media_type ?? null,
      });
      await sleepMs(debounceMs);
      await loadHistory();

      const latestAfterWait = getLatestInboundMessage(chronological);
      if (
        input.triggerMessageId &&
        latestAfterWait?.id &&
        latestAfterWait.id !== input.triggerMessageId
      ) {
        const result = {
          ok: false,
          skipped: true,
          reason: "turn_superseded",
        } as const;
        logAiNoReply("skipped", {
          ...baseContext,
          ...result,
          latestInboundId: latestAfterWait.id,
        });
        return result;
      }
    }

    latestInbound = getLatestInboundMessage(chronological);
    effectiveTriggerId = forceRun
      ? input.triggerMessageId ?? latestInbound?.id ?? null
      : latestInbound?.id ?? input.triggerMessageId ?? null;

    const lockClaim = await claimConversationAiLock(
      supabase,
      conversation.id,
      forceRun
        ? {
            retries: FORCE_RUN_LOCK_RETRIES,
            waitMs: FORCE_RUN_LOCK_WAIT_MS,
          }
        : undefined,
    );

    if (!lockClaim.ok) {
      const result = {
        ok: false,
        skipped: true,
        reason: lockClaim.reason || "turn_locked",
      } as const;
      logAiNoReply("skipped", { ...baseContext, ...result });
      return result;
    }

    lockToken = lockClaim.token;
    lockUnsupported = Boolean(lockClaim.unsupported);

    intent = classifyInboundIntent({
      latestInbound,
      messages: chronological,
    });

    const isTurnStale = async () => {
      if (forceRun || !effectiveTriggerId) return false;
      const latestId = await findLatestInboundId(
        supabase,
        activeConversation.id,
      );
      return Boolean(latestId && latestId !== effectiveTriggerId);
    };

    const skipIfStaleBeforeSend = async (decision?: {
      action?: string | null;
      reason?: string | null;
    }) => {
      if (decision && isCommittedAgentDecision(decision)) return null;
      if (!(await isTurnStale())) return null;
      await closeRun("skipped", {
        error: "turn_stale_before_send",
        metadata: { intent, effectiveTriggerId },
      });
      const result = {
        ok: false,
        skipped: true,
        reason: "turn_stale_before_send",
      } as const;
      logAiNoReply("skipped", { ...baseContext, ...result });
      return result;
    };

    const fallbackInput = {
      conversationId: conversation.id,
      triggerMessageId: effectiveTriggerId,
      customerPhone: conversation.customer_phone,
      whatsappId: client?.whatsapp_id,
      clientPhone: client?.phone,
      latestInbound,
      messages: chronological,
      intent,
      recoveryMessages,
      officeHours: officeHoursSnapshot,
    };

    const sendFallback = async (
      errorMessage: string,
      options?: { forceHardHandoff?: boolean; skipSoftWhatsApp?: boolean },
    ) => {
      if (forceRun) {
        await closeRun("failed", {
          error: errorMessage,
          circuitOpen: isCapacityFailureMessage(errorMessage),
          metadata: { intent, forceRun: true },
        });
        return {
          ok: false,
          reason: errorMessage,
        } satisfies AiReplyResult;
      }

      recordAiCircuitFailureMessage(errorMessage);
      const staleFallback = await skipIfStaleBeforeSend();
      if (staleFallback) return staleFallback;
      const fallback = await sendGuaranteedClientReply(supabase, {
        ...fallbackInput,
        errorMessage,
        forceHardHandoff: options?.forceHardHandoff,
        skipSoftWhatsApp: options?.skipSoftWhatsApp,
      });
      await closeRun(
        fallback.recovery === "hard"
          ? "handoff"
          : fallback.recovery === "soft"
            ? "soft_hold"
            : "failed",
        {
          error: errorMessage,
          circuitOpen: isCapacityFailureMessage(errorMessage),
          metadata: {
            intent,
            fallbackReason: fallback.reason,
            capacity_failure: isCapacityFailureMessage(errorMessage),
          },
        },
      );
      return mapFallbackResult(fallback);
    };

    const circuit = await getAiCircuitState(supabase);
    runHandle = await startAiRun(supabase, {
      conversationId: conversation.id,
      triggerMessageId: effectiveTriggerId,
      intent,
      model: settings.ai_model,
      circuitOpen: circuit.open && !forceRun,
      metadata: {
        forceRun,
        replyMode: replyPolicy.mode,
        burstSize: chronological.filter(
          (message) => message.type === "in" || message.sender_type === "client",
        ).length,
      },
    });

    if (!forceRun && intent === "human_request") {
      const staleHuman = await skipIfStaleBeforeSend();
      if (staleHuman) return staleHuman;
      console.log(`${LOG_PREFIX} intent_handoff`, {
        ...baseContext,
        intent,
      });
      const fallback = await sendGuaranteedClientReply(supabase, {
        ...fallbackInput,
        errorMessage: "client_requested_human",
        forceHardHandoff: true,
      });
      await closeRun("handoff", {
        error: "client_requested_human",
        metadata: { intent, shortcut: true },
      });
      return mapFallbackResult(fallback);
    }

    if (!forceRun && circuit.open) {
      const staleCircuit = await skipIfStaleBeforeSend();
      if (staleCircuit) return staleCircuit;
      console.warn(`${LOG_PREFIX} circuit_open`, {
        ...baseContext,
        intent,
        circuitReason: circuit.reason,
        recentFailures: circuit.recentFailures,
      });
      const fallback = await sendGuaranteedClientReply(supabase, {
        ...fallbackInput,
        errorMessage: "circuit_open",
      });
      await closeRun(
        fallback.recovery === "hard" ? "handoff" : "circuit_open",
        {
          error: "circuit_open",
          circuitOpen: true,
          metadata: {
            intent,
            capacity_failure: true,
            circuitReason: circuit.reason,
          },
        },
      );
      return mapFallbackResult(fallback);
    }

    console.log(`${LOG_PREFIX} generating`, {
      ...baseContext,
      effectiveTriggerId,
      model: settings.ai_model,
      replyMode: replyPolicy.mode,
      historyCount: chronological.length,
      linkedWispro: Boolean(client?.wispro_id),
      intent,
      latestInboundPreview: latestInbound?.content?.slice(0, 120) ?? null,
      latestMediaType: latestInbound?.media_type ?? null,
    });

    const delayedAck = forceRun
      ? null
      : startDelayedAck({
          supabase,
          conversationId: conversation.id,
          triggerMessageId: effectiveTriggerId,
          customerPhone: conversation.customer_phone,
          whatsappId: client?.whatsapp_id,
          clientPhone: client?.phone,
          latestInbound,
          messages: chronological,
          intent,
          recoveryMessages,
          runHandle,
        });

    let decision;
    let ackSent = false;
    try {
      decision = await runAiAgent({
        supabase,
        conversationId: conversation.id,
        customerPhone: conversation.customer_phone,
        client,
        messages: chronological,
        triggerMessageId: effectiveTriggerId,
        paymentRequestedByAgentId: input.paymentRequestedByAgentId ?? null,
        businessPrompt: settings.ai_system_prompt,
        model: settings.ai_model,
        replyMode: replyPolicy.mode,
        allowedToolNames: replyPolicy.allowedTools,
        officeHours: officeHoursSnapshot,
      });
    } catch (aiError) {
      delayedAck?.cancel();
      const ack = delayedAck ? await delayedAck.wait() : { sent: false };
      ackSent = ack.sent;

      const message =
        aiError instanceof Error
          ? aiError.message
          : "ai_request_failed";

      if (message === "empty_history") {
        await closeRun("skipped", { error: "empty_history", metadata: { intent } });
        const result = {
          ok: false,
          skipped: true,
          reason: "empty_history",
        } as const;
        logAiNoReply("skipped", { ...baseContext, ...result });
        return result;
      }

      logAiNoReply("failed", {
        ...baseContext,
        reason: "ai_api_error",
        model: settings.ai_model,
        error: message,
        ackSent,
      });

      return sendFallback(message, { skipSoftWhatsApp: ackSent });
    } finally {
      delayedAck?.cancel();
    }

    const ack = delayedAck ? await delayedAck.wait() : { sent: false };
    ackSent = ack.sent;

    console.log(`${LOG_PREFIX} decision`, {
      ...baseContext,
      action: decision.action,
      message: decision.message,
      reason: decision.reason ?? null,
      runId: decision.runId,
      clientId: decision.clientId,
      ackSent,
    });

    // Refresh client after possible Wispro link.
    if (decision.clientId && decision.clientId !== client?.id) {
      const { data: linkedClient } = await supabase
        .from("clients")
        .select(
          "id, name, phone, whatsapp_id, wa_name, plan, zone, account, wispro_id, envoicing",
        )
        .eq("id", decision.clientId)
        .maybeSingle<AgentClientSnapshot>();
      if (linkedClient) client = linkedClient;
    } else if (client?.id) {
      const { data: refreshedClient } = await supabase
        .from("clients")
        .select(
          "id, name, phone, whatsapp_id, wa_name, plan, zone, account, wispro_id, envoicing",
        )
        .eq("id", client.id)
        .maybeSingle<AgentClientSnapshot>();
      if (refreshedClient) client = refreshedClient;
    }

    const { data: freshConversation, error: freshError } = await supabase
      .from("conversations")
      .select("id, human_mode, customer_phone, client_id, status")
      .eq("id", conversation.id)
      .maybeSingle<ConversationRow>();

    if (freshError) throw freshError;

    const sendPolicy = resolveBotReplyPolicy({
      humanMode: Boolean(freshConversation?.human_mode),
      forceRun,
      officeHours: settings.office_hours,
      afterHoursPayments: settings.after_hours_payments,
    });

    if (!freshConversation || !sendPolicy.shouldRun) {
      const result = {
        ok: false,
        skipped: true,
        reason: !freshConversation
          ? "conversation_missing_before_send"
          : sendPolicy.reason === "human_mode_active"
            ? "human_mode_active_before_send"
            : sendPolicy.reason,
        runId: decision.runId,
      } as const;
      await closeRun("skipped", {
        error: result.reason,
        metadata: { intent, aiRunId: decision.runId },
      });
      logAiNoReply("skipped", {
        ...baseContext,
        ...result,
        decisionAction: decision.action,
        replyMode: sendPolicy.mode,
      });
      return result;
    }

    if (decision.action === "handoff") {
      const tryHandoffFallback = async (errorMessage: string) => {
        const fallback = await sendGuaranteedClientReply(supabase, {
          ...fallbackInput,
          customerPhone: freshConversation.customer_phone,
          errorMessage,
          forceHardHandoff: true,
        });
        await closeRun("handoff", {
          error: errorMessage,
          metadata: { intent, aiRunId: decision.runId },
        });
        return mapFallbackResult(fallback, decision.runId);
      };

      const handoffTextRaw = decision.message.trim();
      if (!handoffTextRaw) {
        logAiNoReply("failed", {
          ...baseContext,
          reason: "handoff_empty_message",
          action: "handoff",
          runId: decision.runId,
        });
        return tryHandoffFallback("handoff_empty_message");
      }

      const handoffLeak = detectInternalLeakInCustomerReply(handoffTextRaw);
      const handoffText = handoffLeak.matched
        ? SAFE_INTERNAL_LEAK_CUSTOMER_REPLY
        : handoffTextRaw;
      if (handoffLeak.matched) {
        console.warn(`${LOG_PREFIX} outbound_internal_leak_blocked`, {
          ...baseContext,
          action: "handoff",
          runId: decision.runId,
          reason: handoffLeak.reason,
          matchedToken: handoffLeak.matchedToken,
          preview: handoffTextRaw.slice(0, 160),
        });
      }

      const to = resolveRecipient(freshConversation, client);
      if (!to) {
        logAiNoReply("failed", {
          ...baseContext,
          reason: "handoff_missing_recipient_phone",
          action: "handoff",
          runId: decision.runId,
        });
        return tryHandoffFallback("handoff_missing_recipient_phone");
      }

      try {
        const waMessageId = await sendWhatsAppText(to, handoffText);
        const now = new Date().toISOString();
        const { data: saved, error: saveError } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversation.id,
            wa_message_id: waMessageId,
            type: "out",
            content: handoffText,
            sender_type: "bot",
            sent_by: "Bot IA",
            status: "sent",
            created_at: now,
            metadata: {
              engine: "ai",
              action: "handoff",
              reason: decision.reason || null,
              run_id: decision.runId,
              trigger_message_id: effectiveTriggerId,
              intent,
            },
          })
          .select("id")
          .single();

        if (saveError) throw saveError;

        recordAiCircuitSuccess();

        await supabase
          .from("conversations")
          .update({
            human_mode: true,
            preview: handoffText,
            updated_at: now,
            last_message_at: now,
          })
          .eq("id", conversation.id);

        await closeRun("handoff", {
          metadata: { intent, aiRunId: decision.runId },
        });

        console.log(`${LOG_PREFIX} handoff_sent`, {
          ...baseContext,
          messageId: saved?.id ?? null,
          reason: decision.reason || null,
          runId: decision.runId,
          willReplyToClient: true,
        });

        return {
          ok: true,
          reason: "handoff",
          action: "handoff",
          messageId: saved?.id ?? null,
          runId: decision.runId,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "handoff_whatsapp_send_failed";
        logAiNoReply("failed", {
          ...baseContext,
          reason: "handoff_whatsapp_send_failed",
          action: "handoff",
          runId: decision.runId,
          error: errorMessage,
        });
        return tryHandoffFallback(errorMessage);
      }
    }

    const replyTextRaw = decision.message.trim();
    if (!replyTextRaw) {
      logAiNoReply("failed", {
        ...baseContext,
        reason: "empty_model_reply",
        runId: decision.runId,
      });
      return sendFallback("empty_model_reply", { skipSoftWhatsApp: ackSent });
    }

    const replyLeak = detectInternalLeakInCustomerReply(replyTextRaw);
    const replyText = replyLeak.matched
      ? SAFE_INTERNAL_LEAK_CUSTOMER_REPLY
      : replyTextRaw;
    if (replyLeak.matched) {
      console.warn(`${LOG_PREFIX} outbound_internal_leak_blocked`, {
        ...baseContext,
        action: "reply",
        runId: decision.runId,
        reason: replyLeak.reason,
        matchedToken: replyLeak.matchedToken,
        preview: replyTextRaw.slice(0, 160),
      });
    }

    const staleReply = await skipIfStaleBeforeSend(decision);
    if (staleReply) return staleReply;

    const to = resolveRecipient(freshConversation, client);
    if (!to) {
      const result = {
        ok: false,
        skipped: true,
        reason: "missing_recipient_phone",
        runId: decision.runId,
      } as const;
      await closeRun("failed", {
        error: result.reason,
        metadata: { intent, aiRunId: decision.runId },
      });
      logAiNoReply("failed", {
        ...baseContext,
        ...result,
        customerPhone: freshConversation.customer_phone,
        clientPhone: client?.phone ?? null,
        clientWhatsappId: client?.whatsapp_id ?? null,
      });
      return result;
    }

    let waMessageId: string | null;
    try {
      waMessageId = await sendWhatsAppText(to, replyText);
    } catch (sendError) {
      logAiNoReply("failed", {
        ...baseContext,
        reason: "whatsapp_send_failed",
        to,
        runId: decision.runId,
        error: sendError instanceof Error ? sendError.message : "unknown_error",
        replyPreview: replyText.slice(0, 120),
      });
      throw sendError;
    }

    const now = new Date().toISOString();

    const { data: savedMessage, error: saveError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversation.id,
        wa_message_id: waMessageId,
        type: "out",
        content: replyText,
        sender_type: "bot",
        sent_by: "Bot IA",
        status: "sent",
        created_at: now,
        metadata: {
          engine: "ai",
          action: "reply",
          reason: decision.reason || null,
          run_id: decision.runId,
          trigger_message_id: effectiveTriggerId,
          intent,
        },
      })
      .select("id")
      .single();

    if (saveError) {
      logAiNoReply("failed", {
        ...baseContext,
        reason: "message_persist_failed",
        error: saveError.message,
        waMessageId,
        runId: decision.runId,
      });
      throw saveError;
    }

    recordAiCircuitSuccess();

    await supabase
      .from("conversations")
      .update({
        preview: replyText,
        updated_at: now,
        last_message_at: now,
      })
      .eq("id", conversation.id);

    await closeRun("replied", {
      metadata: { intent, aiRunId: decision.runId, ackSent },
    });

    console.log(`${LOG_PREFIX} reply_sent`, {
      ...baseContext,
      messageId: savedMessage?.id ?? null,
      to,
      runId: decision.runId,
      willReplyToClient: true,
    });

    return {
      ok: true,
      reason: "reply_sent",
      action: "reply",
      messageId: savedMessage?.id ?? null,
      runId: decision.runId,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "unknown_error";

    logAiNoReply("failed", {
      ...baseContext,
      reason: "unexpected_error",
      error: errorMessage,
      name: error instanceof Error ? error.name : typeof error,
    });

    if (conversation && !forceRun) {
      const latestId = await findLatestInboundId(supabase, conversation.id);
      if (effectiveTriggerId && latestId && latestId !== effectiveTriggerId) {
        await closeRun("skipped", {
          error: "turn_stale_before_send",
          metadata: { intent, effectiveTriggerId, latestId },
        });
        return {
          ok: false,
          skipped: true,
          reason: "turn_stale_before_send",
        };
      }
      recordAiCircuitFailureMessage(errorMessage);
      const fallback = await sendGuaranteedClientReply(supabase, {
        conversationId: conversation.id,
        triggerMessageId: effectiveTriggerId,
        customerPhone: conversation.customer_phone,
        whatsappId: client?.whatsapp_id,
        clientPhone: client?.phone,
        latestInbound,
        messages: chronological,
        intent,
        recoveryMessages,
        officeHours: officeHoursSnapshot,
        errorMessage,
      });
      await closeRun(
        fallback.recovery === "hard"
          ? "handoff"
          : fallback.recovery === "soft"
            ? "soft_hold"
            : "failed",
        {
          error: errorMessage,
          circuitOpen: isCapacityFailureMessage(errorMessage),
          metadata: {
            intent,
            capacity_failure: isCapacityFailureMessage(errorMessage),
          },
        },
      );

      if (fallback.ok) {
        return mapFallbackResult(fallback);
      }
    } else {
      await closeRun("failed", {
        error: errorMessage,
        metadata: { intent, forceRun },
      });
    }

    return {
      ok: false,
      reason: "unexpected_error",
    };
  } finally {
    await releaseConversationAiLock(
      supabase,
      input.conversationId,
      lockToken,
      lockUnsupported,
    );
  }
};
