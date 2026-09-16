import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentHistoryMessage } from "./context-builder";

const LOG_PREFIX = "[AI_AGENT]";

export const TEXT_DEBOUNCE_MS = 4500;
export const MEDIA_DEBOUNCE_MS = 7000;
export const LOCK_TTL_MS = 90 * 1000;
export const FORCE_RUN_LOCK_RETRIES = 15;
export const FORCE_RUN_LOCK_WAIT_MS = 1000;

export const sleepMs = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const resolveTurnDebounceMs = (
  message: AgentHistoryMessage | null | undefined,
) => {
  const media = String(message?.media_type || "").toLowerCase();
  if (media === "image" || media === "audio") return MEDIA_DEBOUNCE_MS;
  return TEXT_DEBOUNCE_MS;
};

const isMissingLockColumn = (message: string) =>
  /ai_run_id|ai_run_locked_at|schema cache|does not exist|column/i.test(message);

type ConversationLockRow = {
  id: number;
  ai_run_id: string | null;
  ai_run_locked_at: string | null;
};

export type AiLockClaim = {
  ok: boolean;
  token: string;
  unsupported?: boolean;
  reason?: string;
};

const isLockStale = (row: ConversationLockRow) => {
  if (!row.ai_run_id) return true;
  const lockedAt = row.ai_run_locked_at ? Date.parse(row.ai_run_locked_at) : NaN;
  if (!Number.isFinite(lockedAt)) return true;
  return Date.now() - lockedAt > LOCK_TTL_MS;
};

const tryClaimOnce = async (
  supabase: SupabaseClient,
  conversationId: number,
  token: string,
): Promise<AiLockClaim> => {
  const { data: row, error: readError } = await supabase
    .from("conversations")
    .select("id, ai_run_id, ai_run_locked_at")
    .eq("id", conversationId)
    .maybeSingle<ConversationLockRow>();

  if (readError) {
    if (isMissingLockColumn(readError.message)) {
      return { ok: true, token, unsupported: true };
    }
    console.warn(`${LOG_PREFIX} lock_read_failed`, {
      conversationId,
      error: readError.message,
    });
    return { ok: false, token, reason: "lock_read_failed" };
  }

  if (!row) {
    return { ok: false, token, reason: "conversation_not_found" };
  }

  if (!isLockStale(row) && row.ai_run_id !== token) {
    return { ok: false, token, reason: "turn_locked" };
  }

  const now = new Date().toISOString();
  let query = supabase
    .from("conversations")
    .update({
      ai_run_id: token,
      ai_run_locked_at: now,
    })
    .eq("id", conversationId);

  query = row.ai_run_id
    ? query.eq("ai_run_id", row.ai_run_id)
    : query.is("ai_run_id", null);

  const { data: updated, error: updateError } = await query
    .select("id")
    .maybeSingle();

  if (updateError) {
    if (isMissingLockColumn(updateError.message)) {
      return { ok: true, token, unsupported: true };
    }
    console.warn(`${LOG_PREFIX} lock_claim_failed`, {
      conversationId,
      error: updateError.message,
    });
    return { ok: false, token, reason: "lock_claim_failed" };
  }

  if (!updated) {
    return { ok: false, token, reason: "turn_locked" };
  }

  return { ok: true, token };
};

export const claimConversationAiLock = async (
  supabase: SupabaseClient,
  conversationId: number,
  options?: { retries?: number; waitMs?: number },
): Promise<AiLockClaim> => {
  const token = crypto.randomUUID();
  const retries = options?.retries ?? 0;
  const waitMs = options?.waitMs ?? FORCE_RUN_LOCK_WAIT_MS;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const claim = await tryClaimOnce(supabase, conversationId, token);
    if (claim.ok) {
      if (attempt > 0) {
        console.log(`${LOG_PREFIX} lock_claimed_after_retry`, {
          conversationId,
          attempt,
          unsupported: Boolean(claim.unsupported),
        });
      }
      return claim;
    }
    if (attempt < retries) {
      await sleepMs(waitMs);
    }
  }

  return { ok: false, token, reason: "turn_locked" };
};

export const releaseConversationAiLock = async (
  supabase: SupabaseClient,
  conversationId: number,
  token: string | null,
  unsupported?: boolean,
) => {
  if (!token || unsupported) return;

  const { error } = await supabase
    .from("conversations")
    .update({
      ai_run_id: null,
      ai_run_locked_at: null,
    })
    .eq("id", conversationId)
    .eq("ai_run_id", token);

  if (error && !isMissingLockColumn(error.message)) {
    console.warn(`${LOG_PREFIX} lock_release_failed`, {
      conversationId,
      error: error.message,
    });
  }
};

export const findLatestInboundId = async (
  supabase: SupabaseClient,
  conversationId: number,
) => {
  const { data, error } = await supabase
    .from("messages")
    .select("id, type, sender_type, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(24);

  if (error) {
    console.warn(`${LOG_PREFIX} latest_inbound_lookup_failed`, {
      conversationId,
      error: error.message,
    });
    return null;
  }

  const inbound = (data || []).find(
    (message) => message.type === "in" || message.sender_type === "client",
  );
  return inbound?.id ?? null;
};

export const isCommittedAgentDecision = (input: {
  action?: string | null;
  reason?: string | null;
}) => {
  if (input.action === "handoff") return true;
  const reason = String(input.reason || "").toLowerCase();
  return (
    reason.includes("payment") ||
    reason.includes("submit") ||
    reason.includes("escalat")
  );
};
