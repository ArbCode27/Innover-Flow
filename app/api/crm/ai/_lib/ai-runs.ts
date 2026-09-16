import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboundIntent } from "./inbound-intent";

const LOG_PREFIX = "[AI_AGENT]";

export type AiRunStatus =
  | "started"
  | "ack_sent"
  | "replied"
  | "soft_hold"
  | "handoff"
  | "skipped"
  | "failed"
  | "circuit_open";

export type AiRunHandle = {
  id: string | null;
  startedAt: number;
};

const isMissingTable = (message: string) =>
  /ai_runs|schema cache|does not exist/i.test(message);

export const startAiRun = async (
  supabase: SupabaseClient,
  input: {
    conversationId: number;
    triggerMessageId?: number | null;
    intent: InboundIntent;
    model?: string | null;
    circuitOpen?: boolean;
    metadata?: Record<string, unknown>;
  },
): Promise<AiRunHandle> => {
  const startedAt = Date.now();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("organization_id")
    .eq("id", input.conversationId)
    .maybeSingle();
  const organizationId = String(conversation?.organization_id || "").trim();
  if (!organizationId) {
    return { id: null, startedAt };
  }

  const { data, error } = await supabase
    .from("ai_runs")
    .insert({
      organization_id: organizationId,
      conversation_id: input.conversationId,
      trigger_message_id: input.triggerMessageId ?? null,
      status: input.circuitOpen ? "circuit_open" : "started",
      intent: input.intent,
      model: input.model ?? null,
      circuit_open: Boolean(input.circuitOpen),
      started_at: new Date(startedAt).toISOString(),
      metadata: input.metadata ?? {},
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (!isMissingTable(error.message)) {
      console.warn(`${LOG_PREFIX} insert_failed`, { error: error.message });
    }
    return { id: null, startedAt };
  }

  return { id: data?.id ? String(data.id) : null, startedAt };
};

export const markAiRunAckSent = async (
  supabase: SupabaseClient,
  handle: AiRunHandle | null,
) => {
  if (!handle?.id) return;
  const { error } = await supabase
    .from("ai_runs")
    .update({ status: "ack_sent" })
    .eq("id", handle.id);

  if (error && !isMissingTable(error.message)) {
    console.warn(`${LOG_PREFIX} ack_update_failed`, { error: error.message });
  }
};

export const finishAiRun = async (
  supabase: SupabaseClient,
  handle: AiRunHandle | null,
  input: {
    status: AiRunStatus;
    error?: string | null;
    model?: string | null;
    circuitOpen?: boolean;
    metadata?: Record<string, unknown>;
  },
) => {
  if (!handle?.id) return;
  const finishedAt = Date.now();
  const patch: Record<string, unknown> = {
    status: input.status,
    error: input.error ?? null,
    circuit_open: Boolean(input.circuitOpen),
    finished_at: new Date(finishedAt).toISOString(),
    duration_ms: Math.max(0, finishedAt - handle.startedAt),
  };
  if (input.model) patch.model = input.model;
  if (input.metadata) patch.metadata = input.metadata;

  const { error } = await supabase
    .from("ai_runs")
    .update(patch)
    .eq("id", handle.id);

  if (error && !isMissingTable(error.message)) {
    console.warn(`${LOG_PREFIX} finish_failed`, { error: error.message });
  }
};
