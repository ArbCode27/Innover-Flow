import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { findOrCreateOpenConversation } from "@/app/api/crm/_lib/channel-messages";
import { getAppCustomerAuthContext } from "../_lib/app-auth";
import { APP_ERROR_CODES, toAppErrorResponse } from "../_lib/app-errors";
import { buildAppRealtimePayload } from "../_lib/realtime-payload";

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
    const realtime = await buildAppRealtimePayload({
      clientId: session.clientId,
      organizationId: session.organizationId,
      conversationId: Number(conversation.id),
    });

    if (!realtime) {
      return NextResponse.json(
        {
          error:
            "El canal en tiempo real no está configurado. Usa GET /api/app/messages mientras tanto.",
          code: APP_ERROR_CODES.SERVICE_UNAVAILABLE,
          realtime: null,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      realtime,
      conversation: {
        id: conversation.id,
        status: conversation.status,
        human_mode: conversation.human_mode,
      },
    });
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.SESSION_FAILED,
      error: "No se pudo renovar el canal en tiempo real. Intenta de nuevo.",
    });
  }
};
