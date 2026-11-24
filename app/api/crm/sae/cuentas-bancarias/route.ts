import { NextRequest, NextResponse } from "next/server";
import {
  getOrganizationSaeConfig,
  getSaeCuentasBancarias,
  SaeApiError,
} from "@/app/api/crm/_lib/sae-api";
import {
  CrmAuthError,
  getCrmAuthContext,
} from "../../_lib/crm-auth-context";

export const GET = async (req: NextRequest) => {
  try {
    const context = await getCrmAuthContext(req);
    const config = await getOrganizationSaeConfig(context.organizationId);
    const cuentas = await getSaeCuentasBancarias(config);

    return NextResponse.json({
      success: true,
      data: cuentas,
    });
  } catch (error) {
    if (error instanceof CrmAuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    if (error instanceof SaeApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    const message =
      error instanceof Error
        ? error.message
        : "No se pudieron consultar las cuentas";
    console.error("[SAE_CUENTAS] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
