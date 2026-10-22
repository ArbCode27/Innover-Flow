import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { getAppAuthContext } from "../_lib/app-auth";
import {
  buildAppBillingPayload,
  maybeRefreshAppClientBilling,
} from "../_lib/app-billing";
import { APP_ERROR_CODES, toAppErrorResponse } from "../_lib/app-errors";
import { loadAppClient } from "../_lib/load-app-client";

export const GET = async (request: NextRequest) => {
  try {
    const session = await getAppAuthContext(request);
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

    const billing = await buildAppBillingPayload({
      supabase,
      client,
      organizationId: session.organizationId,
      billingStale,
    });

    return NextResponse.json(billing);
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.BILLING_LOAD_FAILED,
      error: "No se pudo cargar tu facturación. Intenta de nuevo.",
    });
  }
};
