import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { associateWisproClient } from "@/app/crm/_lib/wispro-associate";
import type { Client } from "@/app/crm/_lib/types";
import { getCrmAuthContext } from "../../_lib/crm-auth-context";

const LOG_PREFIX = "[WISPRO_ASSOCIATE]";

const wisproCustomerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  national_identification_number: z.string().min(1),
  phone_mobile: z.string().nullable().optional(),
  zone_name: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
});

const wisproInvoicingSchema = z.object({
  debt: z.number(),
  hasDebt: z.boolean(),
  accountStatus: z.enum(["Al día", "Con deuda", "Suspendido", "Prospecto"]),
  serviceSuspended: z.boolean().optional().default(false),
  contractState: z.string().nullable().optional().default(null),
  snapshot: z
    .object({
      invoiceIndex: z.number(),
      itemIndex: z.number(),
      gross_amount: z.number(),
      amount: z.number(),
    })
    .nullable(),
});

const associateSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
  customer: wisproCustomerSchema,
  invoicing: wisproInvoicingSchema,
  existingClientId: z.coerce.number().int().positive().nullable().optional(),
  conversationPhone: z.string().nullable().optional(),
  whatsappId: z.string().nullable().optional(),
  waName: z.string().nullable().optional(),
  linkId: z.string().trim().min(1).optional(),
});

const getServerEnv = (key: string) => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }

  return value;
};

const maskPhone = (value?: string | null) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 6) return digits ? "***" : null;
  return `${digits.slice(0, 4)}***${digits.slice(-3)}`;
};

const createLinkId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `link_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export async function POST(req: NextRequest) {
  let linkId = createLinkId();

  try {
    const payload = associateSchema.safeParse(await req.json());

    if (!payload.success) {
      console.warn(`${LOG_PREFIX} validation_failed`, {
        linkId,
        issue: payload.error.issues[0]?.message || "Datos inválidos",
      });
      return NextResponse.json(
        { error: payload.error.issues[0]?.message || "Datos inválidos", linkId },
        { status: 400 },
      );
    }

    const {
      conversationId,
      customer,
      invoicing,
      existingClientId,
      conversationPhone,
      whatsappId,
      waName,
    } = payload.data;

    linkId = payload.data.linkId || linkId;

    console.log(`${LOG_PREFIX} request_received`, {
      linkId,
      conversationId,
      wisproId: customer.id,
      cedula: customer.national_identification_number,
      existingClientId: existingClientId ?? null,
      conversationPhone: maskPhone(conversationPhone),
      whatsappId: maskPhone(whatsappId),
      accountStatus: invoicing.accountStatus,
      serviceSuspended: Boolean(invoicing.serviceSuspended),
      hasDebt: invoicing.hasDebt,
    });

    const context = await getCrmAuthContext(req);
    const supabase = createClient(
      getServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id, organization_id, client_id, customer_phone")
      .eq("id", conversationId)
      .eq("organization_id", context.organizationId)
      .maybeSingle<{
        id: number;
        organization_id: string;
        client_id: number | null;
        customer_phone: string | null;
      }>();

    if (conversationError) {
      console.error(`${LOG_PREFIX} conversation_lookup_failed`, {
        linkId,
        conversationId,
        message: conversationError.message,
        code: conversationError.code,
      });
      return NextResponse.json(
        { error: "No se pudo validar la conversación", linkId },
        { status: 500 },
      );
    }

    if (!conversation) {
      console.warn(`${LOG_PREFIX} conversation_missing`, {
        linkId,
        conversationId,
      });
      return NextResponse.json(
        { error: "La conversación no existe", linkId },
        { status: 404 },
      );
    }

    const client = await associateWisproClient(supabase, {
      organizationId: context.organizationId,
      conversationId,
      customer,
      invoicing,
      existingClientId: existingClientId ?? conversation.client_id,
      conversationPhone: conversationPhone ?? conversation.customer_phone,
      whatsappId: whatsappId ?? conversation.customer_phone,
      waName,
      linkId,
    });

    console.log(`${LOG_PREFIX} success`, {
      linkId,
      conversationId,
      clientId: client.id,
      wisproId: client.wispro_id || null,
      hasWhatsappId: Boolean(client.whatsapp_id),
      hasEnvoicing: Boolean(client.envoicing),
      account: client.account,
    });

    return NextResponse.json({ client: client as Client, linkId });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Missing environment")) {
      console.error(`${LOG_PREFIX} config_missing`, { linkId, message: error.message });
      return NextResponse.json(
        { error: "Integración Wispro no configurada en el servidor", linkId },
        { status: 503 },
      );
    }

    const message =
      error instanceof Error ? error.message : "No se pudo asociar el cliente";

    console.error(`${LOG_PREFIX} failed`, {
      linkId,
      message,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : String(error),
    });

    return NextResponse.json({ error: message, linkId }, { status: 500 });
  }
}
