export const CHAT_PUSH_PREVIEW_MAX_LENGTH = 80;

export const CHAT_PUSH_MEDIA_PREVIEW = {
  image: "Te enviaron una imagen",
  audio: "Te enviaron un audio",
  video: "Te enviaron un video",
  document: "Te enviaron un archivo",
  location: "Te enviaron una ubicación",
} as const;

export type ChatPushMediaType = keyof typeof CHAT_PUSH_MEDIA_PREVIEW;

const isChatPushMediaType = (value: string): value is ChatPushMediaType =>
  value in CHAT_PUSH_MEDIA_PREVIEW;

const GENERIC_CHAT_PUSH_PREVIEW = "Nuevo mensaje";

export const buildChatPushPreview = (input: {
  content?: string | null;
  mediaType?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): string => {
  const mediaType = String(input.mediaType || "").trim();
  if (isChatPushMediaType(mediaType)) {
    return CHAT_PUSH_MEDIA_PREVIEW[mediaType];
  }

  if (input.latitude != null && input.longitude != null) {
    return CHAT_PUSH_MEDIA_PREVIEW.location;
  }

  let text = String(input.content ?? "");
  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/`[^`]*`/g, " ");
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  text = text.replace(/[#*_>~]+/g, " ");

  const trimmed = text.trim();
  if (/^[{\[]/.test(trimmed)) {
    return GENERIC_CHAT_PUSH_PREVIEW;
  }

  text = trimmed.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    " ",
  );
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return GENERIC_CHAT_PUSH_PREVIEW;
  return text.slice(0, CHAT_PUSH_PREVIEW_MAX_LENGTH);
};
