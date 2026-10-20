import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { persistOutboundMessage } from "../../_lib/channel-messages";
import { uploadChannelMedia } from "../../_lib/channel-media";
import { authorizeConversationSend } from "../_lib/authorize-send";

const schema = z.object({
  conversation_id: z.coerce.number().int().positive(),
  agent_id: z.coerce.number().int().positive(),
  duration_ms: z.coerce.number().int().positive().max(5 * 60 * 1000),
  to: z.string().optional(),
});

const voiceLabel = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `Nota de voz (${minutes}:${seconds})`;
};

export const POST = async (request: NextRequest) => {
  try {
    const form = await request.formData();
    const parsed = schema.safeParse({
      conversation_id: form.get("conversation_id"),
      agent_id: form.get("agent_id"),
      duration_ms: form.get("duration_ms"),
      to: form.get("to") || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }
    const audio = form.get("audio");
    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "Debes adjuntar un archivo de audio" }, { status: 400 });
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
      file: audio,
      kind: "audio",
    });

    const saved = await persistOutboundMessage(authorized.supabase, {
      organizationId: String(authorized.conversation.organization_id),
      conversationId: parsed.data.conversation_id,
      content: voiceLabel(parsed.data.duration_ms),
      senderType: authorized.senderType,
      sentBy: authorized.sentBy,
      mediaUrl: uploaded.publicUrl,
      mediaType: "audio",
      mimeType: uploaded.mimeType,
    });

    return NextResponse.json({ success: true, message: saved });
  } catch (error) {
    console.error("[CRM_MESSAGES_SEND_AUDIO]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo enviar el audio" },
      { status: 500 },
    );
  }
};
