import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import {
  FieldTicketError,
  getFieldTicketForClient,
  toClientAppTicket,
} from "@/app/api/crm/_lib/field-tickets";
import { AppAuthError, getAppAuthContext } from "../../_lib/app-auth";

const isMissingTable = (error: { code?: string } | null | undefined) =>
  error?.code === "PGRST205" || error?.code === "42P01";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = async (request: NextRequest, context: RouteContext) => {
  try {
    const session = await getAppAuthContext(request);
    const { id } = await context.params;
    const ticket = await getFieldTicketForClient(
      getSupabaseAdmin(),
      session.organizationId,
      id,
      {
        clientId: session.clientId,
        phone: session.phone,
      },
    );

    return NextResponse.json({ ticket: toClientAppTicket(ticket) });
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
          error instanceof Error ? error.message : "No se pudo cargar el ticket",
      },
      { status: 500 },
    );
  }
};
