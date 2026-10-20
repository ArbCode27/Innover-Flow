import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { persistOutboundMessage } from "../../_lib/channel-messages";
import { authorizeConversationSend } from "../_lib/authorize-send";

const schema = z.object({
  message: z.string().trim().min(1).max(4096),
  conversation_id: z.coerce.number().int().positive(),
  agent_id: z.coerce.number().int().positive().optional(),
  to: z.string().optional(),
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

    const saved = await persistOutboundMessage(authorized.supabase, {
      organizationId: String(authorized.conversation.organization_id),
      conversationId: parsed.data.conversation_id,
      content: parsed.data.message,
      senderType: authorized.senderType,
      sentBy: authorized.sentBy,
    });

    return NextResponse.json({
      success: true,
      message: saved,
    });
  } catch (error) {
    console.error("[CRM_MESSAGES_SEND]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo enviar el mensaje" },
      { status: 500 },
    );
  }
};
