import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getCrmAuthContext } from "../../crm/_lib/crm-auth-context";
import { getOrganizationIntegration } from "../../crm/_lib/organization-integrations";

const GRAPH_API_VERSION = "v19.0";
const LOG_PREFIX = "[WHATSAPP_RESEND]";
const MAX_RESEND_COUNT = 3;

const resendSchema = z.object({
  message_id: z.coerce.number().int().positive(),
  conversation_id: z.coerce.number().int().positive(),
  agent_id: z.coerce.number().int().positive(),
});

type DbMessage = {
  id: number;
  conversation_id: number;
  type: string;
  content: string | null;
  media_type: string | null;
  status: string | null;
  wa_message_id: string | null;
  metadata: Record<string, unknown> | null;
  sender_type: string | null;
};

type DbConversation = {
  id: number;
  organization_id: string;
  client_id: number | null;
  human_mode: boolean | null;
  customer_phone: string | null;
  status: string | null;
};

type DbClient = {
  id: number;
  phone: string | null;
  whatsapp_id: string | null;
};

type DbAgent = {
  id: number;
  name: string;
  status: string | null;
};

const normalizeWhatsAppPhone = (phone: string) => phone.replace(/\D/g, "");

const getServerEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

const readResendCount = (metadata: Record<string, unknown> | null) => {
  const value = metadata?.resent_count;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }
  return 0;
};

export async function POST(req: NextRequest) {
  try {
    const payload = resendSchema.safeParse(await req.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const { message_id, conversation_id, agent_id } = payload.data;
    const context = await getCrmAuthContext(req);
    if (context.agentId !== agent_id) {
      return NextResponse.json(
        { error: "No puedes reenviar en nombre de otro asesor" },
        { status: 403 },
      );
    }

    const supabase = createClient(
      getServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, name, status")
      .eq("id", agent_id)
      .eq("organization_id", context.organizationId)
      .maybeSingle<DbAgent>();

    if (agentError) {
      console.error(`${LOG_PREFIX} agent_lookup_failed`, agentError);
      return NextResponse.json(
        { error: "No se pudo validar el agente" },
        { status: 500 },
      );
    }

    if (!agent) {
      return NextResponse.json({ error: "El agente no existe" }, { status: 404 });
    }

    if (agent.status === "inactive") {
      return NextResponse.json(
        { error: "El agente está inactivo y no puede reenviar mensajes" },
        { status: 403 },
      );
    }

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id, organization_id, client_id, human_mode, customer_phone, status")
      .eq("id", conversation_id)
      .eq("organization_id", context.organizationId)
      .maybeSingle<DbConversation>();

    if (conversationError) {
      console.error(`${LOG_PREFIX} conversation_lookup_failed`, conversationError);
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

    if (conversation.status === "resuelto") {
      return NextResponse.json(
        { error: "La conversación ya está resuelta" },
        { status: 409 },
      );
    }

    if (!Boolean(conversation.human_mode)) {
      return NextResponse.json(
        { error: "Debes tomar control de la conversación para reenviar mensajes" },
        { status: 403 },
      );
    }

    const { data: message, error: messageError } = await supabase
      .from("messages")
      .select(
        "id, conversation_id, type, content, media_type, status, wa_message_id, metadata, sender_type",
      )
      .eq("id", message_id)
      .eq("organization_id", context.organizationId)
      .maybeSingle<DbMessage>();

    if (messageError) {
      console.error(`${LOG_PREFIX} message_lookup_failed`, messageError);
      return NextResponse.json(
        { error: "No se pudo validar el mensaje" },
        { status: 500 },
      );
    }

    if (!message) {
      return NextResponse.json({ error: "El mensaje no existe" }, { status: 404 });
    }

    if (message.conversation_id !== conversation_id) {
      return NextResponse.json(
        { error: "El mensaje no pertenece a la conversación indicada" },
        { status: 400 },
      );
    }

    if (message.type !== "out") {
      return NextResponse.json(
        { error: "Solo se pueden reenviar mensajes salientes" },
        { status: 400 },
      );
    }

    if (message.status !== "failed") {
      return NextResponse.json(
        { error: "Solo se pueden reenviar mensajes fallidos" },
        { status: 400 },
      );
    }

    if (message.media_type) {
      return NextResponse.json(
        { error: "Por ahora solo se pueden reenviar mensajes de texto" },
        { status: 400 },
      );
    }

    const content = String(message.content || "").trim();
    if (!content) {
      return NextResponse.json(
        { error: "El mensaje no tiene contenido para reenviar" },
        { status: 400 },
      );
    }

    const resentCount = readResendCount(message.metadata);
    if (resentCount >= MAX_RESEND_COUNT) {
      return NextResponse.json(
        { error: `Se alcanzó el límite de ${MAX_RESEND_COUNT} reenvíos` },
        { status: 429 },
      );
    }

    const knownPhones: string[] = [];
    if (conversation.customer_phone) {
      knownPhones.push(normalizeWhatsAppPhone(conversation.customer_phone));
    }

    if (conversation.client_id) {
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("id, phone, whatsapp_id")
        .eq("id", conversation.client_id)
        .eq("organization_id", context.organizationId)
        .maybeSingle<DbClient>();

      if (clientError) {
        console.error(`${LOG_PREFIX} client_lookup_failed`, clientError);
        return NextResponse.json(
          { error: "No se pudo validar el cliente de la conversación" },
          { status: 500 },
        );
      }

      if (client?.whatsapp_id) {
        knownPhones.push(normalizeWhatsAppPhone(client.whatsapp_id));
      }
      if (client?.phone) {
        knownPhones.push(normalizeWhatsAppPhone(client.phone));
      }
    }

    const uniqueKnownPhones = [...new Set(knownPhones.filter(Boolean))];
    const to = uniqueKnownPhones[0] || null;

    if (!to) {
      return NextResponse.json(
        {
          error:
            "No hay un número de WhatsApp disponible para reenviar este mensaje",
        },
        { status: 400 },
      );
    }

    if (to.length < 8 || to.length > 15) {
      return NextResponse.json(
        { error: "El número de WhatsApp no tiene un formato válido" },
        { status: 400 },
      );
    }

    const whatsapp = await getOrganizationIntegration(
      context.organizationId,
      "whatsapp",
    );
    const phoneNumberId = String(whatsapp.config.phone_number_id || "");
    const waResponse = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${whatsapp.secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { body: content },
        }),
      },
    );

    const waData = await waResponse.json();
    if (!waResponse.ok || waData.error) {
      console.error(`${LOG_PREFIX} meta_send_failed`, waData.error || waData);
      return NextResponse.json(
        { error: waData.error?.message || "Error al reenviar a WhatsApp" },
        { status: 500 },
      );
    }

    const wa_message_id = waData.messages?.[0]?.id || null;
    if (!wa_message_id) {
      return NextResponse.json(
        { error: "WhatsApp no devolvió un ID de mensaje" },
        { status: 502 },
      );
    }

    const now = new Date().toISOString();
    const nextMetadata: Record<string, unknown> = {
      ...(message.metadata || {}),
      previous_wa_message_id: message.wa_message_id,
      resent_at: now,
      resent_by: agent_id,
      resent_count: resentCount + 1,
    };

    const { data: updatedMessage, error: updateMessageError } = await supabase
      .from("messages")
      .update({
        wa_message_id,
        status: "sent",
        sender_type: "agent",
        sent_by: agent.name,
        metadata: nextMetadata,
      })
      .eq("id", message.id)
      .eq("organization_id", context.organizationId)
      .select()
      .single();

    if (updateMessageError) {
      console.error(`${LOG_PREFIX} message_update_failed`, updateMessageError);
      return NextResponse.json(
        {
          error: "Mensaje reenviado pero no se actualizó en BD",
          wa_message_id,
        },
        { status: 500 },
      );
    }

    const { error: conversationUpdateError } = await supabase
      .from("conversations")
      .update({
        preview: content,
        updated_at: now,
        last_message_at: now,
      })
      .eq("id", conversation_id)
      .eq("organization_id", context.organizationId);

    if (conversationUpdateError) {
      console.error(
        `${LOG_PREFIX} conversation_update_failed`,
        conversationUpdateError,
      );
    }

    console.log(`${LOG_PREFIX} message_resent`, {
      messageId: message.id,
      conversationId: conversation_id,
      waMessageId: wa_message_id,
      agentId: agent_id,
    });

    return NextResponse.json({
      success: true,
      wa_message_id,
      message: updatedMessage,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Missing environment")
    ) {
      console.error(`${LOG_PREFIX} missing_env`, error.message);
      return NextResponse.json(
        { error: "WhatsApp no configurado en el servidor" },
        { status: 503 },
      );
    }

    console.error(`${LOG_PREFIX} unexpected_error`, error);
    return NextResponse.json(
      { error: "Error interno al reenviar el mensaje" },
      { status: 500 },
    );
  }
}
