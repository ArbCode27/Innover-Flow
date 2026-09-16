import {
  generateAiWithTools,
  AiApiError,
  type AiContent,
  type AiGenerateResult,
} from "./ai-client";

const LOG_PREFIX = "[AI_AGENT]";

const PERMANENT_STATUS = new Set([400, 401, 403, 404]);

const readErrorText = (error: unknown) => {
  if (error instanceof AiApiError) {
    return `${error.status ?? ""} ${error.statusText ?? ""} ${error.message}`.toLowerCase();
  }
  if (error instanceof Error) {
    return `${error.name} ${error.message}`.toLowerCase();
  }
  return String(error || "").toLowerCase();
};

export const isPermanentAiError = (error: unknown): boolean => {
  if (error instanceof AiApiError && error.status != null) {
    if (PERMANENT_STATUS.has(error.status)) return true;
  }

  const text = readErrorText(error);
  return (
    text.includes(" 404 ") ||
    text.includes("404 not_found") ||
    text.includes("not_found") ||
    text.includes("no longer available") ||
    text.includes("permission_denied") ||
    text.includes("invalid api key") ||
    text.includes("api key not valid") ||
    text.includes("invalid_api_key") ||
    text.includes("model_not_found") ||
    /\bai 40[0143]\b/.test(text) ||
    /\bgroq 40[0143]\b/.test(text) ||
    /\bgemini 40[0143]\b/.test(text)
  );
};

export const isRetryableAiError = (error: unknown): boolean => {
  if (isPermanentAiError(error)) return false;

  if (error instanceof AiApiError) {
    if (error.status != null) {
      if (error.status === 429) return true;
      if (error.status >= 500 && error.status <= 599) return true;
    }
    const statusText = String(error.statusText || "").toLowerCase();
    if (
      statusText.includes("unavailable") ||
      statusText.includes("resource_exhausted") ||
      statusText.includes("rate_limit") ||
      statusText.includes("overloaded")
    ) {
      return true;
    }
    return false;
  }

  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  return (
    name === "aborterror" ||
    message.includes("timeout") ||
    message.includes("abort") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("rate_limit") ||
    message.includes("resource exhausted") ||
    message.includes("resource_exhausted") ||
    message.includes("503") ||
    message.includes("502") ||
    message.includes("500") ||
    message.includes("unavailable") ||
    message.includes("overloaded") ||
    message.includes("high demand") ||
    message.includes("try again later") ||
    message.includes("temporarily") ||
    message.includes("circuit_open")
  );
};

/** Transient capacity/network errors that should soft-hold before human handoff. */
export const isTransientAiError = (error: unknown): boolean =>
  isRetryableAiError(error);

export const isTransientAiErrorMessage = (
  message: string | null | undefined,
) => isRetryableAiError(new Error(String(message || "")));

const resolveBackoffMs = (error: unknown, attempt: number, baseMs: number) => {
  const message =
    error instanceof Error ? error.message.toLowerCase() : "";
  const status = error instanceof AiApiError ? error.status : null;
  const isCapacity =
    status === 429 ||
    status === 503 ||
    message.includes("high demand") ||
    message.includes("unavailable") ||
    message.includes("rate limit") ||
    message.includes("429") ||
    message.includes("503");

  const multiplier = isCapacity ? 2.5 : 1;
  return Math.round(baseMs * multiplier * Math.max(1, attempt));
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Retries AI chat completions on transient failures (timeouts, 5xx, rate limits).
 */
export const generateAiWithRetry = async (input: {
  systemPrompt: string;
  contents: AiContent[];
  model?: string;
  enableTools?: boolean;
  allowedToolNames?: string[] | null;
  /** Per-attempt timeouts in ms (length = max attempts). */
  timeoutsMs: number[];
  backoffMs?: number;
  logContext?: Record<string, unknown>;
}): Promise<AiGenerateResult> => {
  const timeouts = input.timeoutsMs.filter((value) => value > 0);
  if (!timeouts.length) {
    throw new Error("timeoutsMs vacío");
  }

  const backoffMs = input.backoffMs ?? 1500;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < timeouts.length; attempt += 1) {
    const timeoutMs = timeouts[attempt];
    try {
      if (attempt > 0) {
        const waitMs = resolveBackoffMs(lastError, attempt, backoffMs);
        console.warn(`${LOG_PREFIX} retrying`, {
          attempt: attempt + 1,
          maxAttempts: timeouts.length,
          timeoutMs,
          waitMs,
          model: input.model ?? null,
          ...input.logContext,
          previousError:
            lastError instanceof Error ? lastError.message : "unknown_error",
          previousStatus:
            lastError instanceof AiApiError ? lastError.status : null,
        });
        await sleep(waitMs);
      }

      return await generateAiWithTools({
        systemPrompt: input.systemPrompt,
        contents: input.contents,
        model: input.model,
        enableTools: input.enableTools,
        allowedToolNames: input.allowedToolNames,
        timeoutMs,
      });
    } catch (error) {
      lastError = error;
      const retryable = isRetryableAiError(error);
      console.warn(`${LOG_PREFIX} attempt_failed`, {
        attempt: attempt + 1,
        maxAttempts: timeouts.length,
        timeoutMs,
        retryable,
        httpStatus: error instanceof AiApiError ? error.status : null,
        statusText:
          error instanceof AiApiError ? error.statusText : null,
        model: input.model ?? null,
        error: error instanceof Error ? error.message : "unknown_error",
        ...input.logContext,
      });

      if (!retryable || attempt >= timeouts.length - 1) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("La IA falló tras reintentos");
};

/** Removes inlineData parts so a degraded retry is text-only (faster). */
export const stripInlineMediaFromContents = (
  contents: AiContent[],
): AiContent[] =>
  contents.map((content) => ({
    role: content.role,
    parts: content.parts
      .map((part) => {
        if ("inlineData" in part && part.inlineData) {
          return { text: "[Imagen/audio adjunto omitido en reintento]" };
        }
        return part;
      })
      .filter((part) => {
        if ("text" in part && typeof part.text === "string") {
          return part.text.trim().length > 0;
        }
        return true;
      }),
  }));
