import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  getCrmAuthContext,
} from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const isAllowedImageMime = (mimeType: string) => {
  const normalized = mimeType.toLowerCase();
  return (
    normalized === "image/jpeg" ||
    normalized === "image/jpg" ||
    normalized === "image/png" ||
    normalized === "image/webp"
  );
};

const extensionForMime = (mimeType: string) => {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
};

export const POST = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    const formData = await request.formData();
    const image = formData.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json({ error: "Debes adjuntar una imagen" }, { status: 400 });
    }
    if (image.size <= 0 || image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "La imagen no es válida o supera 5 MB" },
        { status: 400 },
      );
    }
    const mimeType = (image.type || "").toLowerCase();
    if (!isAllowedImageMime(mimeType)) {
      return NextResponse.json(
        { error: "Formato de imagen no soportado" },
        { status: 400 },
      );
    }

    const bucket =
      process.env.SUPABASE_WHATSAPP_IMAGE_BUCKET ||
      process.env.SUPABASE_WHATSAPP_MEDIA_BUCKET ||
      "image-bucket";
    const path = `${context.organizationId}/field-tickets/${randomUUID()}.${extensionForMime(mimeType)}`;
    const buffer = Buffer.from(await image.arrayBuffer());
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
      contentType: mimeType,
      upsert: false,
    });
    if (error) throw error;

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return NextResponse.json({ data: { url: data.publicUrl } });
  } catch (error) {
    if (error instanceof CrmAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[FIELD_TICKETS_MEDIA]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo subir la imagen" },
      { status: 500 },
    );
  }
};
