import { decryptIntegrationSecret } from "./integration-secrets";
import { getSupabaseAdmin } from "./supabase-admin";

export type IntegrationProvider = "wispro" | "whatsapp";

export const getOrganizationIntegration = async (
  organizationId: string,
  provider: IntegrationProvider,
) => {
  const { data, error } = await getSupabaseAdmin()
    .from("organization_integrations")
    .select("status, config, credentials_encrypted")
    .eq("organization_id", organizationId)
    .eq("provider", provider)
    .maybeSingle();

  if (error) throw error;
  if (
    !data ||
    data.status !== "connected" ||
    !data.credentials_encrypted
  ) {
    throw new Error(
      `${provider === "wispro" ? "Wispro" : "WhatsApp Business"} no está conectado para esta organización`,
    );
  }

  return {
    config: (data.config || {}) as Record<string, unknown>,
    secret: decryptIntegrationSecret(data.credentials_encrypted),
  };
};

export const findOrganizationByWhatsappPhoneId = async (
  phoneNumberId: string,
) => {
  const { data, error } = await getSupabaseAdmin()
    .from("organization_integrations")
    .select("organization_id, config, credentials_encrypted")
    .eq("provider", "whatsapp")
    .eq("status", "connected")
    .contains("config", { phone_number_id: phoneNumberId })
    .maybeSingle();

  if (error) throw error;
  if (!data?.credentials_encrypted) return null;
  return {
    organizationId: String(data.organization_id),
    config: (data.config || {}) as Record<string, unknown>,
    accessToken: decryptIntegrationSecret(data.credentials_encrypted),
  };
};
