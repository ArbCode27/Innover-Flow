import { NextRequest, NextResponse } from "next/server";
import { listTechnicians } from "@/app/api/crm/_lib/field-tickets";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { getAppTechnicianAuthContext } from "../../_lib/app-auth";
import { APP_ERROR_CODES, AppApiError, toAppErrorResponse } from "../../_lib/app-errors";

const CACHE_HEADERS = {
  "Cache-Control": "private, s-maxage=60, stale-while-revalidate=300",
};

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
    const fromIso = new Date(fromMs).toISOString();
    const supabase = getSupabaseAdmin();

    const allTechnicians = await listTechnicians(supabase, session.organizationId);
    const fieldTechnicians = allTechnicians.filter(
      (tech) => !tech.isSupervisor && tech.appEnabled !== false,
    );

    type TechStats = {
      assigned: number;
      pending: number;
      closed: number;
      avg_close_hours: number | null;
    };

    const statsByEmployee = new Map<string, TechStats>();

    // 1. Intentar cálculo optimizado vía función RPC en PostgreSQL
    let rpcSuccess = false;
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "get_supervisor_metrics",
        {
          p_organization_id: session.organizationId,
          p_from_date: fromIso,
        },
      );

      if (!rpcError && Array.isArray(rpcData)) {
        rpcSuccess = true;
        for (const row of rpcData as Array<{
          employee_id: string;
          assigned: number | string;
          pending: number | string;
          closed: number | string;
          avg_close_seconds: number | string | null;
        }>) {
          const empId = String(row.employee_id || "").trim();
          if (!empId) continue;
          const avgSec =
            row.avg_close_seconds != null ? Number(row.avg_close_seconds) : null;
          statsByEmployee.set(empId, {
            assigned: Number(row.assigned || 0),
            pending: Number(row.pending || 0),
            closed: Number(row.closed || 0),
            avg_close_hours:
              avgSec != null && Number.isFinite(avgSec)
                ? Math.round((avgSec / 3600) * 10) / 10
                : null,
          });
        }
      } else if (rpcError) {
        console.warn(
          "[SUPERVISOR_METRICS] rpc failed, falling back to lean query",
          rpcError.message,
        );
      }
    } catch (rpcErr) {
      console.warn("[SUPERVISOR_METRICS] rpc exception, using lean fallback", rpcErr);
    }

    // 2. Fallback de proyección mínima: solo 4 columnas indexadas y solo filas relevantes
    if (!rpcSuccess) {
      const { data, error } = await supabase
        .from("field_tickets")
        .select("employee_id, status, created_at, closed_at")
        .eq("organization_id", session.organizationId)
        .not("employee_id", "is", null)
        .or(`status.in.(open,scheduled),created_at.gte.${fromIso},closed_at.gte.${fromIso}`)
        .limit(1000);

      if (error) throw error;

      type LeanRow = {
        employee_id: string | null;
        status: string;
        created_at: string;
        closed_at: string | null;
      };

      const rowsByEmp = new Map<string, LeanRow[]>();
      for (const row of (data || []) as LeanRow[]) {
        const empId = String(row.employee_id || "").trim();
        if (!empId) continue;
        const list = rowsByEmp.get(empId) || [];
        list.push(row);
        rowsByEmp.set(empId, list);
      }

      for (const tech of fieldTechnicians) {
        const rows = rowsByEmp.get(tech.id) || [];
        const inRange = rows.filter((r) => {
          const created = Date.parse(r.created_at);
          const closed = r.closed_at ? Date.parse(r.closed_at) : NaN;
          return created >= fromMs || (Number.isFinite(closed) && closed >= fromMs);
        });
        const pending = rows.filter(
          (r) => r.status === "open" || r.status === "scheduled",
        );
        const closedInRange = rows.filter((r) => {
          if (r.status !== "done" || !r.closed_at) return false;
          return Date.parse(r.closed_at) >= fromMs;
        });

        const closeHours = closedInRange
          .map((r) => hoursBetween(r.created_at, r.closed_at!))
          .filter((v): v is number => typeof v === "number");

        const avgCloseHours =
          closeHours.length > 0
            ? closeHours.reduce((sum, v) => sum + v, 0) / closeHours.length
            : null;

        statsByEmployee.set(tech.id, {
          assigned: inRange.length,
          pending: pending.length,
          closed: closedInRange.length,
          avg_close_hours:
            avgCloseHours == null ? null : Math.round(avgCloseHours * 10) / 10,
        });
      }
    }

    const metrics = fieldTechnicians.map((tech) => {
      const stats = statsByEmployee.get(tech.id) || {
        assigned: 0,
        pending: 0,
        closed: 0,
        avg_close_hours: null,
      };

      const closeRate =
        stats.assigned > 0
          ? Math.round((stats.closed / stats.assigned) * 100)
          : 0;

      return {
        technician_id: tech.id,
        name: tech.name,
        assigned: stats.assigned,
        pending: stats.pending,
        closed: stats.closed,
        close_rate_pct: closeRate,
        avg_close_hours: stats.avg_close_hours,
      };
    });

    metrics.sort(
      (a, b) => b.closed - a.closed || b.assigned - a.assigned || a.name.localeCompare(b.name),
    );

    return NextResponse.json(
      {
        range: range === "today" || range === "30d" ? range : "7d",
        metrics,
      },
      { headers: CACHE_HEADERS },
    );
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.TICKETS_LOAD_FAILED,
      error: "No se pudieron cargar las métricas del equipo.",
    });
  }
};
