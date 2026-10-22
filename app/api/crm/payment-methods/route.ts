import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mergePaymentMethodCatalog } from "@/app/crm/_lib/payment-methods";
import {
  canManageOrganization,
  CrmAuthError,
  getCrmAuthContext,
} from "../_lib/crm-auth-context";
import {
  listOrganizationPaymentMethods,
  paymentMethodUpsertSchema,
  upsertOrganizationPaymentMethod,
} from "../_lib/organization-payment-methods";
import { getSupabaseAdmin } from "../_lib/supabase-admin";

const putBodySchema = z.object({
  method: paymentMethodUpsertSchema,
});

const isMissingPaymentMethodsTable = (error: unknown) => {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: string }).code || "")
      : "";
  return code === "PGRST205" || code === "42P01";
};

const handleError = (error: unknown) => {
  if (error instanceof CrmAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message || "Datos inválidos" },
      { status: 400 },
    );
  }
  const status =
    typeof error === "object" &&
    error &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 500;
  const message =
    error instanceof Error
      ? error.message
      : "No se pudieron procesar los métodos de pago";
  if (status >= 400 && status < 500) {
    return NextResponse.json({ error: message }, { status });
  }
  console.error("[CRM_PAYMENT_METHODS]", error);
  return NextResponse.json({ error: message }, { status: 500 });
};

export const GET = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    try {
      const methods = await listOrganizationPaymentMethods(
        getSupabaseAdmin(),
        context.organizationId,
      );
      return NextResponse.json({
        methods,
        can_edit: canManageOrganization(context),
      });
    } catch (error) {
      if (isMissingPaymentMethodsTable(error)) {
        return NextResponse.json({
          methods: mergePaymentMethodCatalog(context.organizationId, []),
          can_edit: canManageOrganization(context),
          migration_pending: true,
        });
      }
      throw error;
    }
  } catch (error) {
    return handleError(error);
  }
};

export const PUT = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    if (!canManageOrganization(context)) {
      throw new CrmAuthError(
        "Solo un administrador puede editar los datos de pago",
        403,
      );
    }

    const body = putBodySchema.parse(await request.json());
    try {
      const method = await upsertOrganizationPaymentMethod(getSupabaseAdmin(), {
        organizationId: context.organizationId,
        agentId: context.agentId,
        payload: body.method,
      });
      return NextResponse.json({ method });
    } catch (error) {
      if (isMissingPaymentMethodsTable(error)) {
        return NextResponse.json(
          {
            error:
              "Falta aplicar la migración organization_payment_methods en Supabase.",
          },
          { status: 503 },
        );
      }
      throw error;
    }
  } catch (error) {
    return handleError(error);
  }
};
