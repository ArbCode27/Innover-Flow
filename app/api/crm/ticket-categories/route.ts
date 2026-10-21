import { NextRequest, NextResponse } from "next/server";
import {
  CrmAuthError,
  getCrmAuthContext,
} from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { ensureDefaultTicketCategories } from "@/app/api/crm/_lib/ticket-categories";

export const GET = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    const categories = await ensureDefaultTicketCategories(
      getSupabaseAdmin(),
      context.organizationId,
    );
    return NextResponse.json({ data: categories });
  } catch (error) {
    if (error instanceof CrmAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[TICKET_CATEGORIES]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las categorías",
      },
      { status: 500 },
    );
  }
};
