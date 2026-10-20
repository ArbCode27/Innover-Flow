import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChannelMediaType } from "./channel-messages";

const DEFAULT_BUCKET = "app-media";

export const getChannelMediaBucket = () =>
  process.env.SUPABASE_APP_MEDIA_BUCKET?.trim() ||
  process.env.SUPABASE_WHATSAPP_MEDIA_BUCKET?.trim() ||
  DEFAULT_BUCKET;

const extensionFor = (mimeType: string, kind: ChannelMediaType) => {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "mp4";
  if (kind === "image") return "jpg";
  if (kind === "audio") return "webm";
  return "bin";
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
  const mimeType = input.file.type || "application/octet-stream";
  const extension = extensionFor(mimeType, input.kind);
  const bucket = getChannelMediaBucket();
  const storagePath = `${input.organizationId}/${input.kind}/${input.conversationId}/${Date.now()}-${randomUUID()}.${extension}`;
  const buffer = Buffer.from(await input.file.arrayBuffer());

  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) {
    throw new Error(error.message || "No se pudo guardar el archivo");
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(storagePath);

  return { publicUrl, mimeType, storagePath, bucket };
};
