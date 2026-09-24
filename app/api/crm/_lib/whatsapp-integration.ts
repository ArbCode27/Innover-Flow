import { encryptIntegrationSecret } from "./integration-secrets";
import { getSupabaseAdmin } from "./supabase-admin";

export const sanitizeIntegration = (row: Record<string, unknown> | null) => ({
  provider: row?.provider || null,
  status: row?.status || "disconnected",
  config: row?.config || {},
  has_credentials: Boolean(row?.credentials_encrypted),
  last_verified_at: row?.last_verified_at || null,
  last_error: row?.last_error || null,
  updated_at: row?.updated_at || null,
});

export const upsertWhatsappIntegration = async ({
  organizationId,
  agentId,
  status,
  config,
  secret,
  lastError = null,
}: {
  organizationId: string;
  agentId: number;
  status: "connected" | "pending" | "error";
  config: Record<string, unknown>;
  secret: string;
  lastError?: string | null;
}) => {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("organization_integrations")
    .upsert(
      {
        organization_id: organizationId,
        provider: "whatsapp",
        status,
        config,
        credentials_encrypted: encryptIntegrationSecret(secret),
        last_verified_at: status === "connected" ? now : null,
        last_error: lastError,
        configured_by: agentId,
        updated_at: now,
      },
      { onConflict: "organization_id,provider" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return sanitizeIntegration(data);
};
