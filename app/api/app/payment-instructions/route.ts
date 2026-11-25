import { NextRequest, NextResponse } from "next/server";
import {
  getPaymentMethodByKey,
  listEnabledPaymentMethodsForApp,
  toAppPaymentMethodDto,
} from "@/app/api/crm/_lib/organization-payment-methods";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { isPaymentMethodKey } from "@/app/crm/_lib/payment-methods";
import { listOrganizationSaeAccounts } from "@/app/api/crm/_lib/sae-accounts";
import { getAppCustomerAuthContext } from "../_lib/app-auth";
import {
  APP_ERROR_CODES,
  AppApiError,
  isMissingTableError,
  toAppErrorResponse,
} from "../_lib/app-errors";
import { loadAppClient } from "../_lib/load-app-client";

const CACHE_HEADERS = {
  "Cache-Control": "private, s-maxage=300, stale-while-revalidate=600",
};

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
        return NextResponse.json({ methods: [] }, { headers: CACHE_HEADERS });
      }
      throw error;
    }

    if (methodParam) {
      const match = isPaymentMethodKey(methodParam)
        ? getPaymentMethodByKey(methods, methodParam)
        : null;
      return NextResponse.json(
        {
          methods: match ? [toAppPaymentMethodDto(match)] : [],
        },
        { headers: CACHE_HEADERS },
      );
    }

    const saeAccounts = await listOrganizationSaeAccounts(
      supabase,
      session.organizationId,
      { activeOnly: true },
    );
    const saeMethods = saeAccounts
      .filter((account) => account.numero_cuenta)
      .map((account) => ({
        id: `sae:${account.id_cuba}`,
        title: account.receptor_bank || account.banco,
        description: "Cuenta registrada en SAE",
        bank_name: account.banco,
        currency: "VES" as const,
        source: "sae" as const,
        fields: [
          { label: "Banco", value: account.banco },
          { label: "Número de cuenta", value: account.numero_cuenta },
        ],
        updated_at: account.synced_at || null,
      }));

    return NextResponse.json(
      {
        methods: [...methods.map(toAppPaymentMethodDto), ...saeMethods],
      },
      { headers: CACHE_HEADERS },
    );
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.PAYMENT_INSTRUCTIONS_LOAD_FAILED,
      error: "No se pudieron cargar los datos de pago. Intenta de nuevo.",
    });
  }
};
