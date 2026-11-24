import { NextRequest, NextResponse } from "next/server";
import {
  getOrganizationSaeConfig,
  getSaeAbonado,
  getSaeAbonadoSaldo,
  getSaeAbonadoServicios,
  getSaeAbonadoEstadoCuenta,
  SaeApiError,
} from "@/app/api/crm/_lib/sae-api";
import {
  CrmAuthError,
  getCrmAuthContext,
} from "../../../_lib/crm-auth-context";

export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ abonadoId: string }> },
) => {
  try {
    const { abonadoId } = await params;
    if (!abonadoId || !abonadoId.trim()) {
      return NextResponse.json(
        { error: "abonadoId es requerido" },
        { status: 400 },
      );
    }

    const context = await getCrmAuthContext(req);
    const config = await getOrganizationSaeConfig(context.organizationId);

    const includeEstadoCuenta =
      req.nextUrl.searchParams.get("include_estado_cuenta") === "true";

    const [detalleRes, saldoRes, serviciosRes, estadoCuentaRes] =
      await Promise.all([
        getSaeAbonado(config, abonadoId).catch((err) => {
          console.warn("[SAE_ABONADO] detalle_failed", err);
          return null;
        }),
        getSaeAbonadoSaldo(config, abonadoId).catch((err) => {
          console.warn("[SAE_ABONADO] saldo_failed", err);
          return null;
        }),
        getSaeAbonadoServicios(config, abonadoId).catch((err) => {
          console.warn("[SAE_ABONADO] servicios_failed", err);
          return null;
        }),
        includeEstadoCuenta
          ? getSaeAbonadoEstadoCuenta(config, abonadoId, { limit: 10 }).catch(
              (err) => {
                console.warn("[SAE_ABONADO] estado_cuenta_failed", err);
                return null;
              },
            )
          : Promise.resolve(null),
      ]);

    if (!detalleRes && !saldoRes) {
      return NextResponse.json(
        { error: "No se encontró el abonado" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      abonado: detalleRes?.data || null,
      saldo: saldoRes?.data || null,
      servicios: serviciosRes?.data || [],
      estado_cuenta: estadoCuentaRes?.data || null,
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
      error instanceof Error ? error.message : "No se pudo consultar el abonado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
