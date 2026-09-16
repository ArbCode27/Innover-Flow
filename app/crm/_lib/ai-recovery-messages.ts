import type { InboundIntent } from "@/app/api/crm/ai/_lib/inbound-intent";

export const AI_RECOVERY_MESSAGE_MAX_LENGTH = 1000;

export type AiRecoveryMessages = {
  ack: string | null;
  soft_hold: string | null;
  hard_fallback: string | null;
};

export const EMPTY_AI_RECOVERY_MESSAGES: AiRecoveryMessages = {
  ack: null,
  soft_hold: null,
  hard_fallback: null,
};

export const DEFAULT_AI_ACK_MESSAGE =
  "Recibí tu mensaje. Dame un momento para procesarlo 😊";

export const DEFAULT_AI_SOFT_HOLD_MESSAGE =
  "Un momento, estoy procesando tu mensaje 😊";

export const DEFAULT_AI_HARD_FALLBACK_MESSAGE =
  "Disculpa la demora. Un asesor te atenderá en breve por este chat 😊";

const INTENT_MESSAGES: Partial<
  Record<InboundIntent, Partial<Record<"ack" | "soft" | "hard", string>>>
> = {
  receipt_image: {
    ack: "Recibí tu mensaje/comprobante. Dame un momento para procesarlo. Si puedes, indícame tu número de cédula por aquí 😊",
    soft: "Recibí tu mensaje/comprobante. Dame un momento para procesarlo. Si puedes, indícame tu número de cédula por aquí 😊",
    hard: "Recibí tu mensaje/comprobante. Estoy teniendo una demora técnica; un asesor te atenderá en breve. Si aún no enviaste tu cédula, indícamela por aquí 😊",
  },
  cedula: {
    ack: "Recibí tu cédula. La estoy consultando 😊",
    soft: "Recibí tu cédula. Tuve una demora momentánea al consultarla; reenvíamela en unos segundos y sigo contigo 😊",
    hard: "Recibí tu cédula. Tuve un problema técnico al procesarla; un asesor continuará contigo en breve 😊",
  },
  cedula_and_image: {
    ack: "Recibí tu cédula y tu comprobante. Los estoy procesando 😊",
    soft: "Recibí tu cédula y tu comprobante. Tuve una demora momentánea; en unos segundos continúo contigo. Si quieres, reenvía la cédula 😊",
    hard: "Recibí tu cédula y tu comprobante. Tuve una demora técnica al procesarlos; un asesor continuará contigo en breve 😊",
  },
  human_request: {
    hard: "Claro. Un asesor continuará contigo en este chat en breve 😊",
  },
};

const DEFAULT_BY_KIND: Record<"ack" | "soft" | "hard", string> = {
  ack: DEFAULT_AI_ACK_MESSAGE,
  soft: DEFAULT_AI_SOFT_HOLD_MESSAGE,
  hard: DEFAULT_AI_HARD_FALLBACK_MESSAGE,
};

const asNullableText = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export const parseAiRecoveryMessages = (
  value: unknown,
): AiRecoveryMessages => {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_AI_RECOVERY_MESSAGES };
  }

  const row = value as Record<string, unknown>;
  return {
    ack: asNullableText(row.ack),
    soft_hold: asNullableText(row.soft_hold),
    hard_fallback: asNullableText(row.hard_fallback),
  };
};

export const resolveAiRecoveryMessage = (input: {
  kind: "ack" | "soft" | "hard";
  intent: InboundIntent;
  overrides?: AiRecoveryMessages | null;
}) => {
  const specific = INTENT_MESSAGES[input.intent]?.[input.kind];
  if (specific) return specific;

  if (input.kind === "ack" && input.overrides?.ack) return input.overrides.ack;
  if (input.kind === "soft" && input.overrides?.soft_hold) {
    return input.overrides.soft_hold;
  }
  if (input.kind === "hard" && input.overrides?.hard_fallback) {
    return input.overrides.hard_fallback;
  }

  return DEFAULT_BY_KIND[input.kind];
};
