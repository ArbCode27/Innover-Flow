import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import {
  findOrCreateOpenConversation,
  findOrCreateTechnicianConversation,
} from "@/app/api/crm/_lib/channel-messages";
import {
  getAppAuthContext,
  getAppCustomerAuthContext,
  getAppTechnicianAuthContext,
} from "../_lib/app-auth";
import { APP_ERROR_CODES, toAppErrorResponse } from "../_lib/app-errors";
import { loadAppTechnician } from "../_lib/load-app-technician";
import { buildAppRealtimePayload } from "../_lib/realtime-payload";

export const GET = async (request: NextRequest) => {
  try {
    const auth = await getAppAuthContext(request);
    const supabase = getSupabaseAdmin();

    if (auth.role === "technician" || auth.role === "supervisor") {
      const session = await getAppTechnicianAuthContext(request);
      const technician = await loadAppTechnician(supabase, {
        technicianId: session.technicianId,
        organizationId: session.organizationId,
      });
      const conversation = await findOrCreateTechnicianConversation(
        supabase,
        session.organizationId,
        technician,
      );
      const realtime = await buildAppRealtimePayload({
        technicianId: technician.id,
        organizationId: session.organizationId,
        conversationId: Number(conversation.id),
      });

      if (!realtime) {
        return NextResponse.json(
          {
            error:
              "El canal en tiempo real no está configurado. Usa GET /api/app/technician/messages mientras tanto.",
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
          channel: "technician_app",
        },
      });
    }

    const session = await getAppCustomerAuthContext(request);
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
