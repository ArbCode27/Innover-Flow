import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { replyToConversationWithAi } from "@/app/api/crm/ai/_lib/reply-to-conversation";
import { intakeCrmReceipt } from "@/app/api/crm/_lib/crm-payments";
import { resolveLinkedClientIdentity } from "@/app/crm/_lib/client-profile-utils";
import { getCrmAuthContext } from "@/app/api/crm/_lib/crm-auth-context";
import { withOrganizationWhatsapp } from "@/app/api/crm/_lib/whatsapp-runtime";
import { withOptionalOrganizationWispro } from "@/app/api/crm/_lib/wispro-api";

const payloadSchema = z.object({
  messageId: z.coerce.number().int().positive(),
  conversationId: z.coerce.number().int().positive(),
  agentId: z.coerce.number().int().positive(),
});

type DbMessage = {
  id: number;
  conversation_id: number;
  wa_message_id: string | null;
  media_url: string | null;
  media_type: string | null;
  type: string;
  metadata: Record<string, unknown> | null;
};

type DbConversation = {
  id: number;
  organization_id: string;
  client_id: number | null;
  agent_id: number | null;
};

type DbAgent = {
  id: number;
  role: string | null;
};

const getServerEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

const toNonEmptyString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const readMetadataFlag = (
  metadata: Record<string, unknown> | null,
  key: string,
) => {
  const value = metadata?.[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
};

export async function POST(req: NextRequest) {
  try {
    const parsedPayload = payloadSchema.safeParse(await req.json());
    if (!parsedPayload.success) {
      return NextResponse.json(
        { error: parsedPayload.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const { messageId, conversationId, agentId } = parsedPayload.data;
    const context = await getCrmAuthContext(req);
    if (context.agentId !== agentId) {
      return NextResponse.json(
        { error: "No puedes procesar pagos en nombre de otro asesor" },
        { status: 403 },
      );
    }

    const supabase = createClient(
      getServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, role")
      .eq("id", agentId)
      .eq("organization_id", context.organizationId)
      .maybeSingle<DbAgent>();

    if (agentError) {
      console.error("Process receipt agent lookup:", agentError);
      return NextResponse.json(
        { error: "No se pudo validar el asesor" },
        { status: 500 },
      );
    }

    if (!agent) {
      return NextResponse.json(
        { error: "El asesor no existe" },
        { status: 404 },
      );
    }

    const isAdmin = String(agent.role || "").toLowerCase() === "admin";

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id, organization_id, client_id, agent_id")
      .eq("id", conversationId)
      .eq("organization_id", context.organizationId)
      .maybeSingle<DbConversation>();

    if (conversationError) {
      console.error("Process receipt conversation lookup:", conversationError);
      return NextResponse.json(
        { error: "No se pudo validar la conversación" },
        { status: 500 },
      );
    }

    if (!conversation) {
      return NextResponse.json(
        { error: "La conversación no existe" },
        { status: 404 },
      );
    }

    if (
      conversation.agent_id &&
      conversation.agent_id !== agentId &&
      !isAdmin
    ) {
      return NextResponse.json(
        {
          error:
            "Esta conversación está asignada a otro asesor y no puedes procesar su comprobante",
        },
        { status: 403 },
      );
    }

    const { data: message, error: messageError } = await supabase
      .from("messages")
      .select(
        "id, conversation_id, wa_message_id, media_url, media_type, type, metadata",
      )
      .eq("id", messageId)
      .eq("organization_id", context.organizationId)
      .maybeSingle<DbMessage>();

    if (messageError) {
      console.error("Process receipt message lookup:", messageError);
      return NextResponse.json(
        { error: "No se pudo validar el mensaje" },
        { status: 500 },
      );
    }

    if (!message) {
      return NextResponse.json(
        { error: "El mensaje no existe" },
        { status: 404 },
      );
    }

    if (message.conversation_id !== conversationId) {
      return NextResponse.json(
        { error: "El mensaje no pertenece a la conversación indicada" },
        { status: 400 },
      );
    }

    if (message.type !== "in" || message.media_type !== "image") {
      return NextResponse.json(
        { error: "Solo se pueden procesar imágenes enviadas por clientes" },
        { status: 400 },
      );
    }

    const fileUrl = toNonEmptyString(message.media_url);
    if (!fileUrl) {
      return NextResponse.json(
        { error: "La imagen no tiene URL pública disponible" },
        { status: 400 },
      );
    }

    let clientName: string | null = null;
    let phoneId: string | null = null;
    let linkedIdentity: ReturnType<typeof resolveLinkedClientIdentity> = {
      linked: false,
      wisproId: null,
      cedula: null,
      name: null,
    };

    if (conversation.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("id, name, phone, whatsapp_id, wispro_id, envoicing")
        .eq("id", conversation.client_id)
        .eq("organization_id", context.organizationId)
        .maybeSingle<{
          id: number;
          name: string | null;
          phone: string | null;
          whatsapp_id: string | null;
          wispro_id: string | null;
          envoicing: string | null;
        }>();
      linkedIdentity = resolveLinkedClientIdentity(client);
      clientName = linkedIdentity.name || client?.name?.trim() || null;
      phoneId = client?.whatsapp_id?.trim() || client?.phone?.trim() || null;
    }

    if (!linkedIdentity.linked || !linkedIdentity.wisproId) {
      return NextResponse.json(
        { error: "Vincula el cliente a Wispro antes de registrar el pago" },
        { status: 409 },
      );
    }

    if (!linkedIdentity.cedula) {
      return NextResponse.json(
        {
          error:
            "El cliente vinculado no tiene cédula en la base de datos. Vuelve a asociarlo a Wispro.",
        },
        { status: 409 },
      );
    }

    const intake = await intakeCrmReceipt(supabase, {
      organizationId: context.organizationId,
      clientId: conversation.client_id,
      conversationId,
      messageId: message.id,
      submittedByAgentId: agentId,
      clientName,
      cedula: linkedIdentity.cedula,
      wisproClientId: linkedIdentity.wisproId,
      phoneId,
      receiptMediaUrl: fileUrl,
      source: "advisor",
      receiptMetadata: {
        requested_manually: true,
        requested_by_agent_id: agentId,
        requested_from_message_id: message.id,
        intake_at: new Date().toISOString(),
        linked_wispro_id: linkedIdentity.wisproId,
      },
    });

    if (!intake.ok) {
      return NextResponse.json(
        { error: "No se pudo registrar el comprobante en la bandeja de pagos" },
        { status: 500 },
      );
    }

    const metadata = (message.metadata || {}) as Record<string, unknown>;
    const alreadyRequested = readMetadataFlag(
      metadata,
      "payment_receipt_requested",
    );

    if (alreadyRequested) {
      if (intake.payment?.id && metadata.crm_payment_id !== intake.payment.id) {
        await supabase
          .from("messages")
          .update({
            metadata: {
              ...metadata,
              crm_payment_id: intake.payment.id,
            },
          })
          .eq("id", message.id)
          .eq("organization_id", context.organizationId);
      }

      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        messageId: message.id,
        paymentId: intake.payment?.id ?? null,
        engine: "ai",
      });
    }

    const nextMetadata: Record<string, unknown> = {
      ...metadata,
      payment_receipt_requested: true,
      payment_receipt_requested_at: new Date().toISOString(),
      payment_receipt_requested_by: agentId,
      payment_receipt_engine: "ai",
      crm_payment_id: intake.payment?.id ?? null,
    };

    const { error: updateMessageError } = await supabase
      .from("messages")
      .update({ metadata: nextMetadata })
      .eq("id", message.id)
      .eq("organization_id", context.organizationId);

    if (updateMessageError) {
      console.error(
        "Process receipt update message metadata:",
        updateMessageError,
      );
      return NextResponse.json(
        { error: "No se pudo marcar el comprobante para procesamiento" },
        { status: 500 },
      );
    }

    // Run AI after response so the UI stays snappy; forceRun allows human_mode chats.
    after(async () => {
      try {
        const result = await withOrganizationWhatsapp(
          context.organizationId,
          () =>
            withOptionalOrganizationWispro(context.organizationId, () =>
              replyToConversationWithAi(supabase, {
                conversationId,
                triggerMessageId: message.id,
                forceRun: true,
                paymentRequestedByAgentId: agentId,
              }),
            ),
        );

        console.log("[PROCESS_RECEIPT] ai_finished", {
          conversationId,
          messageId: message.id,
          ok: result.ok,
          reason: result.reason,
          action: result.action ?? null,
        });
      } catch (error) {
        console.error("[PROCESS_RECEIPT] ai_failed", {
          conversationId,
          messageId: message.id,
          error: error instanceof Error ? error.message : "unknown_error",
        });
      }
    });

    return NextResponse.json({
      success: true,
      alreadyProcessed: false,
      messageId: message.id,
      paymentId: intake.payment?.id ?? null,
      engine: "ai",
      scheduled: true,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Missing environment")
    ) {
      console.error(error.message);
      return NextResponse.json(
        { error: "CRM no configurado en el servidor" },
        { status: 503 },
      );
    }

    console.error("Process receipt error:", error);
    return NextResponse.json(
      { error: "Error interno al procesar el comprobante" },
      { status: 500 },
    );
  }
}
