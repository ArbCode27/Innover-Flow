/** Canonical Groq model ids used by Nova. */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";

/** Alternate chat model when the primary times out or saturates. */
export const DEFAULT_GROQ_FALLBACK_MODEL = "llama-3.3-70b-versatile";

/**
 * Vision model used only to describe images (receipts, IDs) as text before
 * the main agent (gpt-oss-20b is text-only).
 */
export const DEFAULT_GROQ_VISION_MODEL = "qwen/qwen3.6-27b";

/** Whisper model for voice-note transcription. */
export const DEFAULT_GROQ_WHISPER_MODEL = "whisper-large-v3-turbo";

/** @deprecated Use DEFAULT_GROQ_MODEL — kept for CRM column `ai_model`. */
export const DEFAULT_AI_MODEL = DEFAULT_GROQ_MODEL;

/** @deprecated Use DEFAULT_GROQ_FALLBACK_MODEL */
export const DEFAULT_AI_FALLBACK_MODEL = DEFAULT_GROQ_FALLBACK_MODEL;

const RETIRED_MODELS = new Set([
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
]);

export const normalizeAiModelId = (model: string) =>
  model.trim().replace(/^models\//i, "");

export const normalizeGroqModelId = normalizeAiModelId;

export const isRetiredAiModel = (model: string) => {
  const normalized = normalizeAiModelId(model).toLowerCase();
  return (
    RETIRED_MODELS.has(normalized) || normalized.startsWith("gemini-")
  );
};
