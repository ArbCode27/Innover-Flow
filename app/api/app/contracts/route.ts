import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import {
  listContractsByClientId,
  resolvePreferredContract,
  withOptionalOrganizationWispro,
} from "@/app/api/crm/_lib/wispro-api";
import { getAppAuthContext } from "../_lib/app-auth";
import {
  formatCedulaDisplay,
  toAppClientDto,
  toAppContractDto,
} from "../_lib/app-client-dtos";
import { APP_ERROR_CODES, toAppErrorResponse } from "../_lib/app-errors";
import { loadAppClient } from "../_lib/load-app-client";

export const GET = async (_request: NextRequest) => {
  try {
    const session = await getAppAuthContext(_request);
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
        primary: null,
        contracts: [],
      });
    }

    const contracts = await withOptionalOrganizationWispro(
      session.organizationId,
      () => listContractsByClientId(clientDto.wispro_id!),
    );
    const preferred = resolvePreferredContract(contracts);
    const primaryId = preferred?.id ?? null;
    const mapped = contracts.map((contract) =>
      toAppContractDto(contract, contract.id === primaryId),
    );
    const primary = mapped.find((item) => item.is_primary) ?? null;

    return NextResponse.json({
      wispro_linked: true,
      holder_name: clientDto.name,
      cedula: clientDto.cedula,
      cedula_display: formatCedulaDisplay(clientDto.cedula),
      zone: clientDto.zone,
      account_status: clientDto.account,
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
