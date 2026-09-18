import { NextRequest, NextResponse } from "next/server";
import {
  canManageOrganization,
  CrmAuthError,
  getCrmAuthContext,
} from "../../_lib/crm-auth-context";
import { getSupabaseAdmin } from "../../_lib/supabase-admin";

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const POST = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    if (!canManageOrganization(context)) {
      return NextResponse.json(
        { error: "Solo administradores pueden cambiar el logo de la organización" },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("logo");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Debes adjuntar un archivo de imagen válido" },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "El archivo no debe exceder los 5 MB" },
        { status: 400 },
      );
    }

    const mimeType = file.type.toLowerCase();
    const extension = ALLOWED_MIME_TYPES[mimeType];
    if (!extension) {
      return NextResponse.json(
        { error: "Formato no compatible. Usa PNG, JPG, WebP o SVG" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const bucket = process.env.SUPABASE_WHATSAPP_IMAGE_BUCKET || "image-bucket";
    const storagePath = `organizations/${context.organizationId}/logo-${Date.now()}.${extension}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: storageError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (storageError) {
      console.error("[CRM_ORG_LOGO] storage_upload_failed", storageError);
      return NextResponse.json(
        { error: "No se pudo almacenar la imagen en Supabase Storage" },
        { status: 500 },
      );
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(storagePath);

    const { data: updatedOrg, error: updateError } = await supabase
      .from("organizations")
      .update({
        logo_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", context.organizationId)
      .select("*")
      .single();

    if (updateError) {
      console.error("[CRM_ORG_LOGO] db_update_failed", updateError);
      return NextResponse.json(
        { error: "Se subió la imagen pero no se pudo actualizar la organización" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      logo_url: publicUrl,
      organization: updatedOrg,
    });
  } catch (error) {
    const status = error instanceof CrmAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al procesar el logo" },
      { status },
    );
  }
};
