/** Sole AI engine for the CRM bot. */
export type BotEngine = "ai";

export const BOT_ENGINES = ["ai"] as const;

export const DEFAULT_BOT_ENGINE: BotEngine = "ai";

export const BOT_ENGINE_LABELS: Record<BotEngine, string> = {
  ai: "IA",
};

export const isBotEngine = (value: unknown): value is BotEngine =>
  value === "ai";

/** Legacy DB values like "make" / "gemini" normalize to the sole engine. */
export const normalizeBotEngine = (_value?: unknown): BotEngine =>
  DEFAULT_BOT_ENGINE;
