import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getCrmAuthContext } from "../../crm/_lib/crm-auth-context";
import { getOrganizationIntegration } from "../../crm/_lib/organization-integrations";

const GRAPH_API_VERSION = "v19.0";

const sendMessageSchema = z.object({
  to: z.string().trim().min(1, "El destinatario es requerido"),
  message: z
    .string()
    .trim()
    .min(1, "El mensaje no puede estar vacío")
    .max(4096, "El mensaje no puede superar 4096 caracteres"),
  conversation_id: z.coerce.number().int().positive(),
  agent_id: z.coerce.number().int().positive().optional(),
});

const normalizeWhatsAppPhone = (phone: string) => phone.replace(/\D/g, "");

const getServerEnv = (key: string) => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }

  return value;
};

export async function POST(req: NextRequest) {
  try {
    const payload = sendMessageSchema.safeParse(await req.json());

    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const { to, message, conversation_id, agent_id } = payload.data;
    const normalizedTo = normalizeWhatsAppPhone(to);
    let sentBy: string | null = null;

    if (normalizedTo.length < 8 || normalizedTo.length > 15) {
      return NextResponse.json(
        { error: "El número de WhatsApp no tiene un formato válido" },
        { status: 400 },
      );
    }

    const supabase = createClient(
      getServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id, organization_id, client_id, customer_phone")
      .eq("id", conversation_id)
      .maybeSingle();

    if (conversationError) {
      console.error("Error Supabase conversation:", conversationError);
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

    if (agent_id) {
      const context = await getCrmAuthContext(req);
      if (
        context.agentId !== agent_id ||
        context.organizationId !== conversation.organization_id
      ) {
        return NextResponse.json(
          { error: "No tienes acceso a esta conversación" },
          { status: 403 },
        );
      }
      const { data: agent, error: agentError } = await supabase
        .from("agents")
        .select("id, name, status")
        .eq("id", agent_id)
        .eq("organization_id", conversation.organization_id)
        .maybeSingle();

      if (agentError) {
        console.error("Error Supabase agent:", agentError);
        return NextResponse.json(
          { error: "No se pudo validar el agente" },
          { status: 500 },
        );
      }

      if (!agent) {
        return NextResponse.json(
          { error: "El agente no existe" },
          { status: 404 },
        );
      }

      if (agent.status === "inactive") {
        return NextResponse.json(
          { error: "El agente está inactivo y no puede enviar mensajes" },
          { status: 403 },
        );
      }

      sentBy = agent.name;
    } else {
      const headerSecret = req.headers.get("x-crm-internal-secret") || "";
      const expectedSecret = process.env.CRM_INTERNAL_SECRET?.trim();
      if (!expectedSecret || headerSecret !== expectedSecret) {
        return NextResponse.json(
          { error: "Se requiere un agente válido o autorización interna" },
          { status: 401 },
        );
      }
      sentBy = "Bot IA";
    }

    const knownPhones: string[] = [];
    if (conversation.customer_phone) {
      knownPhones.push(normalizeWhatsAppPhone(conversation.customer_phone));
    }

    if (conversation.client_id) {
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("phone, whatsapp_id")
        .eq("id", conversation.client_id)
        .eq("organization_id", conversation.organization_id)
        .maybeSingle();

      if (clientError) {
        console.error("Error Supabase client:", clientError);
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
    if (
      uniqueKnownPhones.length > 0 &&
      !uniqueKnownPhones.includes(normalizedTo)
    ) {
      return NextResponse.json(
        { error: "El destinatario no coincide con el contacto de la conversación" },
        { status: 400 },
      );
    }

    // 1. Enviar mensaje a WhatsApp Cloud API
    const whatsapp = await getOrganizationIntegration(
      String(conversation.organization_id),
      "whatsapp",
    );
    const phoneNumberId = String(whatsapp.config.phone_number_id || "");
    if (!phoneNumberId) {
      throw new Error("La integración de WhatsApp no tiene Phone Number ID");
    }
    const waResponse = await fetch(
      `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${whatsapp.secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: normalizedTo,
          type: "text",
          text: { body: message },
        }),
      },
    );

    const waData = await waResponse.json();

    // 2. Verificar si Meta lo aceptó
    if (!waResponse.ok || waData.error) {
      console.error("Error Meta:", waData.error);
      const code = waData.error?.code;
      if (code === 131047 || code === 131051) {
        return NextResponse.json(
          {
            error:
              "La ventana de 24 horas de WhatsApp ha expirado. El cliente debe escribir primero o debes usar una plantilla oficial.",
            code: "24h_window_expired",
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: waData.error?.message || "Error al enviar a WhatsApp" },
        { status: 500 },
      );
    }

    const wa_message_id = waData.messages?.[0]?.id || null; // wamid.XXXX

    // 3. Guardar mensaje en Supabase
    const { data: savedMessage, error: dbError } = await supabase
      .from("messages")
      .insert({
        organization_id: conversation.organization_id,
        conversation_id,
        wa_message_id,
        type: "out",
        content: message,
        sender_type: agent_id ? "agent" : "bot",
        sent_by: sentBy ?? "Bot IA",
        status: "sent",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (dbError) {
      console.error("Error Supabase:", dbError);
      return NextResponse.json(
        { error: "Mensaje enviado pero no registrado en BD" },
        { status: 500 },
      );
    }

    // 4. Actualizar preview y timestamps de la conversación
    const now = new Date().toISOString();
    const { error: conversationUpdateError } = await supabase
      .from("conversations")
      .update({
        preview: message,
        updated_at: now,
        last_message_at: now,
      })
      .eq("id", conversation_id)
      .eq("organization_id", conversation.organization_id);

    if (conversationUpdateError) {
      console.error("Error Supabase conversation update:", conversationUpdateError);
      return NextResponse.json(
        { error: "Mensaje enviado pero no se actualizó la conversación" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      wa_message_id,
      message: savedMessage,
    });
  } catch (error) {
    console.error("Error inesperado:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
