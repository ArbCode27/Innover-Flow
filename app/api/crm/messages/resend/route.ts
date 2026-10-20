import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { persistOutboundMessage, type ChannelMediaType } from "../../_lib/channel-messages";
import { authorizeConversationSend } from "../_lib/authorize-send";

const schema = z.object({
  message_id: z.coerce.number().int().positive(),
  conversation_id: z.coerce.number().int().positive(),
  agent_id: z.coerce.number().int().positive(),
});

export const POST = async (request: NextRequest) => {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const authorized = await authorizeConversationSend(
      request,
      parsed.data.conversation_id,
      parsed.data.agent_id,
    );
    if (authorized.error) return authorized.error;

    const { data: original, error } = await authorized.supabase
      .from("messages")
      .select("*")
      .eq("id", parsed.data.message_id)
      .eq("conversation_id", parsed.data.conversation_id)
      .eq("organization_id", authorized.conversation.organization_id)
      .maybeSingle();

    if (error || !original) {
      return NextResponse.json({ error: "El mensaje no existe" }, { status: 404 });
    }

    const saved = await persistOutboundMessage(authorized.supabase, {
      organizationId: String(authorized.conversation.organization_id),
      conversationId: parsed.data.conversation_id,
      content: String(original.content || "Mensaje"),
      senderType: authorized.senderType,
      sentBy: authorized.sentBy,
      mediaUrl: original.media_url || null,
      mediaType: (original.media_type as ChannelMediaType | null) || null,
      mimeType: original.mime_type || null,
      caption: original.caption || null,
      metadata: { resent_from: original.id },
    });

    return NextResponse.json({ success: true, message: saved });
  } catch (error) {
    console.error("[CRM_MESSAGES_RESEND]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo reenviar el mensaje" },
      { status: 500 },
    );
  }
};
