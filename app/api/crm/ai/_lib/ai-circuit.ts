import type { SupabaseClient } from "@supabase/supabase-js";
import { isTransientAiError } from "./ai-retry";

const LOG_PREFIX = "[AI_AGENT]";
const FAILURE_WINDOW_MS = 2 * 60 * 1000;
const FAILURE_THRESHOLD = 5;
const OPEN_MS = 4 * 60 * 1000;

type CircuitMemory = {
  failures: number[];
  openUntil: number | null;
};

const memory: CircuitMemory = {
  failures: [],
  openUntil: null,
};

const pruneFailures = (now: number) => {
  memory.failures = memory.failures.filter(
    (timestamp) => now - timestamp < FAILURE_WINDOW_MS,
  );
};

export const isCapacityFailureMessage = (message: string | null | undefined) => {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("circuit_open") ||
    normalized.includes("429") ||
    normalized.includes("503") ||
    normalized.includes("resource exhausted") ||
    normalized.includes("resource_exhausted") ||
    normalized.includes("unavailable") ||
    normalized.includes("overloaded") ||
    normalized.includes("high demand") ||
    normalized.includes("rate limit")
  );
};

export const recordAiCircuitSuccess = () => {
  memory.failures = [];
  memory.openUntil = null;
};

export const recordAiCircuitFailure = (error: unknown) => {
  if (!isTransientAiError(error)) return { opened: false };

  const now = Date.now();
  pruneFailures(now);
  memory.failures.push(now);

  if (memory.failures.length >= FAILURE_THRESHOLD) {
    memory.openUntil = now + OPEN_MS;
    console.warn(`${LOG_PREFIX} opened`, {
      failures: memory.failures.length,
      openUntil: new Date(memory.openUntil).toISOString(),
    });
    return { opened: true };
  }

  return { opened: false };
};

export const recordAiCircuitFailureMessage = (
  message: string | null | undefined,
) => recordAiCircuitFailure(new Error(String(message || "unknown_error")));

const isMemoryOpen = (now = Date.now()) => {
  if (memory.openUntil && now < memory.openUntil) return true;
  if (memory.openUntil && now >= memory.openUntil) {
    memory.openUntil = null;
  }
  pruneFailures(now);
  return false;
};

const countRecentCapacityRuns = async (supabase: SupabaseClient) => {
  const since = new Date(Date.now() - FAILURE_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("ai_runs")
    .select("id, error, metadata, status")
    .gte("started_at", since)
    .in("status", ["failed", "soft_hold", "handoff", "circuit_open"])
    .limit(40);

  if (error) {
    if (!/ai_runs|schema cache|does not exist/i.test(error.message)) {
      console.warn(`${LOG_PREFIX} runs_lookup_failed`, { error: error.message });
    }
    return 0;
  }

  return (data || []).filter((row) => {
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null;
    if (metadata?.capacity_failure === true) return true;
    return isCapacityFailureMessage(String(row.error || ""));
  }).length;
};

export const getAiCircuitState = async (supabase?: SupabaseClient) => {
  if (isMemoryOpen()) {
    return {
      open: true,
      reason: "memory" as const,
      openUntil: memory.openUntil,
      recentFailures: memory.failures.length,
    };
  }

  if (!supabase) {
    return {
      open: false,
      reason: "closed" as const,
      openUntil: null,
      recentFailures: memory.failures.length,
    };
  }

  const remoteFailures = await countRecentCapacityRuns(supabase);
  if (remoteFailures >= FAILURE_THRESHOLD) {
    memory.openUntil = Date.now() + OPEN_MS;
    console.warn(`${LOG_PREFIX} opened_from_runs`, {
      remoteFailures,
      openUntil: new Date(memory.openUntil).toISOString(),
    });
    return {
      open: true,
      reason: "ai_runs" as const,
      openUntil: memory.openUntil,
      recentFailures: remoteFailures,
    };
  }

  return {
    open: false,
    reason: "closed" as const,
    openUntil: null,
    recentFailures: Math.max(memory.failures.length, remoteFailures),
  };
};
