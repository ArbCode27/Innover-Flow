import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "../../_lib/supabase-admin";
import { replyToConversationWithAi } from "../_lib/reply-to-conversation";
import { withOrganizationWhatsapp } from "../../_lib/whatsapp-runtime";
import { withOptionalOrganizationWispro } from "../../_lib/wispro-api";

const LOG_PREFIX = "[AI_AGENT]";

const payloadSchema = z.object({
  conversation_id: z.coerce.number().int().positive(),
  message_id: z.coerce.number().int().positive().optional(),
});

const isAuthorized = (req: NextRequest) => {
  const secret = process.env.CRM_INTERNAL_SECRET?.trim() || "";

  if (!secret) {
    console.error(`${LOG_PREFIX} CRM_INTERNAL_SECRET is not configured`);
    return false;
  }

  const header = req.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const alt = req.headers.get("x-crm-internal-secret")?.trim() || "";

  return bearer === secret || alt === secret;
};

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const payload = payloadSchema.safeParse(await req.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("organization_id")
      .eq("id", payload.data.conversation_id)
      .maybeSingle();
    if (conversationError || !conversation?.organization_id) {
      return NextResponse.json(
        { error: "Conversación no encontrada" },
        { status: 404 },
      );
    }
    const organizationId = String(conversation.organization_id);
    const result = await withOrganizationWhatsapp(
      organizationId,
      () =>
        withOptionalOrganizationWispro(organizationId, () =>
          replyToConversationWithAi(supabase, {
            conversationId: payload.data.conversation_id,
            triggerMessageId: payload.data.message_id ?? null,
          }),
        ),
    );

    if (!result.ok) {
      console.error(`${LOG_PREFIX} no_reply`, {
        conversationId: payload.data.conversation_id,
        messageId: payload.data.message_id ?? null,
        skipped: result.skipped ?? false,
        reason: result.reason,
        willReplyToClient: false,
      });
    } else {
      console.log(`${LOG_PREFIX} ok`, {
        conversationId: payload.data.conversation_id,
        action: result.action ?? null,
        reason: result.reason,
        messageId: result.messageId ?? null,
        willReplyToClient: true,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error(`${LOG_PREFIX} unexpected_error`, {
      error: error instanceof Error ? error.message : "unknown_error",
      willReplyToClient: false,
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error interno al generar respuesta IA",
      },
      { status: 500 },
    );
  }
}
