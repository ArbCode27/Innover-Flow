import { NextRequest, NextResponse } from "next/server";
import { buildOnuTemplateBuffer } from "@/app/api/crm/_lib/onu-workbook";
import {
  CrmAuthError,
  getCrmAuthContext,
} from "../../_lib/crm-auth-context";
import { getSupabaseAdmin } from "../../_lib/supabase-admin";

export const GET = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    const supabase = getSupabaseAdmin();
    const [clientsResult, onusResult] = await Promise.all([
      supabase
        .from("clients")
        .select("id, name, cedula")
        .eq("organization_id", context.organizationId)
        .order("name", { ascending: true }),
      supabase
        .from("client_onus")
        .select("client_id")
        .eq("organization_id", context.organizationId),
    ]);
    if (clientsResult.error) throw clientsResult.error;
    if (onusResult.error) throw onusResult.error;

    const linkedIds = new Set(
      (onusResult.data || [])
        .map((row) => Number(row.client_id))
        .filter((id) => Number.isInteger(id) && id > 0),
    );
    const pending = (clientsResult.data || [])
      .filter((client) => !linkedIds.has(Number(client.id)))
      .map((client) => ({
        id: Number(client.id),
        name: String(client.name || "").trim(),
        cedula: client.cedula ? String(client.cedula) : null,
      }))
      .filter((client) => client.name);

    const buffer = await buildOnuTemplateBuffer(pending);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="plantilla-equipos.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof CrmAuthError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }
    const message =
      error instanceof Error ? error.message : "No se pudo generar la plantilla";
    console.error("[ONU_TEMPLATE]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
