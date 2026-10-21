import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  normalizeDocumentDigits,
  searchWisproByCedula,
  searchWisproByName,
  withOrganizationWispro,
  WisproApiError,
} from "@/app/api/crm/_lib/wispro-api";
import { getCrmAuthContext } from "../../_lib/crm-auth-context";

const LOG_PREFIX = "[WISPRO_SEARCH]";

const searchSchema = z
  .object({
    cedula: z.string().trim().optional(),
    name: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    const digits = normalizeDocumentDigits(value.cedula || "");
    const name = (value.name || "").trim();
    if (!digits && !name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ingresa la cédula, RIF o el nombre",
      });
    }
    if (digits && (digits.length < 5 || digits.length > 12)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El documento debe tener entre 5 y 12 dígitos",
      });
    }
    if (!digits && name && name.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El nombre debe tener al menos 3 caracteres",
      });
    }
  });

export async function POST(req: NextRequest) {
  try {
    const payload = searchSchema.safeParse(await req.json());

    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const context = await getCrmAuthContext(req);
    const digits = normalizeDocumentDigits(payload.data.cedula || "");
    const name = (payload.data.name || "").trim();
    const results = await withOrganizationWispro(
      context.organizationId,
      () =>
        digits
          ? searchWisproByCedula(digits)
          : searchWisproByName(name),
    );

    return NextResponse.json({ data: results });
  } catch (error) {
    if (error instanceof WisproApiError) {
      console.error(`${LOG_PREFIX} wispro_error`, {
        code: error.code,
        message: error.message,
      });
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error(`${LOG_PREFIX} unexpected_error`, error);
    return NextResponse.json(
      { error: "Error interno al consultar Wispro" },
      { status: 500 },
    );
  }
}
