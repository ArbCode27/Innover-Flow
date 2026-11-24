import { getOrganizationIntegration } from "./organization-integrations";
import {
  parseSaeSecret,
  type SaeConfig,
} from "@/lib/sae";

export * from "@/lib/sae";

export const getOrganizationSaeConfig = async (
  organizationId: string,
): Promise<SaeConfig> => {
  const { config, secret } = await getOrganizationIntegration(
    organizationId,
    "sae",
  );
  const credentials = parseSaeSecret(secret);
  const baseUrl = String(
    config.base_url || "https://apiservice.saeplus.com",
  ).replace(/\/+$/, "");

  return {
    baseUrl,
    apiToken: credentials.apiToken,
    apiConnect: credentials.apiConnect,
    testContractId: config.test_contract_id
      ? String(config.test_contract_id).trim()
      : null,
  };
};
