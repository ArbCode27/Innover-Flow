import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { getAppAuthContext } from "../_lib/app-auth";
import { toAppPaymentDto } from "../_lib/app-client-dtos";
import { APP_ERROR_CODES, toAppErrorResponse } from "../_lib/app-errors";
import { loadAppClient } from "../_lib/load-app-client";

/**
 * Lista pagos del cliente de la sesión (`crm_payments`).
 * POST para reportar pago desde la app no está definido: el intake actual
 * es chat → Nova → `intakeCrmReceipt`. Ver docs/BACKEND_GAPS.md.
 */
export const GET = async (_request: NextRequest) => {
  try {
    const session = await getAppAuthContext(_request);
    const supabase = getSupabaseAdmin();

    await loadAppClient(supabase, {
      clientId: session.clientId,
      organizationId: session.organizationId,
    });

    const { data, error } = await supabase
      .from("crm_payments")
      .select(
        "id, status, amount, bank, payment_date, transaction_code, created_at, receipt_media_url",
      )
      .eq("organization_id", session.organizationId)
      .eq("client_id", session.clientId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({
      payments: (data || []).map((row) =>
        toAppPaymentDto({
          id: String(row.id),
          status: String(row.status || "RECIBIDO"),
          amount: row.amount as number | string | null,
          bank: (row.bank as string | null) ?? null,
          payment_date: (row.payment_date as string | null) ?? null,
          transaction_code: (row.transaction_code as string | null) ?? null,
          created_at: (row.created_at as string | null) ?? null,
          receipt_media_url: (row.receipt_media_url as string | null) ?? null,
        }),
      ),
    });
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.PAYMENTS_LOAD_FAILED,
      error: "No se pudieron cargar tus pagos. Intenta de nuevo.",
    });
  }
};
