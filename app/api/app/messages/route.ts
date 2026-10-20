import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { uploadChannelMedia } from "@/app/api/crm/_lib/channel-media";
import {
  findOrCreateOpenConversation,
  persistInboundMessage,
  type ChannelMediaType,
} from "@/app/api/crm/_lib/channel-messages";
import { withOptionalOrganizationWispro } from "@/app/api/crm/_lib/wispro-api";
import { replyToConversationWithAi } from "@/app/api/crm/ai/_lib/reply-to-conversation";
import { AppAuthError, getAppAuthContext } from "../_lib/app-auth";

const textSchema = z.object({
  content: z.string().trim().min(1).max(4096),
});

const scheduleAi = (
  organizationId: string,
  conversationId: number,
  messageId: number,
  humanMode: boolean,
  mediaType: ChannelMediaType | null,
) => {
  const eligible = !mediaType || mediaType === "image" || mediaType === "audio";
  if (humanMode || !eligible) return;
  after(async () => {
    const supabase = getSupabaseAdmin();
    try {
      await withOptionalOrganizationWispro(organizationId, () =>
        replyToConversationWithAi(supabase, {
          conversationId,
          triggerMessageId: messageId,
        }),
      );
    } catch (error) {
      console.error("[APP_CHANNEL] ai_reply_failed", {
        conversationId,
        messageId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  });
};

export const GET = async (request: NextRequest) => {
  try {
    const session = await getAppAuthContext(request);
    const supabase = getSupabaseAdmin();
    const conversation = await findOrCreateOpenConversation(
      supabase,
      session.organizationId,
      session.clientId,
      session.phone,
    );
    const { data: messages, error } = await supabase
      .from("messages")
      .select("*")
      .eq("organization_id", session.organizationId)
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({
      conversation: {
        id: conversation.id,
        status: conversation.status,
        human_mode: conversation.human_mode,
      },
      messages: messages || [],
    });
  } catch (error) {
    const status = error instanceof AppAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar los mensajes" },
      { status },
    );
  }
};

export const POST = async (request: NextRequest) => {
  try {
    const session = await getAppAuthContext(request);
    const supabase = getSupabaseAdmin();
    const conversation = await findOrCreateOpenConversation(
      supabase,
      session.organizationId,
      session.clientId,
      session.phone,
    );

    const contentType = request.headers.get("content-type") || "";
    let content = "";
    let mediaUrl: string | null = null;
    let mediaType: ChannelMediaType | null = null;
    let mimeType: string | null = null;
    let caption: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const kindRaw = String(form.get("media_type") || "image");
      const kind: ChannelMediaType =
        kindRaw === "audio" || kindRaw === "image" || kindRaw === "video" || kindRaw === "document"
          ? kindRaw
          : "image";
      caption = String(form.get("caption") || "").trim() || null;
      if (file instanceof File) {
        const uploaded = await uploadChannelMedia(supabase, {
          organizationId: session.organizationId,
          conversationId: Number(conversation.id),
          file,
          kind,
        });
        mediaUrl = uploaded.publicUrl;
        mimeType = uploaded.mimeType;
        mediaType = kind;
        content =
          caption ||
          (kind === "audio"
            ? "Nota de voz"
            : kind === "image"
              ? "Imagen"
              : kind === "video"
                ? "Video"
                : "Archivo");
      } else {
        content = caption || String(form.get("content") || "").trim();
      }
    } else {
      const parsed = textSchema.safeParse(await request.json());
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Datos inválidos" },
          { status: 400 },
        );
      }
      content = parsed.data.content;
    }

    if (!content.trim()) {
      return NextResponse.json({ error: "El mensaje no puede estar vacío" }, { status: 400 });
    }

    const saved = await persistInboundMessage(supabase, {
      organizationId: session.organizationId,
      conversationId: Number(conversation.id),
      content,
      mediaUrl,
      mediaType,
      mimeType,
      caption,
    });

    scheduleAi(
      session.organizationId,
      Number(conversation.id),
      Number(saved.id),
      Boolean(conversation.human_mode),
      mediaType,
    );

    return NextResponse.json({ success: true, message: saved });
  } catch (error) {
    const status = error instanceof AppAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo enviar el mensaje" },
      { status },
    );
  }
};
