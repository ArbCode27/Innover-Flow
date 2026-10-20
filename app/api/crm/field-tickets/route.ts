import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  getCrmAuthContext,
} from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import {
  bulkFieldTicketsSchema,
  bulkDeleteFieldTickets,
  bulkReassignFieldTickets,
  createFieldTicket,
  createFieldTicketSchema,
  FieldTicketError,
  listFieldTickets,
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
  console.error("[FIELD_TICKETS]", error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "No se pudo completar" },
    { status: 500 },
  );
};

export const GET = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    const tickets = await listFieldTickets(
      getSupabaseAdmin(),
      context.organizationId,
    );
    return NextResponse.json({ data: tickets });
  } catch (error) {
    return jsonError(error);
  }
};

export const POST = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    const body = await request.json();
    const supabase = getSupabaseAdmin();

    if (body?.action === "reassign" || body?.action === "delete") {
      const parsed = bulkFieldTicketsSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Datos inválidos" },
          { status: 400 },
        );
      }
      if (parsed.data.action === "delete") {
        await bulkDeleteFieldTickets(
          supabase,
          context.organizationId,
          parsed.data.ids,
        );
        return NextResponse.json({ success: true });
      }
      const tickets = await bulkReassignFieldTickets(
        supabase,
        context.organizationId,
        parsed.data.ids,
        parsed.data.employeeId,
      );
      return NextResponse.json({ data: tickets });
    }

    const parsed = createFieldTicketSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }
    const ticket = await createFieldTicket(
      supabase,
      context.organizationId,
      parsed.data,
    );
    return NextResponse.json({ data: ticket }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
};
