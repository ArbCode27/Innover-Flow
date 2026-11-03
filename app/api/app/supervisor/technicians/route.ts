import { NextRequest, NextResponse } from "next/server";
import { listTechnicians } from "@/app/api/crm/_lib/field-tickets";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { getAppTechnicianAuthContext } from "../../_lib/app-auth";
import { APP_ERROR_CODES, AppApiError, toAppErrorResponse } from "../../_lib/app-errors";

const CACHE_HEADERS = {
  "Cache-Control": "private, s-maxage=300, stale-while-revalidate=600",
};

export const GET = async (request: NextRequest) => {
  try {
    const session = await getAppTechnicianAuthContext(request);
    if (session.role !== "supervisor") {
      throw new AppApiError(
        APP_ERROR_CODES.VALIDATION_ERROR,
        "Solo un supervisor puede ver el directorio de técnicos.",
        403,
      );
    }

    const technicians = await listTechnicians(
      getSupabaseAdmin(),
      session.organizationId,
    );

    return NextResponse.json(
      {
        technicians: technicians
          .filter((item) => item.appEnabled !== false)
          .map((item) => ({
            id: item.id,
            name: item.name,
            phone: item.phone,
            document: item.document,
            is_supervisor: item.isSupervisor,
          })),
      },
      { headers: CACHE_HEADERS },
    );
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.TICKETS_LOAD_FAILED,
      error: "No se pudo cargar el directorio de técnicos.",
    });
  }
};
