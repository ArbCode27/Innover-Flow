export const MSG_EVENT_PREFIX = "[MSG_EVENT]";
export const MESSAGE_PREVIEW_MAX_LENGTH = 80;

export const MESSAGE_EVENT_NAMES = [
  "app_post_received",
  "app_post_failed",
  "app_media_upload_failed",
  "db_insert",
  "db_insert_failed",
  "ai_schedule",
  "ai_after_started",
  "ai_after_finished",
  "crm_realtime_auth",
  "crm_realtime_status",
  "crm_realtime_message",
  "crm_realtime_conversation",
  "app_realtime_status",
  "app_realtime_message",
] as const;

export type MessageEventName = (typeof MESSAGE_EVENT_NAMES)[number];
export type MessageEventLevel = "info" | "warn" | "error";

const SENSITIVE_KEY =
  /token|secret|password|authorization|jwt|apikey|access_token|cookie|bearer/i;

export const previewMessage = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MESSAGE_PREVIEW_MAX_LENGTH);

const redactValue = (value: unknown) => {
  if (typeof value === "string") return value ? "[redacted]" : "";
  return Boolean(value);
};

export const sanitizeMessageEventDetails = (
  details: Record<string, unknown>,
) => {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    sanitized[key] = SENSITIVE_KEY.test(key) ? redactValue(value) : value;
  }
  return sanitized;
};

export const logMessageEvent = (
  event: MessageEventName,
  details: Record<string, unknown> = {},
  level: MessageEventLevel = "info",
) => {
  const payload = sanitizeMessageEventDetails(details);
  if (level === "error") {
    console.error(MSG_EVENT_PREFIX, event, payload);
    return;
  }
  if (level === "warn") {
    console.warn(MSG_EVENT_PREFIX, event, payload);
    return;
  }
  console.log(MSG_EVENT_PREFIX, event, payload);
};
