import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getCrmAuthContext } from "../../crm/_lib/crm-auth-context";
import { getOrganizationIntegration } from "../../crm/_lib/organization-integrations";

const GRAPH_API_VERSION = "v19.0";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_STORAGE_BUCKET = "whatsapp-media";
const IMAGE_BUCKET_ENV_KEY = "SUPABASE_WHATSAPP_IMAGE_BUCKET";
const LEGACY_MEDIA_BUCKET_ENV_KEY = "SUPABASE_WHATSAPP_MEDIA_BUCKET";

const metadataSchema = z.object({
  to: z.string().trim().min(1, "El destinatario es requerido"),
  conversation_id: z.coerce.number().int().positive(),
  agent_id: z.coerce.number().int().positive(),
  caption: z
    .string()
    .trim()
    .max(1024, "El pie de foto no puede superar 1024 caracteres")
    .optional(),
});

const normalizeWhatsAppPhone = (phone: string) => phone.replace(/\D/g, "");

const getServerEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

const isAllowedImageMime = (mimeType: string) => {
  const normalized = mimeType.toLowerCase();
  return (
    normalized === "image/jpeg" ||
    normalized === "image/jpg" ||
    normalized === "image/png" ||
    normalized === "image/webp"
  );
};

const getMimeExtension = (mimeType: string) => {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const payload = metadataSchema.safeParse({
      to: formData.get("to"),
      conversation_id: formData.get("conversation_id"),
      agent_id: formData.get("agent_id"),
      caption: formData.get("caption") ?? undefined,
    });

    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const image = formData.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json(
        { error: "Debes adjuntar una imagen" },
        { status: 400 },
      );
    }

    if (image.size <= 0) {
      return NextResponse.json(
        { error: "La imagen no es válida" },
        { status: 400 },
      );
    }

    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "La imagen supera el límite de 5 MB" },
        { status: 400 },
      );
    }

    const normalizedMimeType = (image.type || "").toLowerCase().trim();
    if (!isAllowedImageMime(normalizedMimeType)) {
      return NextResponse.json(
        { error: "Formato de imagen no soportado" },
        { status: 400 },
      );
    }

    const { to, conversation_id, agent_id, caption } = payload.data;
    const normalizedTo = normalizeWhatsAppPhone(to);
    if (normalizedTo.length < 8 || normalizedTo.length > 15) {
      return NextResponse.json(
        { error: "El número de WhatsApp no tiene un formato válido" },
        { status: 400 },
      );
    }

    const supabase = createClient(
      getServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id, organization_id, client_id, human_mode, customer_phone")
      .eq("id", conversation_id)
      .maybeSingle();

    if (conversationError) {
      console.error("Error Supabase conversation:", conversationError);
      return NextResponse.json(
        { error: "No se pudo validar la conversación" },
        { status: 500 },
      );
    }

    if (!conversation) {
      return NextResponse.json(
        { error: "La conversación no existe" },
        { status: 404 },
      );
    }

    if (!conversation.human_mode) {
      return NextResponse.json(
        { error: "Debes tomar control de la conversación para enviar imágenes" },
        { status: 403 },
      );
    }

    const context = await getCrmAuthContext(req);
    if (
      context.agentId !== agent_id ||
      context.organizationId !== conversation.organization_id
    ) {
      return NextResponse.json(
        { error: "No tienes acceso a esta conversación" },
        { status: 403 },
      );
    }

    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, name, status")
      .eq("id", agent_id)
      .eq("organization_id", conversation.organization_id)
      .maybeSingle();

    if (agentError) {
      console.error("Error Supabase agent:", agentError);
      return NextResponse.json(
        { error: "No se pudo validar el agente" },
        { status: 500 },
      );
    }

    if (!agent) {
      return NextResponse.json(
        { error: "El agente no existe" },
        { status: 404 },
      );
    }

    if (agent.status === "inactive") {
      return NextResponse.json(
        { error: "El agente está inactivo y no puede enviar mensajes" },
        { status: 403 },
      );
    }

    if (conversation.client_id) {
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("phone, whatsapp_id")
        .eq("id", conversation.client_id)
        .eq("organization_id", conversation.organization_id)
        .maybeSingle();

      if (clientError) {
        console.error("Error Supabase client:", clientError);
        return NextResponse.json(
          { error: "No se pudo validar el cliente de la conversación" },
          { status: 500 },
        );
      }

      const knownPhones = [
        conversation.customer_phone,
        client?.whatsapp_id,
        client?.phone,
      ]
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => normalizeWhatsAppPhone(value));

      if (
        knownPhones.length > 0 &&
        !knownPhones.includes(normalizedTo)
      ) {
        return NextResponse.json(
          { error: "El destinatario no coincide con el contacto de la conversación" },
          { status: 400 },
        );
      }
    } else if (conversation.customer_phone) {
      if (
        normalizeWhatsAppPhone(conversation.customer_phone) !== normalizedTo
      ) {
        return NextResponse.json(
          { error: "El destinatario no coincide con el contacto de la conversación" },
          { status: 400 },
        );
      }
    }

    const bucket =
      process.env[IMAGE_BUCKET_ENV_KEY] ||
      process.env[LEGACY_MEDIA_BUCKET_ENV_KEY] ||
      DEFAULT_STORAGE_BUCKET;
    const extension = getMimeExtension(normalizedMimeType);
    const storagePath = `${conversation.organization_id}/images/${conversation_id}/${Date.now()}-${randomUUID()}.${extension}`;
    const imageBuffer = Buffer.from(await image.arrayBuffer());

    const { error: storageError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, imageBuffer, {
        contentType: normalizedMimeType,
        upsert: false,
      });

    if (storageError) {
      console.error("Error Supabase storage:", storageError);
      return NextResponse.json(
        { error: "No se pudo guardar la imagen" },
        { status: 500 },
      );
    }

    const {
      data: { publicUrl: mediaUrl },
    } = supabase.storage.from(bucket).getPublicUrl(storagePath);

    const uploadFormData = new FormData();
    uploadFormData.append("messaging_product", "whatsapp");
    uploadFormData.append("type", normalizedMimeType);
    uploadFormData.append(
      "file",
      new Blob([imageBuffer], { type: normalizedMimeType }),
      `image.${extension}`,
    );

    const whatsapp = await getOrganizationIntegration(
      String(conversation.organization_id),
      "whatsapp",
    );
    const whatsappToken = whatsapp.secret;
    const phoneNumberId = String(whatsapp.config.phone_number_id || "");

    const uploadResponse = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/media`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${whatsappToken}`,
        },
        body: uploadFormData,
      },
    );

    const uploadData = await uploadResponse.json();
    if (!uploadResponse.ok || uploadData.error || !uploadData.id) {
      console.error("Error Meta media upload:", uploadData.error || uploadData);
      return NextResponse.json(
        { error: uploadData.error?.message || "No se pudo subir la imagen a WhatsApp" },
        { status: 500 },
      );
    }

    const trimmedCaption = caption?.trim();
    const sendResponse = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${whatsappToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: normalizedTo,
          type: "image",
          image: {
            id: uploadData.id,
            ...(trimmedCaption ? { caption: trimmedCaption } : {}),
          },
        }),
      },
    );

    const sendData = await sendResponse.json();
    if (!sendResponse.ok || sendData.error) {
      console.error("Error Meta send image:", sendData.error || sendData);
      return NextResponse.json(
        { error: sendData.error?.message || "Error al enviar imagen por WhatsApp" },
        { status: 500 },
      );
    }

    const wa_message_id = sendData.messages?.[0]?.id || null;
    const dbContent = trimmedCaption || "Imagen";

    const { data: savedMessage, error: dbError } = await supabase
      .from("messages")
      .insert({
        organization_id: conversation.organization_id,
        conversation_id,
        wa_message_id,
        type: "out",
        content: dbContent,
        media_url: mediaUrl,
        media_type: "image",
        sender_type: "agent",
        sent_by: agent.name,
        status: "sent",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (dbError) {
      console.error("Error Supabase save image message:", dbError);
      return NextResponse.json(
        { error: "Imagen enviada pero no registrada en BD" },
        { status: 500 },
      );
    }

    const now = new Date().toISOString();
    const { error: conversationUpdateError } = await supabase
      .from("conversations")
      .update({
        preview: dbContent,
        updated_at: now,
        last_message_at: now,
      })
      .eq("id", conversation_id)
      .eq("organization_id", conversation.organization_id);

    if (conversationUpdateError) {
      console.error("Error Supabase conversation update:", conversationUpdateError);
      return NextResponse.json(
        { error: "Imagen enviada pero no se actualizó la conversación" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      wa_message_id,
      message: savedMessage,
    });
  } catch (error) {
    console.error("Error inesperado en send-image:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
