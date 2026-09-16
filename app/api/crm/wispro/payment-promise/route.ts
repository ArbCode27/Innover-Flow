import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  createPaymentPromiseForClient,
  DEFAULT_PAYMENT_PROMISE_HOURS,
  withOrganizationWispro,
} from "@/app/api/crm/_lib/wispro-api";
import { getCrmAuthContext } from "../../_lib/crm-auth-context";

const bodySchema = z.object({
  clientId: z.coerce.number().int().positive().optional(),
  conversationId: z.coerce.number().int().positive().optional(),
  wisproId: z.string().trim().min(1).optional(),
  cedula: z.string().trim().min(1).optional(),
  hours: z.coerce.number().int().positive().max(168).optional(),
});

const getServerEnv = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
};

export async function POST(req: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const { clientId, conversationId, hours } = parsed.data;
    const context = await getCrmAuthContext(req);
    let wisproId = parsed.data.wisproId?.trim() || null;
    let cedula = parsed.data.cedula?.trim() || null;

    if ((!wisproId || !cedula) && (clientId || conversationId)) {
      const supabase = createClient(
        getServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
        getServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
      );

      let resolvedClientId = clientId ?? null;

      if (!resolvedClientId && conversationId) {
        const { data: conversation, error } = await supabase
          .from("conversations")
          .select("client_id")
          .eq("id", conversationId)
          .eq("organization_id", context.organizationId)
          .maybeSingle();

        if (error) {
          console.error("[WISPRO_PROMISE_API] conversation_lookup_failed", error);
          return NextResponse.json(
            { error: "No se pudo validar la conversación" },
            { status: 500 },
          );
        }

        resolvedClientId = conversation?.client_id
          ? Number(conversation.client_id)
          : null;
      }

      if (resolvedClientId) {
        const { data: client, error: clientError } = await supabase
          .from("clients")
          .select("id, wispro_id, name")
          .eq("id", resolvedClientId)
          .eq("organization_id", context.organizationId)
          .maybeSingle();

        if (clientError) {
          console.error("[WISPRO_PROMISE_API] client_lookup_failed", clientError);
          return NextResponse.json(
            { error: "No se pudo cargar el cliente" },
            { status: 500 },
          );
        }

        if (!client?.wispro_id) {
          return NextResponse.json(
            {
              error:
                "El cliente no está vinculado a Wispro. Vincúlalo antes de crear la promesa.",
            },
            { status: 400 },
          );
        }

        wisproId = wisproId || String(client.wispro_id);
      }
    }

    if (!wisproId && !cedula) {
      return NextResponse.json(
        { error: "Se requiere un cliente vinculado a Wispro o una cédula" },
        { status: 400 },
      );
    }

    const result = await withOrganizationWispro(
      context.organizationId,
      () =>
        createPaymentPromiseForClient({
          wisproClientId: wisproId,
          cedula,
          hours: hours ?? DEFAULT_PAYMENT_PROMISE_HOURS,
        }),
    );

    if (!result.ok) {
      const status =
        result.reason === "service_active" ||
        result.reason === "payment_incomplete"
          ? 409
          : result.reason === "no_contract" || result.reason === "invalid"
            ? 404
            : result.reason === "config"
              ? 503
              : 502;

      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          reason: result.reason,
        },
        { status },
      );
    }

    return NextResponse.json({
      ok: true,
      promise: result.promise,
      contractId: result.contract.id,
      contractPublicId: result.contract.public_id,
      validUntil: result.validUntil,
      source: "crm_ui",
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Missing environment")) {
      return NextResponse.json(
        { error: "Integración Wispro no configurada en el servidor" },
        { status: 503 },
      );
    }

    console.error("[WISPRO_PROMISE_API] unexpected", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo crear la promesa de pago",
      },
      { status: 500 },
    );
  }
}
