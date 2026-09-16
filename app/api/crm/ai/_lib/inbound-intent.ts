import type { AgentHistoryMessage } from "./context-builder";

export type InboundIntent =
  | "human_request"
  | "receipt_image"
  | "cedula"
  | "cedula_and_image"
  | "general";

const HUMAN_REQUEST_RE =
  /\b(asesor(a)?|humano|persona real|operador(a)?|atenci[oó]n (al )?cliente|hablar con (un |una )?(agente|persona|alguien|asesor)|pasar(me)? (con |a )?(un |una )?(asesor|agente|humano)|quiero (un |una )?(asesor|agente|humano)|necesito (un |una )?(asesor|agente|humano))\b/i;

const BURST_WINDOW_MS = 2 * 60 * 1000;

const isUserMessage = (message: AgentHistoryMessage) =>
  message.type === "in" || message.sender_type === "client";

const isAckOutbound = (message: AgentHistoryMessage) => {
  const metadata =
    message.metadata && typeof message.metadata === "object"
      ? (message.metadata as Record<string, unknown>)
      : null;
  return (
    message.type === "out" &&
    (metadata?.ai_ack === true || metadata?.ai_recovery === "ack")
  );
};

export const looksLikeCedula = (value: string | null | undefined) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 5 && digits.length <= 12 && /^\d+$/.test(digits);
};

export const looksLikeHumanRequest = (value: string | null | undefined) =>
  HUMAN_REQUEST_RE.test(String(value || "").trim());

export const inboundHasImage = (message: AgentHistoryMessage | null | undefined) =>
  String(message?.media_type || "").toLowerCase() === "image";

export const recentInboundHasImage = (messages: AgentHistoryMessage[]) =>
  messages.some(
    (message) => isUserMessage(message) && inboundHasImage(message),
  );

const resolveInboundText = (message: AgentHistoryMessage | null | undefined) =>
  [message?.content, message?.caption]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

export const getLatestInboundMessage = (
  messages: AgentHistoryMessage[],
): AgentHistoryMessage | null => {
  const inbounds = messages.filter(isUserMessage);
  if (!inbounds.length) return null;
  return inbounds.reduce((best, message) => {
    const bestTs = Date.parse(best.created_at || "") || 0;
    const nextTs = Date.parse(message.created_at || "") || 0;
    if (nextTs > bestTs) return message;
    if (nextTs === bestTs && (message.id || 0) > (best.id || 0)) return message;
    return best;
  });
};

/** Inbound messages in the current client burst (until last real bot reply). */
export const collectBurstInbound = (messages: AgentHistoryMessage[]) => {
  const latest = getLatestInboundMessage(messages);
  if (!latest) return [];

  const latestTs = Date.parse(latest.created_at || "") || Date.now();
  const burst: AgentHistoryMessage[] = [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (isUserMessage(message)) {
      const createdAt = Date.parse(message.created_at || "") || 0;
      if (latestTs - createdAt > BURST_WINDOW_MS) break;
      burst.push(message);
      continue;
    }
    if (message.type === "out" && !isAckOutbound(message)) break;
  }

  return burst.reverse();
};

export const classifyBurstIntent = (
  burst: AgentHistoryMessage[],
): InboundIntent => {
  const hasImage = burst.some((message) => inboundHasImage(message));
  const hasCedula = burst.some(
    (message) =>
      looksLikeCedula(message.content) ||
      looksLikeCedula(resolveInboundText(message)),
  );
  const joinedText = burst.map((message) => resolveInboundText(message)).join(" ");
  const hasHumanRequest = looksLikeHumanRequest(joinedText);

  if (hasCedula && hasImage) return "cedula_and_image";
  if (hasImage) return "receipt_image";
  if (hasHumanRequest) return "human_request";
  if (hasCedula) return "cedula";
  return "general";
};

export const classifyInboundIntent = (input: {
  latestInbound?: AgentHistoryMessage | null;
  messages?: AgentHistoryMessage[];
}): InboundIntent => {
  const burst = collectBurstInbound(input.messages || []);
  if (burst.length) return classifyBurstIntent(burst);
  if (input.latestInbound) return classifyBurstIntent([input.latestInbound]);
  return "general";
};
