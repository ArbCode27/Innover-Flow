import { NextRequest, NextResponse } from "next/server";
import {
  listPendingTicketsForEmployee,
  mapFieldTicket,
} from "@/app/api/crm/_lib/field-tickets";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { getAppTechnicianAuthContext } from "../../_lib/app-auth";
import { APP_ERROR_CODES, toAppErrorResponse } from "../../_lib/app-errors";
import { toTechnicianCasoDto } from "../../_lib/technician-caso-dto";

export const GET = async (request: NextRequest) => {
  try {
    const session = await getAppTechnicianAuthContext(request);
    const includeDone =
      request.nextUrl.searchParams.get("include_done") === "1" ||
      request.nextUrl.searchParams.get("include_done") === "true";

    const supabase = getSupabaseAdmin();
    let tickets = await listPendingTicketsForEmployee(
      supabase,
      session.organizationId,
      session.technicianId,
    );

    if (includeDone) {
      const { data, error } = await supabase
        .from("field_tickets")
        .select("*")
        .eq("organization_id", session.organizationId)
        .eq("employee_id", session.technicianId)
        .in("status", ["done", "cancelled"])
        .order("closed_at", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      tickets = [
        ...tickets,
        ...(data || []).map((row) =>
          mapFieldTicket(row as Record<string, unknown>),
        ),
      ];
    }

    return NextResponse.json({
      tickets: tickets.map(toTechnicianCasoDto),
    });
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.TICKETS_LOAD_FAILED,
      error: "No se pudieron cargar tus casos. Intenta de nuevo.",
    });
  }
};
