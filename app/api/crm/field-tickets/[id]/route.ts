import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  getCrmAuthContext,
} from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import {
  deleteFieldTicket,
  FieldTicketError,
  fieldTicketPatchSchema,
  finalizeFieldTicket,
  getFieldTicket,
  reassignFieldTicket,
  updateFieldTicket,
} from "@/app/api/crm/_lib/field-tickets";

const jsonError = (error: unknown) => {
  if (error instanceof CrmAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof FieldTicketError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  console.error("[FIELD_TICKETS_ID]", error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "No se pudo completar" },
    { status: 500 },
  );
};

type RouteContext = { params: Promise<{ id: string }> };

export const GET = async (request: NextRequest, context: RouteContext) => {
  try {
    const auth = await getCrmAuthContext(request);
    const { id } = await context.params;
    const ticket = await getFieldTicket(
      getSupabaseAdmin(),
      auth.organizationId,
      id,
    );
    return NextResponse.json({ data: ticket });
  } catch (error) {
    return jsonError(error);
  }
};

export const PATCH = async (request: NextRequest, context: RouteContext) => {
  try {
    const auth = await getCrmAuthContext(request);
    const { id } = await context.params;
    const parsed = fieldTicketPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    if (parsed.data.action === "update") {
      const ticket = await updateFieldTicket(
        supabase,
        auth.organizationId,
        id,
        parsed.data,
      );
      return NextResponse.json({ data: ticket });
    }
    if (parsed.data.action === "reassign") {
      const ticket = await reassignFieldTicket(
        supabase,
        auth.organizationId,
        id,
        parsed.data.employeeId,
      );
      return NextResponse.json({ data: ticket });
    }
    const ticket = await finalizeFieldTicket(
      supabase,
      auth.organizationId,
      id,
      {
        observation: parsed.data.observation,
        source: parsed.data.source,
        technicianEmployeeId: parsed.data.technicianEmployeeId,
      },
    );
    return NextResponse.json({ data: ticket });
  } catch (error) {
    return jsonError(error);
  }
};

export const DELETE = async (request: NextRequest, context: RouteContext) => {
  try {
    const auth = await getCrmAuthContext(request);
    const { id } = await context.params;
    await deleteFieldTicket(getSupabaseAdmin(), auth.organizationId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
};
