import type {
  Message,
  MessageMediaType,
  MessageSenderType,
  MessageType,
} from "./types";

const MESSAGE_TYPES = new Set<MessageType>(["in", "out", "note"]);
const SENDER_TYPES = new Set<MessageSenderType>(["client", "agent", "bot"]);
const MEDIA_TYPES = new Set<MessageMediaType>([
  "audio",
  "image",
  "video",
  "document",
  "location",
]);
const MESSAGE_STATUSES = new Set([
  "sent",
  "delivered",
  "read",
  "failed",
] as const);

const LEGACY_TYPE_MAP: Record<string, MessageType> = {
  in: "in",
  out: "out",
  note: "note",
  incoming: "in",
  outgoing: "out",
  text: "in",
};

const LEGACY_SENDER_MAP: Record<string, MessageSenderType> = {
  client: "client",
  agent: "agent",
  bot: "bot",
  customer: "client",
  user: "client",
  ia: "bot",
  ai: "bot",
};

export const normalizeHistoryMessageType = (value: unknown): MessageType => {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (MESSAGE_TYPES.has(normalized as MessageType)) {
    return normalized as MessageType;
  }

  return LEGACY_TYPE_MAP[normalized] ?? "in";
};

export const normalizeHistorySenderType = (
  value: unknown,
  messageType: MessageType,
): MessageSenderType => {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (SENDER_TYPES.has(normalized as MessageSenderType)) {
    return normalized as MessageSenderType;
  }

  if (LEGACY_SENDER_MAP[normalized]) {
    return LEGACY_SENDER_MAP[normalized];
  }

  if (messageType === "note") return "agent";
  if (messageType === "out") return "bot";
  return "client";
};

export const normalizeHistoryMediaType = (
  value: unknown,
): MessageMediaType | null => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;

  return MEDIA_TYPES.has(normalized as MessageMediaType)
    ? (normalized as MessageMediaType)
    : null;
};

export const normalizeHistoryMessageStatus = (
  value: unknown,
): Message["status"] => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;

  return MESSAGE_STATUSES.has(normalized as NonNullable<Message["status"]>)
    ? (normalized as NonNullable<Message["status"]>)
    : null;
};

export const normalizeHistoryMessageContent = (value: unknown) =>
  String(value ?? "").trim();

export const normalizeMessageForHistory = (message: Message) => {
  const type = normalizeHistoryMessageType(message.type);

  return {
    type,
    content: normalizeHistoryMessageContent(message.content),
    sender_type: normalizeHistorySenderType(message.sender_type, type),
    media_url: message.media_url?.trim() || null,
    media_type: normalizeHistoryMediaType(message.media_type),
    wa_message_id: message.wa_message_id?.trim() || null,
    status: normalizeHistoryMessageStatus(message.status),
    created_at: message.created_at ?? new Date().toISOString(),
  };
};

type SupabaseErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

export const formatArchiveStepError = (
  step: string,
  historyId: number,
  error: unknown,
) => {
  const errorRecord =
    error && typeof error === "object"
      ? (error as SupabaseErrorLike)
      : null;

  const details = [
    errorRecord?.message,
    errorRecord?.code ? `Código: ${errorRecord.code}` : null,
    errorRecord?.details ? `Detalle: ${errorRecord.details}` : null,
    errorRecord?.hint ? `Sugerencia: ${errorRecord.hint}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const suffix = details || String(error);

  return `Historial creado (id ${historyId}) pero falló ${step}: ${suffix}`;
};
