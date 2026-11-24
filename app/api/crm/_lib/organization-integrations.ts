import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptIntegrationSecret } from "./integration-secrets";
import { getSupabaseAdmin } from "./supabase-admin";

export type IntegrationProvider = "wispro" | "whatsapp" | "smartolt" | "sae";

export const sanitizeIntegration = (row: Record<string, unknown> | null) => ({
  provider: row?.provider || null,
  status: row?.status || "disconnected",
  config: row?.config || {},
  has_credentials: Boolean(row?.credentials_encrypted),
  last_verified_at: row?.last_verified_at || null,
  last_error: row?.last_error || null,
  updated_at: row?.updated_at || null,
});

export const isIntegrationConnected = async (
  supabase: SupabaseClient,
  organizationId: string,
  provider: IntegrationProvider,
) => {
  const { data, error } = await supabase
    .from("organization_integrations")
    .select("status")
    .eq("organization_id", organizationId)
    .eq("provider", provider)
    .maybeSingle();

  if (error) {
    console.warn("[INTEGRATIONS] status_lookup_failed", {
      provider,
      message: error.message,
    });
    return false;
  }

  return data?.status === "connected";
};

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
    const providerName =
      provider === "wispro"
        ? "Wispro"
        : provider === "smartolt"
          ? "SmartOLT"
          : provider === "sae"
            ? "SAE Plus"
            : "Integración";
    throw new Error(
      `${providerName} no está conectado para esta organización`,
    );
  }

  return {
    config: (data.config || {}) as Record<string, unknown>,
    secret: decryptIntegrationSecret(data.credentials_encrypted),
  };
};
