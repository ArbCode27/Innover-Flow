import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  finalizeFieldTicket,
  mapFieldTicket,
} from "@/app/api/crm/_lib/field-tickets";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { getAppTechnicianAuthContext } from "../../../_lib/app-auth";
import {
  APP_ERROR_CODES,
  AppApiError,
  parseAppJsonBody,
  parseAppSchema,
  toAppErrorResponse,
} from "../../../_lib/app-errors";
import { toTechnicianCasoDto } from "../../../_lib/technician-caso-dto";

type RouteContext = { params: Promise<{ id: string }> };

const closeSchema = z.object({
  action: z.literal("close").default("close"),
  observation: z
    .string()
    .trim()
    .min(3, "La observación es obligatoria")
    .max(2000, "La observación es demasiado larga"),
});

const loadAssignedTicket = async (input: {
  organizationId: string;
  technicianId: string;
  ticketId: string;
}) => {
  const supabase = getSupabaseAdmin();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.ticketId,
    );
  const publicId = Number(input.ticketId);

  let query = supabase
    .from("field_tickets")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("employee_id", input.technicianId);

  query = isUuid
    ? query.eq("id", input.ticketId)
    : Number.isInteger(publicId) && publicId > 0
      ? query.eq("public_id", publicId)
      : query.eq("id", input.ticketId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new AppApiError(
      APP_ERROR_CODES.TICKET_NOT_FOUND,
      "No encontramos ese caso asignado a ti.",
      404,
    );
  }
  return mapFieldTicket(data as Record<string, unknown>);
};

export const GET = async (request: NextRequest, context: RouteContext) => {
  try {
    const session = await getAppTechnicianAuthContext(request);
    const { id } = await context.params;
    const ticket = await loadAssignedTicket({
      organizationId: session.organizationId,
      technicianId: session.technicianId,
      ticketId: id,
    });
    return NextResponse.json({ ticket: toTechnicianCasoDto(ticket) });
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.TICKET_LOAD_FAILED,
      error: "No se pudo cargar el caso. Intenta de nuevo.",
    });
  }
};

export const PATCH = async (request: NextRequest, context: RouteContext) => {
  try {
    const session = await getAppTechnicianAuthContext(request);
    const { id } = await context.params;
    const body = parseAppSchema(
      closeSchema,
      await parseAppJsonBody(request),
      "Revisa la observación e intenta de nuevo.",
    );

    const current = await loadAssignedTicket({
      organizationId: session.organizationId,
      technicianId: session.technicianId,
      ticketId: id,
    });

    const updated = await finalizeFieldTicket(
      getSupabaseAdmin(),
      session.organizationId,
      current.id,
      {
        observation: body.observation,
        source: "technician",
        technicianEmployeeId: session.technicianId,
      },
    );

    return NextResponse.json({ ticket: toTechnicianCasoDto(updated) });
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.TICKET_LOAD_FAILED,
      error: "No se pudo cerrar el caso. Intenta de nuevo.",
    });
  }
};
