import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelMediaType } from "./channel-messages";

const LOG_PREFIX = "[CHANNEL_MEDIA]";

const DEFAULT_BUCKETS = {
  audio: "audio-bucket",
  image: "image-bucket",
  video: "video-bucket",
  document: "document-bucket",
} as const;

type StorableMediaKind = keyof typeof DEFAULT_BUCKETS;

const isStorableMediaKind = (kind: ChannelMediaType): kind is StorableMediaKind =>
  kind === "audio" || kind === "image" || kind === "video" || kind === "document";

const envBucket = (value: string | undefined, fallback: string) => {
  const trimmed = value?.trim();
  return trimmed || fallback;
};

/** Resolves the Supabase Storage bucket for a channel media kind. */
export const getChannelMediaBucketForKind = (kind: ChannelMediaType): string => {
  if (!isStorableMediaKind(kind)) {
    throw new Error(`El tipo de media "${kind}" no se puede subir a Storage`);
  }

  switch (kind) {
    case "audio":
      return envBucket(
        process.env.SUPABASE_WHATSAPP_AUDIO_BUCKET,
        DEFAULT_BUCKETS.audio,
      );
    case "image":
      return envBucket(
        process.env.SUPABASE_WHATSAPP_IMAGE_BUCKET,
        DEFAULT_BUCKETS.image,
      );
    case "video":
      return envBucket(
        process.env.SUPABASE_WHATSAPP_VIDEO_BUCKET,
        DEFAULT_BUCKETS.video,
      );
    case "document":
      return envBucket(
        process.env.SUPABASE_WHATSAPP_DOCUMENT_BUCKET,
        DEFAULT_BUCKETS.document,
      );
  }
};

/**
 * @deprecated Prefer getChannelMediaBucketForKind(kind). Kept for callers that
 * still expect a single bucket name; defaults to image-bucket.
 */
export const getChannelMediaBucket = () =>
  envBucket(
    process.env.SUPABASE_WHATSAPP_IMAGE_BUCKET ||
      process.env.SUPABASE_APP_MEDIA_BUCKET ||
      process.env.SUPABASE_WHATSAPP_MEDIA_BUCKET,
    DEFAULT_BUCKETS.image,
  );

const normalizeMime = (mimeType: string) =>
  mimeType.toLowerCase().split(";")[0]?.trim() || "";

const extensionFor = (mimeType: string, kind: StorableMediaKind) => {
  const mime = normalizeMime(mimeType);

  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";

  if (
    mime === "audio/m4a" ||
    mime === "audio/x-m4a" ||
    mime === "audio/mp4" ||
    mime === "audio/aac"
  ) {
    return mime === "audio/aac" ? "aac" : "m4a";
  }
  if (mime.includes("ogg") || mime.includes("opus")) return "ogg";
  if (mime.includes("mpeg") || mime === "audio/mp3") return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("webm") && kind === "audio") return "webm";
  if (mime.includes("webm") && kind === "video") return "webm";
  if (mime.includes("mp4") && kind === "video") return "mp4";
  if (mime.includes("quicktime")) return "mov";
  if (mime.includes("pdf")) return "pdf";

  if (kind === "image") return "jpg";
  if (kind === "audio") return "m4a";
  if (kind === "video") return "mp4";
  return "bin";
};

const mimeMatchesKind = (mimeType: string, kind: StorableMediaKind) => {
  const mime = normalizeMime(mimeType);
  if (!mime || mime === "application/octet-stream") return true;

  if (kind === "audio") {
    return (
      mime.startsWith("audio/") ||
      // Some Android/Expo builds declare AAC-in-MP4 as video/mp4 or audio/mp4.
      mime === "video/mp4"
    );
  }
  if (kind === "image") return mime.startsWith("image/");
  if (kind === "video") return mime.startsWith("video/");
  // document: allow common binary types
  return (
    mime.startsWith("application/") ||
    mime.startsWith("text/") ||
    mime.startsWith("image/") ||
    mime.startsWith("audio/") ||
    mime.startsWith("video/")
  );
};

export const uploadChannelMedia = async (
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    conversationId: number;
    file: File;
    kind: ChannelMediaType;
  },
) => {
  if (!isStorableMediaKind(input.kind)) {
    throw new Error(`El tipo de media "${input.kind}" no se puede subir a Storage`);
  }

  const mimeType = input.file.type || "application/octet-stream";
  if (!mimeMatchesKind(mimeType, input.kind)) {
    console.warn(`${LOG_PREFIX} mime_mismatch`, {
      kind: input.kind,
      mimeType,
      fileName: input.file.name || null,
      size: input.file.size,
    });
    throw new Error(
      `El tipo de archivo (${mimeType || "desconocido"}) no coincide con ${input.kind}`,
    );
  }

  const extension = extensionFor(mimeType, input.kind);
  const bucket = getChannelMediaBucketForKind(input.kind);
  const storagePath = `${input.organizationId}/${input.conversationId}/${Date.now()}-${randomUUID()}.${extension}`;
  const buffer = Buffer.from(await input.file.arrayBuffer());

  console.log(`${LOG_PREFIX} upload_start`, {
    bucket,
    kind: input.kind,
    mimeType,
    size: buffer.byteLength,
    path: storagePath,
    fileName: input.file.name || null,
  });

  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    console.warn(`${LOG_PREFIX} upload_failed`, {
      bucket,
      kind: input.kind,
      mimeType,
      size: buffer.byteLength,
      path: storagePath,
      error: error.message,
      statusCode:
        "statusCode" in error ? String((error as { statusCode?: unknown }).statusCode) : null,
    });
    throw new Error(error.message || "No se pudo guardar el archivo");
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(storagePath);

  console.log(`${LOG_PREFIX} upload_ok`, {
    bucket,
    kind: input.kind,
    mimeType,
    size: buffer.byteLength,
    path: storagePath,
  });

  return { publicUrl, mimeType, storagePath, bucket };
};
