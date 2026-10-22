import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import {
  enrichContractPlanAndPpp,
  listContractsByClientId,
  resolvePreferredContract,
  withOptionalOrganizationWispro,
} from "@/app/api/crm/_lib/wispro-api";
import { getAppCustomerAuthContext } from "../_lib/app-auth";
import {
  formatCedulaDisplay,
  toAppClientDto,
  toAppContractDto,
  type AppContractDto,
} from "../_lib/app-client-dtos";
import { APP_ERROR_CODES, toAppErrorResponse } from "../_lib/app-errors";
import { loadAppClient } from "../_lib/load-app-client";

const withClientPlanFallback = (
  contract: AppContractDto | null,
  clientPlan: string | null,
  clientPpp: string | null,
  clientPlanName: string | null,
): AppContractDto | null => {
  if (!contract) return null;
  if (contract.plan_label || contract.plan_name || contract.ppp_profile) {
    return contract;
  }
  const fallback =
    clientPlan ||
    clientPpp ||
    clientPlanName ||
    null;
  if (!fallback) return contract;
  return {
    ...contract,
    plan_name: clientPlanName || contract.plan_name,
    ppp_profile: clientPpp || contract.ppp_profile,
    plan_label: fallback,
  };
};

export const GET = async (_request: NextRequest) => {
  try {
    const session = await getAppCustomerAuthContext(_request);
    const supabase = getSupabaseAdmin();
    const client = await loadAppClient(supabase, {
      clientId: session.clientId,
      organizationId: session.organizationId,
    });
    const clientDto = toAppClientDto(client);

    if (!clientDto.wispro_linked || !clientDto.wispro_id) {
      return NextResponse.json({
        wispro_linked: false,
        holder_name: clientDto.name,
        cedula: clientDto.cedula,
        cedula_display: formatCedulaDisplay(clientDto.cedula),
        zone: clientDto.zone,
        account_status: clientDto.account,
        plan: clientDto.plan,
        primary: null,
        contracts: [],
      });
    }

    const contracts = await withOptionalOrganizationWispro(
      session.organizationId,
      async () => {
        const listed = await listContractsByClientId(clientDto.wispro_id!);
        const preferred = resolvePreferredContract(listed);
        const enrichedPreferred = await enrichContractPlanAndPpp(preferred);
        return listed.map((contract) =>
          enrichedPreferred && contract.id === enrichedPreferred.id
            ? enrichedPreferred
            : contract,
        );
      },
    );
    const preferred = resolvePreferredContract(contracts);
    const primaryId = preferred?.id ?? null;
    const mapped = contracts.map((contract) =>
      toAppContractDto(contract, contract.id === primaryId),
    );
    const primary = withClientPlanFallback(
      mapped.find((item) => item.is_primary) ?? null,
      clientDto.plan,
      clientDto.ppp_profile,
      clientDto.plan_name,
    );

    return NextResponse.json({
      wispro_linked: true,
      holder_name: clientDto.name,
      cedula: clientDto.cedula,
      cedula_display: formatCedulaDisplay(clientDto.cedula),
      zone: clientDto.zone,
      account_status: clientDto.account,
      plan: clientDto.plan,
      primary,
      contracts: mapped,
    });
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.CONTRACTS_LOAD_FAILED,
      error: "No se pudieron cargar tus contratos. Intenta de nuevo.",
    });
  }
};
