import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCrmPaymentById } from "@/app/api/crm/_lib/crm-payments";
import {
  CrmAuthError,
  getCrmAuthContext,
} from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import {
  conciliateSaePayment,
  registerSaePayment,
  SaePaymentSyncError,
} from "@/app/api/crm/_lib/sae-payment-sync";
import { SaeApiError } from "@/app/api/crm/_lib/sae-api";
import { readSaePaymentSnapshot } from "@/lib/sae-cuentas";

const bodySchema = z
  .object({
    action: z.enum(["registrar", "conciliar"]),
    id_cuba: z.string().trim().min(1).max(80).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "conciliar" && !value.id_cuba) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecciona la cuenta",
        path: ["id_cuba"],
      });
    }
  });

const withSnapshot = <T extends { receipt_metadata: Record<string, unknown> }>(
  payment: T,
) => ({
  ...payment,
  sae: readSaePaymentSnapshot(payment.receipt_metadata),
});

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Pago inválido" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const context = await getCrmAuthContext(req);
    const supabase = getSupabaseAdmin();
    const payment = await getCrmPaymentById(
      supabase,
      id,
      context.organizationId,
    );
    if (!payment) {
      return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
    }

    const updated =
      parsed.data.action === "registrar"
        ? await registerSaePayment(supabase, payment, { force: true })
        : await conciliateSaePayment(supabase, payment, parsed.data.id_cuba!);

    return NextResponse.json({
      ok: true,
      payment: withSnapshot(updated),
    });
  } catch (error) {
    if (error instanceof CrmAuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    if (error instanceof SaePaymentSyncError || error instanceof SaeApiError) {
      return NextResponse.json(
        {
          error: error.message,
          payment:
            error instanceof SaePaymentSyncError && error.payment
              ? withSnapshot(error.payment)
              : undefined,
        },
        { status: error.status },
      );
    }
    const message =
      error instanceof Error ? error.message : "No se pudo actualizar el pago";
    console.error("[SAE_PAYMENT_ACTION] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
