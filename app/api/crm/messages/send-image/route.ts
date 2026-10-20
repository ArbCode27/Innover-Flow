import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { persistOutboundMessage } from "../../_lib/channel-messages";
import { uploadChannelMedia } from "../../_lib/channel-media";
import { authorizeConversationSend } from "../_lib/authorize-send";

const schema = z.object({
  conversation_id: z.coerce.number().int().positive(),
  agent_id: z.coerce.number().int().positive(),
  caption: z.string().trim().max(1024).optional(),
  to: z.string().optional(),
});

export const POST = async (request: NextRequest) => {
  try {
    const form = await request.formData();
    const parsed = schema.safeParse({
      conversation_id: form.get("conversation_id"),
      agent_id: form.get("agent_id"),
      caption: form.get("caption") || undefined,
      to: form.get("to") || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }
    const image = form.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json({ error: "Debes adjuntar una imagen" }, { status: 400 });
    }

    const authorized = await authorizeConversationSend(
      request,
      parsed.data.conversation_id,
      parsed.data.agent_id,
    );
    if (authorized.error) return authorized.error;

    const uploaded = await uploadChannelMedia(authorized.supabase, {
      organizationId: String(authorized.conversation.organization_id),
      conversationId: parsed.data.conversation_id,
      file: image,
      kind: "image",
    });

    const saved = await persistOutboundMessage(authorized.supabase, {
      organizationId: String(authorized.conversation.organization_id),
      conversationId: parsed.data.conversation_id,
      content: parsed.data.caption || "Imagen",
      senderType: authorized.senderType,
      sentBy: authorized.sentBy,
      mediaUrl: uploaded.publicUrl,
      mediaType: "image",
      mimeType: uploaded.mimeType,
      caption: parsed.data.caption || null,
    });

    return NextResponse.json({ success: true, message: saved });
  } catch (error) {
    console.error("[CRM_MESSAGES_SEND_IMAGE]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo enviar la imagen" },
      { status: 500 },
    );
  }
};
