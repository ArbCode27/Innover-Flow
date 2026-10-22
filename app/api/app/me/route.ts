import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { getAppCustomerAuthContext } from "../_lib/app-auth";
import {
  buildAppBillingPayload,
  maybeRefreshAppClientBilling,
} from "../_lib/app-billing";
import { toAppClientDto } from "../_lib/app-client-dtos";
import { APP_ERROR_CODES, toAppErrorResponse } from "../_lib/app-errors";
import { loadAppClient } from "../_lib/load-app-client";

export const GET = async (request: NextRequest) => {
  try {
    const session = await getAppCustomerAuthContext(request);
    const supabase = getSupabaseAdmin();
    const forceRefresh =
      request.nextUrl.searchParams.get("refresh") === "1" ||
      request.nextUrl.searchParams.get("refresh") === "true";

    const loaded = await loadAppClient(supabase, {
      clientId: session.clientId,
      organizationId: session.organizationId,
    });

    const { client, billingStale } = await maybeRefreshAppClientBilling({
      supabase,
      client: loaded,
      organizationId: session.organizationId,
      force: forceRefresh,
    });

    const clientDto = toAppClientDto(client);
    const billing = await buildAppBillingPayload({
      supabase,
      client,
      organizationId: session.organizationId,
      billingStale,
    });

    return NextResponse.json({
      client: clientDto,
      billing_stale: billingStale,
      billing: {
        account_status: billing.account_status,
        service_suspended: billing.service_suspended,
        has_debt: billing.has_debt,
        debt: billing.debt,
        debt_usd_formatted: billing.debt_usd_formatted,
        debt_bs_formatted: billing.debt_bs_formatted,
        bcv_rate_display: billing.bcv_rate_display,
        contract_state: billing.contract_state,
        contract_state_label: billing.contract_state_label,
        plan_name: billing.plan_name,
        zone: billing.zone,
        wispro_linked: billing.wispro_linked,
        office_closed: billing.office_closed,
        next_open_label: billing.next_open_label,
        period_label: billing.period_label,
        due_hint: billing.due_hint,
      },
    });
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.PROFILE_LOAD_FAILED,
      error: "No se pudo cargar tu perfil. Intenta de nuevo.",
    });
  }
};
