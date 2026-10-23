import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  findOrCreateTechnicianConversation,
  persistInboundMessage,
} from "@/app/api/crm/_lib/channel-messages";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { getAppTechnicianAuthContext } from "../../_lib/app-auth";
import {
  APP_ERROR_CODES,
  AppApiError,
  parseAppJsonBody,
  parseAppSchema,
  toAppErrorResponse,
} from "../../_lib/app-errors";
import { loadAppTechnician } from "../../_lib/load-app-technician";
import { buildAppRealtimePayload } from "../../_lib/realtime-payload";

const textSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "El mensaje no puede estar vacío")
    .max(4096, "El mensaje es demasiado largo (máximo 4096 caracteres)"),
});

export const GET = async (request: NextRequest) => {
  try {
    const session = await getAppTechnicianAuthContext(request);
    const supabase = getSupabaseAdmin();
    const technician = await loadAppTechnician(supabase, {
      technicianId: session.technicianId,
      organizationId: session.organizationId,
    });
    const conversation = await findOrCreateTechnicianConversation(
      supabase,
      session.organizationId,
      technician,
    );

    const afterId = Number(request.nextUrl.searchParams.get("after_id") || 0);
    let query = supabase
      .from("messages")
      .select("*")
      .eq("organization_id", session.organizationId)
      .eq("conversation_id", conversation.id)
      .neq("type", "note")
      .order("created_at", { ascending: true })
      .limit(200);
    if (Number.isInteger(afterId) && afterId > 0) {
      query = query.gt("id", afterId);
    }
    const { data: messages, error } = await query;
    if (error) throw error;

    const realtime = await buildAppRealtimePayload({
      technicianId: technician.id,
      organizationId: session.organizationId,
      conversationId: Number(conversation.id),
    });

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        status: conversation.status,
        human_mode: conversation.human_mode,
        channel: "technician_app",
      },
      messages: messages || [],
      realtime,
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
    const session = await getAppTechnicianAuthContext(request);
    const supabase = getSupabaseAdmin();
    const technician = await loadAppTechnician(supabase, {
      technicianId: session.technicianId,
      organizationId: session.organizationId,
    });
    const conversation = await findOrCreateTechnicianConversation(
      supabase,
      session.organizationId,
      technician,
    );

    const { content } = parseAppSchema(
      textSchema,
      await parseAppJsonBody(request),
      "El mensaje no es válido.",
    );

    if (conversation.status === "resuelto") {
      throw new AppApiError(
        APP_ERROR_CODES.VALIDATION_ERROR,
        "Este chat está cerrado. Contacta a oficina para reabrirlo.",
        400,
      );
    }

    const message = await persistInboundMessage(supabase, {
      organizationId: session.organizationId,
      conversationId: Number(conversation.id),
      content,
      senderType: "technician",
      sentBy: technician.name,
      metadata: {
        channel: "technician_app",
        technician_id: technician.id,
      },
    });

    await supabase
      .from("conversations")
      .update({
        unread: Number(conversation.unread || 0) + 1,
        human_mode: true,
      })
      .eq("id", conversation.id)
      .eq("organization_id", session.organizationId);

    return NextResponse.json({
      success: true,
      message,
      conversation: {
        id: conversation.id,
        status: conversation.status,
        human_mode: true,
        channel: "technician_app",
      },
    });
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.MESSAGE_SEND_FAILED,
      error: "No se pudo enviar el mensaje. Intenta de nuevo.",
    });
  }
};
