import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getOrganizationSaeConfig,
  postSaePagoReporte,
  postSaePagoConciliado,
  SaeApiError,
} from "@/app/api/crm/_lib/sae-api";
import {
  CrmAuthError,
  getCrmAuthContext,
} from "../../_lib/crm-auth-context";

const paymentSchema = z.object({
  id_contrato: z.string().trim().min(1, "id_contrato es obligatorio"),
  id_cuba: z.string().trim().min(1, "id_cuba es obligatorio"),
  monto: z.coerce.number().positive("El monto debe ser mayor a 0"),
  referencia: z.string().trim().min(1, "La referencia es obligatoria"),
  fecha: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener formato yyyy-mm-dd"),
  observacion: z.string().trim().max(500).optional().nullable(),
  cambio: z.string().trim().optional().nullable(),
  telefono: z.string().trim().max(30).optional().nullable(),
  modo: z.enum(["reportes", "conciliados"]).optional(),
});

export const POST = async (req: NextRequest) => {
  try {
    const parsed = paymentSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Datos del pago inválidos" },
        { status: 400 },
      );
    }

    const context = await getCrmAuthContext(req);
    const config = await getOrganizationSaeConfig(context.organizationId);

    const targetMode = parsed.data.modo || "reportes";

    if (targetMode === "conciliados") {
      const response = await postSaePagoConciliado(config, {
        id_contrato: parsed.data.id_contrato,
        id_cuba: parsed.data.id_cuba,
        monto: parsed.data.monto,
        referencia: parsed.data.referencia,
        fecha: parsed.data.fecha,
        observacion: parsed.data.observacion,
        cambio: parsed.data.cambio,
      });

      return NextResponse.json({
        success: true,
        modo: "conciliados",
        data: response.data,
      });
    }

    const response = await postSaePagoReporte(config, {
      id_contrato: parsed.data.id_contrato,
      id_cuba: parsed.data.id_cuba,
      monto: parsed.data.monto,
      referencia: parsed.data.referencia,
      fecha: parsed.data.fecha,
      observacion: parsed.data.observacion,
      cambio: parsed.data.cambio,
      telefono: parsed.data.telefono,
    });

    return NextResponse.json({
      success: true,
      modo: "reportes",
      data: response.data,
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
      error instanceof Error ? error.message : "No se pudo registrar el pago";
    console.error("[SAE_PAYMENT] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
