import { NextRequest, NextResponse } from "next/server";
import {
  getPaymentMethodByKey,
  listEnabledPaymentMethodsForApp,
  toAppPaymentMethodDto,
} from "@/app/api/crm/_lib/organization-payment-methods";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { isPaymentMethodKey } from "@/app/crm/_lib/payment-methods";
import { getAppCustomerAuthContext } from "../_lib/app-auth";
import {
  APP_ERROR_CODES,
  AppApiError,
  isMissingTableError,
  toAppErrorResponse,
} from "../_lib/app-errors";
import { loadAppClient } from "../_lib/load-app-client";

export const GET = async (request: NextRequest) => {
  try {
    const session = await getAppCustomerAuthContext(request);
    const supabase = getSupabaseAdmin();

    await loadAppClient(supabase, {
      clientId: session.clientId,
      organizationId: session.organizationId,
    });

    const methodParam = request.nextUrl.searchParams.get("method")?.trim() || "";
    if (methodParam && !isPaymentMethodKey(methodParam)) {
      throw new AppApiError(
        APP_ERROR_CODES.VALIDATION_ERROR,
        "El método de pago no es válido.",
        400,
      );
    }

    let methods;
    try {
      methods = await listEnabledPaymentMethodsForApp(
        supabase,
        session.organizationId,
      );
    } catch (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ methods: [] });
      }
      throw error;
    }

    if (methodParam) {
      const match = getPaymentMethodByKey(methods, methodParam);
      return NextResponse.json({
        methods: match ? [toAppPaymentMethodDto(match)] : [],
      });
    }

    return NextResponse.json({
      methods: methods.map(toAppPaymentMethodDto),
    });
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.PAYMENT_INSTRUCTIONS_LOAD_FAILED,
      error: "No se pudieron cargar los datos de pago. Intenta de nuevo.",
    });
  }
};
