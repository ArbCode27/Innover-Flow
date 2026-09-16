const MIME_TYPE_FALLBACK = "application/octet-stream";

const MIME_ALIASES: Record<string, string> = {
  "audio/mp3": "audio/mpeg",
};

export const normalizeStorageMimeType = (
  mimeType: string | null | undefined,
  fallback: string = MIME_TYPE_FALLBACK,
) => {
  const normalized = (mimeType || "").toLowerCase().trim();
  if (!normalized) return fallback;

  const baseMimeType = normalized.split(";")[0]?.trim();
  if (!baseMimeType) return fallback;

  return MIME_ALIASES[baseMimeType] || baseMimeType;
};
