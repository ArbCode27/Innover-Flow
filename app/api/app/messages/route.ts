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
import { logMessageEvent } from "@/lib/message-event-log";
import { getAppCustomerAuthContext } from "../_lib/app-auth";
import {
  APP_ERROR_CODES,
  AppApiError,
  parseAppJsonBody,
  parseAppSchema,
  toAppErrorResponse,
} from "../_lib/app-errors";

const textSchema = z.object({
  content: z
    .string({ invalid_type_error: "El mensaje no es válido" })
    .trim()
    .min(1, "El mensaje no puede estar vacío")
    .max(4096, "El mensaje es demasiado largo (máximo 4096 caracteres)"),
});

const scheduleAi = (
  organizationId: string,
  conversationId: number,
  messageId: number,
  humanMode: boolean,
  mediaType: ChannelMediaType | null,
) => {
  const eligible = !mediaType || mediaType === "image" || mediaType === "audio";
  const skipReason = humanMode
    ? "human_mode"
    : !eligible
      ? "media_not_eligible"
      : null;
  const willRun = skipReason === null;

  logMessageEvent("ai_schedule", {
    organizationId,
    conversationId,
    messageId,
    humanMode,
    mediaType,
    willRun,
    skipReason,
  });

  if (!willRun) return;

  after(async () => {
    logMessageEvent("ai_after_started", {
      organizationId,
      conversationId,
      messageId,
    });
    const supabase = getSupabaseAdmin();
    try {
      const result = await withOptionalOrganizationWispro(organizationId, () =>
        replyToConversationWithAi(supabase, {
          conversationId,
          triggerMessageId: messageId,
        }),
      );
      logMessageEvent("ai_after_finished", {
        organizationId,
        conversationId,
        messageId,
        ok: result.ok,
        skipped: Boolean(result.skipped),
        reason: result.reason,
        action: result.action ?? null,
        replyMessageId: result.messageId ?? null,
      });
    } catch (error) {
      logMessageEvent(
        "ai_after_finished",
        {
          organizationId,
          conversationId,
          messageId,
          ok: false,
          error: error instanceof Error ? error.message : "unknown",
        },
        "error",
      );
    }
  });
};

export const GET = async (request: NextRequest) => {
  try {
    const session = await getAppCustomerAuthContext(request);
    const supabase = getSupabaseAdmin();
    const conversation = await findOrCreateOpenConversation(
      supabase,
      session.organizationId,
      session.clientId,
      session.phone,
    );
    const afterId = Number(request.nextUrl.searchParams.get("after_id") || 0);
    let query = supabase
      .from("messages")
      .select("*")
      .eq("organization_id", session.organizationId)
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (Number.isInteger(afterId) && afterId > 0) {
      query = query.gt("id", afterId);
    }
    const { data: messages, error } = await query;
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
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.MESSAGE_LOAD_FAILED,
      error: "No se pudieron cargar los mensajes. Intenta de nuevo.",
    });
  }
};

export const POST = async (request: NextRequest) => {
  try {
    const session = await getAppCustomerAuthContext(request);
    const supabase = getSupabaseAdmin();
    const conversation = await findOrCreateOpenConversation(
      supabase,
      session.organizationId,
      session.clientId,
      session.phone,
    );

    const contentType = request.headers.get("content-type") || "";
    const isMultipart = contentType.includes("multipart/form-data");
    logMessageEvent("app_post_received", {
      organizationId: session.organizationId,
      clientId: session.clientId,
      conversationId: Number(conversation.id),
      humanMode: Boolean(conversation.human_mode),
      conversationStatus: conversation.status ?? null,
      contentType: isMultipart ? "multipart" : "json",
    });

    let content = "";
    let mediaUrl: string | null = null;
    let mediaType: ChannelMediaType | null = null;
    let mimeType: string | null = null;
    let caption: string | null = null;

    if (isMultipart) {
      const form = await request.formData();
      const file = form.get("file");
      const kindRaw = String(form.get("media_type") || "image");
      const kind: ChannelMediaType =
        kindRaw === "audio" || kindRaw === "image" || kindRaw === "video" || kindRaw === "document"
          ? kindRaw
          : "image";
      caption = String(form.get("caption") || "").trim() || null;
      if (file instanceof File) {
        let uploaded;
        try {
          uploaded = await uploadChannelMedia(supabase, {
            organizationId: session.organizationId,
            conversationId: Number(conversation.id),
            file,
            kind,
          });
        } catch {
          throw new AppApiError(
            APP_ERROR_CODES.MEDIA_UPLOAD_FAILED,
            "No se pudo subir el archivo. Intenta con otro o más tarde.",
            400,
          );
        }
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
      const parsed = parseAppSchema(
        textSchema,
        await parseAppJsonBody(request),
        "El mensaje no es válido",
      );
      content = parsed.content;
    }

    if (!content.trim()) {
      throw new AppApiError(
        APP_ERROR_CODES.MESSAGE_EMPTY,
        "El mensaje no puede estar vacío",
        400,
      );
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
    logMessageEvent(
      "app_post_failed",
      {
        error: error instanceof Error ? error.message : "unknown",
        code: error instanceof AppApiError ? error.code : null,
      },
      "error",
    );
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.MESSAGE_SEND_FAILED,
      error: "No se pudo enviar el mensaje. Intenta de nuevo.",
    });
  }
};
