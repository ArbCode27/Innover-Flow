import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canManageOrganization,
  CrmAuthError,
  getCrmAuthContext,
} from "../../_lib/crm-auth-context";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from "../../_lib/integration-secrets";
import {
  sanitizeIntegration,
} from "../../_lib/organization-integrations";
import { getSupabaseAdmin } from "../../_lib/supabase-admin";

const wisproSchema = z.object({
  apiToken: z.string().trim().min(8).max(500),
  baseUrl: z
    .string()
    .trim()
    .url()
    .max(300)
    .default("https://www.cloud.wispro.co/api/v1"),
});

type Provider = "wispro";

const parseProvider = (value: string): Provider | null =>
  value === "wispro" ? value : null;

const verifyWispro = async (token: string, baseUrl: string) => {
  const response = await fetch(
    `${baseUrl.replace(/\/+$/, "")}/clients?per_page=1`,
    {
      headers: { Accept: "application/json", Authorization: token },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? "Wispro rechazó la API Key"
        : "No se pudo validar la conexión con Wispro",
    );
  }
  return { base_url: baseUrl.replace(/\/+$/, "") };
};

const handleError = (error: unknown) => {
  if (error instanceof CrmAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message =
    error instanceof Error ? error.message : "No se pudo procesar la integración";
  console.error("[CRM_INTEGRATION] request_failed", message);
  return NextResponse.json({ error: message }, { status: 500 });
};

export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) => {
  try {
    const provider = parseProvider((await params).provider);
    if (!provider) {
      return NextResponse.json({ error: "Integración inválida" }, { status: 404 });
    }
    const context = await getCrmAuthContext(request);
    const { data, error } = await getSupabaseAdmin()
      .from("organization_integrations")
      .select("*")
      .eq("organization_id", context.organizationId)
      .eq("provider", provider)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({
      integration: sanitizeIntegration(data),
    });
  } catch (error) {
    return handleError(error);
  }
};

export const PUT = async (
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) => {
  try {
    const provider = parseProvider((await params).provider);
    if (!provider) {
      return NextResponse.json({ error: "Integración inválida" }, { status: 404 });
    }
    const context = await getCrmAuthContext(request);
    if (!canManageOrganization(context)) {
      return NextResponse.json(
        { error: "Solo administradores pueden configurar integraciones" },
        { status: 403 },
      );
    }

    const rawPayload = await request.json();
    const parsed = wisproSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const wispro = parsed.data;
    const config = await verifyWispro(wispro.apiToken, wispro.baseUrl);
    const secret = wispro.apiToken;

    const now = new Date().toISOString();
    const { data, error } = await getSupabaseAdmin()
      .from("organization_integrations")
      .upsert(
        {
          organization_id: context.organizationId,
          provider,
          status: "connected",
          config,
          credentials_encrypted: encryptIntegrationSecret(secret),
          last_verified_at: now,
          last_error: null,
          configured_by: context.agentId,
          updated_at: now,
        },
        { onConflict: "organization_id,provider" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ integration: sanitizeIntegration(data) });
  } catch (error) {
    return handleError(error);
  }
};

export const POST = async (
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) => {
  try {
    const provider = parseProvider((await params).provider);
    if (!provider) {
      return NextResponse.json({ error: "Integración inválida" }, { status: 404 });
    }
    const context = await getCrmAuthContext(request);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("organization_integrations")
      .select("*")
      .eq("organization_id", context.organizationId)
      .eq("provider", provider)
      .maybeSingle();
    if (error) throw error;
    if (!data?.credentials_encrypted) {
      return NextResponse.json(
        { error: "La integración no tiene credenciales configuradas" },
        { status: 409 },
      );
    }

    const secret = decryptIntegrationSecret(data.credentials_encrypted);
    const config = (data.config || {}) as Record<string, unknown>;
    const nextConfig = await verifyWispro(
      secret,
      String(config.base_url || ""),
    );
    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("organization_integrations")
      .update({
        status: "connected",
        config: { ...config, ...nextConfig },
        last_verified_at: now,
        last_error: null,
        updated_at: now,
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (updateError) throw updateError;
    return NextResponse.json({ integration: sanitizeIntegration(updated) });
  } catch (error) {
    return handleError(error);
  }
};

export const DELETE = async (
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) => {
  try {
    const provider = parseProvider((await params).provider);
    if (!provider) {
      return NextResponse.json({ error: "Integración inválida" }, { status: 404 });
    }
    const context = await getCrmAuthContext(request);
    if (!canManageOrganization(context)) {
      return NextResponse.json(
        { error: "Solo administradores pueden desconectar integraciones" },
        { status: 403 },
      );
    }
    const { error } = await getSupabaseAdmin()
      .from("organization_integrations")
      .delete()
      .eq("organization_id", context.organizationId)
      .eq("provider", provider);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
};
