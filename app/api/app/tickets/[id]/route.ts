import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import {
  getFieldTicketForClient,
  toClientAppTicket,
} from "@/app/api/crm/_lib/field-tickets";
import { getAppCustomerAuthContext } from "../../_lib/app-auth";
import { APP_ERROR_CODES, toAppErrorResponse } from "../../_lib/app-errors";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = async (request: NextRequest, context: RouteContext) => {
  try {
    const session = await getAppCustomerAuthContext(request);
    const { id } = await context.params;
    const ticket = await getFieldTicketForClient(
      getSupabaseAdmin(),
      session.organizationId,
      id,
      {
        clientId: session.clientId,
        phone: session.phone,
      },
    );

    return NextResponse.json({ ticket: toClientAppTicket(ticket) });
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.TICKET_LOAD_FAILED,
      error: "No se pudo cargar el ticket. Intenta de nuevo.",
    });
  }
};
