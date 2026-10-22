import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { listFieldTicketsForClient, toClientAppTicket } from "@/app/api/crm/_lib/field-tickets";
import { FIELD_TICKET_STATUSES } from "@/lib/field-tickets";
import { getAppCustomerAuthContext } from "../_lib/app-auth";
import { APP_ERROR_CODES, toAppErrorResponse } from "../_lib/app-errors";

const parseStatusFilter = (raw: string | null) => {
  if (!raw?.trim()) return null;
  const allowed = new Set<string>(FIELD_TICKET_STATUSES);
  const statuses = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => allowed.has(item));
  return statuses.length ? statuses : null;
};

export const GET = async (request: NextRequest) => {
  try {
    const session = await getAppCustomerAuthContext(request);
    const supabase = getSupabaseAdmin();
    const tickets = await listFieldTicketsForClient(
      supabase,
      session.organizationId,
      {
        clientId: session.clientId,
        phone: session.phone,
      },
    );

    const statuses = parseStatusFilter(request.nextUrl.searchParams.get("status"));
    const filtered = statuses
      ? tickets.filter((ticket) => statuses.includes(ticket.status))
      : tickets;

    return NextResponse.json({
      tickets: filtered.map(toClientAppTicket),
    });
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.TICKETS_LOAD_FAILED,
      error: "No se pudieron cargar tus tickets. Intenta de nuevo.",
    });
  }
};
