import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canManageOrganization,
  CrmAuthError,
  getCrmAuthContext,
} from "../../../_lib/crm-auth-context";
import { decryptIntegrationSecret } from "../../../_lib/integration-secrets";
import { getSupabaseAdmin } from "../../../_lib/supabase-admin";
import {
  exchangeEmbeddedSignupCode,
  getEmbeddedSignupEnv,
  listWabaPhoneNumbers,
  resolveSignupPhoneNumberId,
  subscribeWabaToApp,
  verifyWhatsappPhone,
  WhatsappGraphError,
  type WhatsappPhoneNumber,
} from "../../../_lib/whatsapp-graph";
import {
  sanitizeIntegration,
  upsertWhatsappIntegration,
} from "../../../_lib/whatsapp-integration";

const startSchema = z.object({
  code: z.string().trim().min(10).max(4000),
  wabaId: z.string().trim().min(3).max(80),
  phoneNumberId: z.string().trim().min(3).max(80).optional(),
  signupEvent: z.string().trim().max(80).optional(),
});

const completeSchema = z.object({
  phoneNumberId: z.string().trim().min(3).max(80),
});

const COEXISTENCE_EVENTS = new Set([
  "FINISH",
  "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
  "FINISH_ONLY_WABA",
]);

const handleError = (error: unknown) => {
  if (error instanceof CrmAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof WhatsappGraphError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message =
    error instanceof Error
      ? error.message
      : "No se pudo completar Embedded Signup";
  console.error("[WHATSAPP_EMBEDDED_SIGNUP] request_failed", message);
  return NextResponse.json({ error: message }, { status: 500 });
};

const publicPhones = (phones: WhatsappPhoneNumber[]) =>
  phones.map((phone) => ({
    id: phone.id,
    display_phone_number: phone.display_phone_number,
    verified_name: phone.verified_name,
    quality_rating: phone.quality_rating,
    status: phone.status,
  }));

const connectWhatsapp = async ({
  organizationId,
  agentId,
  accessToken,
  wabaId,
  phoneNumberId,
  signupEvent,
  existingConfig,
}: {
  organizationId: string;
  agentId: number;
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  signupEvent?: string;
  existingConfig?: Record<string, unknown>;
}) => {
  const verified = await verifyWhatsappPhone(
    accessToken,
    wabaId,
    phoneNumberId,
  );
  const restConfig = Object.fromEntries(
    Object.entries(existingConfig || {}).filter(([key]) => key !== "pending_phones"),
  );
  return upsertWhatsappIntegration({
    organizationId,
    agentId,
    status: "connected",
    secret: accessToken,
    config: {
      ...restConfig,
      ...verified,
      connected_via: "embedded_signup",
      signup_event: signupEvent || "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
    },
  });
};

export const POST = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    if (!canManageOrganization(context)) {
      return NextResponse.json(
        { error: "Solo administradores pueden vincular WhatsApp" },
        { status: 403 },
      );
    }

    if (!getEmbeddedSignupEnv().ready) {
      return NextResponse.json(
        {
          error:
            "Falta configurar NEXT_PUBLIC_META_APP_ID, NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID y WHATSAPP_APP_SECRET",
        },
        { status: 503 },
      );
    }

    const rawPayload = await request.json();
    const hasCode = typeof rawPayload?.code === "string";
    const parsed = hasCode
      ? startSchema.safeParse(rawPayload)
      : completeSchema.safeParse(rawPayload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    if (!hasCode) {
      const { phoneNumberId } = parsed.data as z.infer<typeof completeSchema>;
      const { data: existing, error } = await getSupabaseAdmin()
        .from("organization_integrations")
        .select("*")
        .eq("organization_id", context.organizationId)
        .eq("provider", "whatsapp")
        .maybeSingle();
      if (error) throw error;
      if (!existing?.credentials_encrypted) {
        return NextResponse.json(
          { error: "No hay una vinculación de Meta pendiente" },
          { status: 409 },
        );
      }

      const config = (existing.config || {}) as Record<string, unknown>;
      const wabaId = String(config.waba_id || "").trim();
      if (!wabaId) {
        return NextResponse.json(
          { error: "La vinculación pendiente no tiene WABA ID" },
          { status: 409 },
        );
      }

      const accessToken = decryptIntegrationSecret(
        existing.credentials_encrypted,
      );
      const phones = await listWabaPhoneNumbers(accessToken, wabaId);
      const resolvedPhoneId = resolveSignupPhoneNumberId(phones, phoneNumberId);
      if (!resolvedPhoneId) {
        return NextResponse.json(
          {
            status: "pending",
            phones: publicPhones(phones),
            integration: sanitizeIntegration(existing),
          },
          { status: 409 },
        );
      }

      const integration = await connectWhatsapp({
        organizationId: context.organizationId,
        agentId: context.agentId,
        accessToken,
        wabaId,
        phoneNumberId: resolvedPhoneId,
        signupEvent: String(config.signup_event || ""),
        existingConfig: config,
      });
      return NextResponse.json({ status: "connected", integration });
    }

    const { code, wabaId, phoneNumberId, signupEvent } = parsed.data as z.infer<
      typeof startSchema
    >;
    if (signupEvent && !COEXISTENCE_EVENTS.has(signupEvent)) {
      return NextResponse.json(
        {
          error:
            "El flujo de Meta no fue de coexistencia. Debes conectar un número de WhatsApp Business existente.",
        },
        { status: 409 },
      );
    }

    const accessToken = await exchangeEmbeddedSignupCode(code);

    try {
      await subscribeWabaToApp(accessToken, wabaId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo suscribir el webhook de WhatsApp";
      throw new WhatsappGraphError(
        `La cuenta se autorizó, pero el webhook no quedó suscrito: ${message}`,
        502,
      );
    }

    const phones = await listWabaPhoneNumbers(accessToken, wabaId);
    if (phones.length === 0) {
      throw new WhatsappGraphError(
        "Meta no devolvió números en esa cuenta de WhatsApp",
        409,
      );
    }

    const resolvedPhoneId = resolveSignupPhoneNumberId(phones, phoneNumberId);
    if (!resolvedPhoneId) {
      const integration = await upsertWhatsappIntegration({
        organizationId: context.organizationId,
        agentId: context.agentId,
        status: "pending",
        secret: accessToken,
        config: {
          waba_id: wabaId,
          connected_via: "embedded_signup",
          signup_event:
            signupEvent || "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
          coexistence_enabled: true,
          coexistence_auto_human: true,
          coexistence_sync_echoes: true,
          pending_phones: publicPhones(phones),
        },
      });
      return NextResponse.json({
        status: "pending",
        phones: publicPhones(phones),
        integration,
      });
    }

    const integration = await connectWhatsapp({
      organizationId: context.organizationId,
      agentId: context.agentId,
      accessToken,
      wabaId,
      phoneNumberId: resolvedPhoneId,
      signupEvent,
    });
    return NextResponse.json({ status: "connected", integration });
  } catch (error) {
    return handleError(error);
  }
};
