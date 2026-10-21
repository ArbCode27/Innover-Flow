import { NextRequest, NextResponse } from "next/server";
import { getCrmAuthContext } from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { ensureDefaultTicketCategories } from "@/app/api/crm/_lib/ticket-categories";

/**
 * Categorías de tickets son internas del CRM.
 * Esta ruta ya no consulta GET /help_desk/categories de Wispro.
 */
export async function GET(req: NextRequest) {
  try {
    const context = await getCrmAuthContext(req);
    const categories = await ensureDefaultTicketCategories(
      getSupabaseAdmin(),
      context.organizationId,
    );
    return NextResponse.json({
      data: categories.map((category) => ({
        id: category.id,
        name: category.name,
        kind: category.kind,
        slug: category.slug,
      })),
      source: "crm",
    });
  } catch (error) {
    console.error("[API_CRM_CATEGORIES_ERROR]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error al obtener categorías del CRM",
      },
      { status: 500 },
    );
  }
};
