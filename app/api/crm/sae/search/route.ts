import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getOrganizationSaeConfig,
  searchSaeAbonados,
  SaeApiError,
} from "@/app/api/crm/_lib/sae-api";
import {
  CrmAuthError,
  getCrmAuthContext,
} from "../../_lib/crm-auth-context";

const searchSchema = z
  .object({
    cedula: z.string().trim().optional(),
    nombre: z.string().trim().optional(),
    nroContrato: z.string().trim().optional(),
    nroCuentaPago: z.string().trim().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    const hasAny = Boolean(
      (value.cedula && value.cedula.replace(/\D/g, "").length >= 4) ||
        (value.nombre && value.nombre.trim().length >= 3) ||
        (value.nroContrato && value.nroContrato.trim().length >= 1) ||
        (value.nroCuentaPago && value.nroCuentaPago.trim().length >= 1),
    );
    if (!hasAny) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Ingresa al menos 4 dígitos de cédula, 3 letras del nombre o número de contrato",
      });
    }
  });

export const POST = async (req: NextRequest) => {
  try {
    const parsed = searchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Filtros inválidos" },
        { status: 400 },
      );
    }

    const context = await getCrmAuthContext(req);
    const config = await getOrganizationSaeConfig(context.organizationId);
    const result = await searchSaeAbonados(config, {
      cedula: parsed.data.cedula,
      nombre: parsed.data.nombre,
      nroContrato: parsed.data.nroContrato,
      nroCuentaPago: parsed.data.nroCuentaPago,
      limit: parsed.data.limit,
      cursor: parsed.data.cursor,
    });

    return NextResponse.json({
      success: true,
      data: result.data || [],
      pagination: result.pagination || null,
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
      error instanceof Error ? error.message : "Error al consultar SAE Plus";
    console.error("[SAE_SEARCH] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
