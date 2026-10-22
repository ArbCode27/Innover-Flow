import { NextRequest, NextResponse } from "next/server";
import {
  listFieldTickets,
  mapFieldTicket,
} from "@/app/api/crm/_lib/field-tickets";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import type { FieldTicket } from "@/lib/field-tickets/types";
import { getAppTechnicianAuthContext } from "../../_lib/app-auth";
import { APP_ERROR_CODES, AppApiError, toAppErrorResponse } from "../../_lib/app-errors";
import { toTechnicianCasoDto } from "../../_lib/technician-caso-dto";

const startOfTodayIso = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.toISOString();
};

const applyStatusFilter = (
  tickets: FieldTicket[],
  status: string,
): FieldTicket[] => {
  if (status === "pending") {
    return tickets.filter(
      (ticket) => ticket.status === "open" || ticket.status === "scheduled",
    );
  }
  if (status === "done") {
    return tickets.filter(
      (ticket) => ticket.status === "done" || ticket.status === "cancelled",
    );
  }
  if (status === "today") {
    const start = Date.parse(startOfTodayIso());
    return tickets.filter((ticket) => {
      const created = Date.parse(ticket.createdAt);
      const closed = ticket.closedAt ? Date.parse(ticket.closedAt) : NaN;
      return created >= start || (Number.isFinite(closed) && closed >= start);
    });
  }
  return tickets;
};

export const GET = async (request: NextRequest) => {
  try {
    const session = await getAppTechnicianAuthContext(request);
    if (session.role !== "supervisor") {
      throw new AppApiError(
        APP_ERROR_CODES.VALIDATION_ERROR,
        "Solo un supervisor puede ver los tickets del equipo.",
        403,
      );
    }

    const status = (
      request.nextUrl.searchParams.get("status") || "pending"
    ).trim();
    const technicianId =
      request.nextUrl.searchParams.get("technician_id")?.trim() || "";

    const supabase = getSupabaseAdmin();
    let tickets: FieldTicket[];

    if (technicianId) {
      const { data, error } = await supabase
        .from("field_tickets")
        .select("*")
        .eq("organization_id", session.organizationId)
        .eq("employee_id", technicianId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      tickets = (data || []).map((row) =>
        mapFieldTicket(row as Record<string, unknown>),
      );
    } else {
      tickets = await listFieldTickets(supabase, session.organizationId);
    }

    const filtered = applyStatusFilter(tickets, status).slice(0, 200);

    return NextResponse.json({
      tickets: filtered.map(toTechnicianCasoDto),
      total: filtered.length,
    });
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.TICKETS_LOAD_FAILED,
      error: "No se pudieron cargar los tickets del equipo.",
    });
  }
};
