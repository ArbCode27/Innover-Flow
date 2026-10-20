import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import {
  FieldTicketError,
  listFieldTicketsForClient,
  toClientAppTicket,
} from "@/app/api/crm/_lib/field-tickets";
import { FIELD_TICKET_STATUSES } from "@/lib/field-tickets";
import { AppAuthError, getAppAuthContext } from "../_lib/app-auth";

const isMissingTable = (error: { code?: string } | null | undefined) =>
  error?.code === "PGRST205" || error?.code === "42P01";

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
    const session = await getAppAuthContext(request);
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
    if (isMissingTable(error as { code?: string })) {
      return NextResponse.json(
        { error: "Aplica la migración de field_tickets en Supabase" },
        { status: 503 },
      );
    }
    if (error instanceof AppAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof FieldTicketError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No se pudieron cargar los tickets",
      },
      { status: 500 },
    );
  }
};
