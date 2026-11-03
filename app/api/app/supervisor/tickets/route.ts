import { NextRequest, NextResponse } from "next/server";
import { mapFieldTicket } from "@/app/api/crm/_lib/field-tickets";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { getAppTechnicianAuthContext } from "../../_lib/app-auth";
import { APP_ERROR_CODES, AppApiError, toAppErrorResponse } from "../../_lib/app-errors";
import { toTechnicianCasoDto } from "../../_lib/technician-caso-dto";

const SUPERVISOR_TICKET_COLUMNS =
  "id, public_id, wispro_issue_id, title, cause, status, priority, kind, client_name, client_phone, maps_url, latitude, longitude, address_text, window_start, window_end, facade_media_url, resolution_observation, employee_id, employee_name, closed_at, created_at, organization_id";

const startOfTodayIso = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.toISOString();
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

    let query = supabase
      .from("field_tickets")
      .select(SUPERVISOR_TICKET_COLUMNS)
      .eq("organization_id", session.organizationId);

    if (technicianId) {
      query = query.eq("employee_id", technicianId);
    }

    if (status === "pending") {
      query = query.in("status", ["open", "scheduled"]);
    } else if (status === "done") {
      query = query.in("status", ["done", "cancelled"]);
    } else if (status === "today") {
      const todayIso = startOfTodayIso();
      query = query.or(`created_at.gte.${todayIso},closed_at.gte.${todayIso}`);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    const tickets = (data || []).map((row) =>
      mapFieldTicket(row as Record<string, unknown>),
    );

    return NextResponse.json({
      tickets: tickets.map(toTechnicianCasoDto),
      total: tickets.length,
    });
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.TICKETS_LOAD_FAILED,
      error: "No se pudieron cargar los tickets del equipo.",
    });
  }
};
