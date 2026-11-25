import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { syncClientDirectoryPage } from "@/app/api/crm/_lib/client-directory-sync";
import {
  canManageOrganization,
  CrmAuthError,
  getCrmAuthContext,
} from "../../_lib/crm-auth-context";
import { isIntegrationConnected } from "../../_lib/organization-integrations";
import { getSupabaseAdmin } from "../../_lib/supabase-admin";

const bodySchema = z.object({
  provider: z.enum(["wispro", "sae"]),
  cursor: z.string().trim().nullable().optional(),
});

export const POST = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    if (!canManageOrganization(context)) {
      return NextResponse.json(
        { ok: false, error: "Solo un administrador puede importar el padrón" },
        { status: 403 },
      );
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Indica si la importación es de Wispro o de SAE" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const connected = await isIntegrationConnected(
      supabase,
      context.organizationId,
      parsed.data.provider,
    );
    if (!connected) {
      return NextResponse.json(
        { ok: false, error: "Esa integración no está conectada" },
        { status: 409 },
      );
    }

    const result = await syncClientDirectoryPage(
      supabase,
      context.organizationId,
      parsed.data.provider,
      parsed.data.cursor || null,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof CrmAuthError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }
    const message =
      error instanceof Error ? error.message : "No se pudieron importar los clientes";
    console.error("[CLIENT_DIRECTORY_SYNC]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
