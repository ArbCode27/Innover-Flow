import { decryptIntegrationSecret } from "./integration-secrets";
import { getSupabaseAdmin } from "./supabase-admin";

export type IntegrationProvider = "wispro" | "whatsapp";

export const sanitizeIntegration = (row: Record<string, unknown> | null) => ({
  provider: row?.provider || null,
  status: row?.status || "disconnected",
  config: row?.config || {},
  has_credentials: Boolean(row?.credentials_encrypted),
  last_verified_at: row?.last_verified_at || null,
  last_error: row?.last_error || null,
  updated_at: row?.updated_at || null,
});

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
      `${provider === "wispro" ? "Wispro" : "Integración"} no está conectado para esta organización`,
    );
  }

  return {
    config: (data.config || {}) as Record<string, unknown>,
    secret: decryptIntegrationSecret(data.credentials_encrypted),
  };
};
