import { NextRequest, NextResponse } from "next/server";
import { listTechnicians, mapFieldTicket } from "@/app/api/crm/_lib/field-tickets";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import type { FieldTicket } from "@/lib/field-tickets/types";
import { getAppTechnicianAuthContext } from "../../_lib/app-auth";
import { APP_ERROR_CODES, AppApiError, toAppErrorResponse } from "../../_lib/app-errors";

const rangeStartMs = (range: string) => {
  const now = Date.now();
  if (range === "today") {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }
  if (range === "30d") {
    return now - 30 * 24 * 60 * 60 * 1000;
  }
  return now - 7 * 24 * 60 * 60 * 1000;
};

const hoursBetween = (startIso: string, endIso: string) => {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  return (end - start) / (1000 * 60 * 60);
};

export const GET = async (request: NextRequest) => {
  try {
    const session = await getAppTechnicianAuthContext(request);
    if (session.role !== "supervisor") {
      throw new AppApiError(
        APP_ERROR_CODES.VALIDATION_ERROR,
        "Solo un supervisor puede ver las métricas del equipo.",
        403,
      );
    }

    const range = (request.nextUrl.searchParams.get("range") || "7d").trim();
    const fromMs = rangeStartMs(range);
    const supabase = getSupabaseAdmin();

    const technicians = await listTechnicians(supabase, session.organizationId);
    const { data, error } = await supabase
      .from("field_tickets")
      .select("*")
      .eq("organization_id", session.organizationId)
      .not("employee_id", "is", null)
      .limit(2000);
    if (error) throw error;

    const tickets = (data || []).map((row) =>
      mapFieldTicket(row as Record<string, unknown>),
    );

    const byEmployee = new Map<string, FieldTicket[]>();
    for (const ticket of tickets) {
      const id = String(ticket.employeeId || "").trim();
      if (!id) continue;
      const list = byEmployee.get(id) || [];
      list.push(ticket);
      byEmployee.set(id, list);
    }

    const metrics = technicians.map((tech) => {
      const all = byEmployee.get(tech.id) || [];
      const inRange = all.filter((ticket) => {
        const created = Date.parse(ticket.createdAt);
        const closed = ticket.closedAt ? Date.parse(ticket.closedAt) : NaN;
        return created >= fromMs || (Number.isFinite(closed) && closed >= fromMs);
      });
      const pending = all.filter(
        (ticket) => ticket.status === "open" || ticket.status === "scheduled",
      );
      const closedInRange = all.filter((ticket) => {
        if (ticket.status !== "done" || !ticket.closedAt) return false;
        return Date.parse(ticket.closedAt) >= fromMs;
      });
      const closeHours = closedInRange
        .map((ticket) => hoursBetween(ticket.createdAt, ticket.closedAt!))
        .filter((value): value is number => typeof value === "number");
      const avgCloseHours =
        closeHours.length > 0
          ? closeHours.reduce((sum, value) => sum + value, 0) / closeHours.length
          : null;
      const assignedInRange = inRange.length;
      const closeRate =
        assignedInRange > 0
          ? Math.round((closedInRange.length / assignedInRange) * 100)
          : 0;

      return {
        technician_id: tech.id,
        name: tech.name,
        assigned: assignedInRange,
        pending: pending.length,
        closed: closedInRange.length,
        close_rate_pct: closeRate,
        avg_close_hours:
          avgCloseHours == null ? null : Math.round(avgCloseHours * 10) / 10,
      };
    });

    metrics.sort(
      (a, b) => b.closed - a.closed || b.assigned - a.assigned || a.name.localeCompare(b.name),
    );

    return NextResponse.json({
      range: range === "today" || range === "30d" ? range : "7d",
      metrics,
    });
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.TICKETS_LOAD_FAILED,
      error: "No se pudieron cargar las métricas del equipo.",
    });
  }
};
