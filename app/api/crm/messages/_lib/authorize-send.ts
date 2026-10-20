import { NextRequest, NextResponse } from "next/server";
import { getCrmAuthContext } from "../../_lib/crm-auth-context";
import { getSupabaseAdmin } from "../../_lib/supabase-admin";

export const authorizeConversationSend = async (
  request: NextRequest,
  conversationId: number,
  agentId?: number,
) => {
  const supabase = getSupabaseAdmin();
  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("id, organization_id, client_id, customer_phone")
    .eq("id", conversationId)
    .maybeSingle();

  if (error || !conversation) {
    return {
      error: NextResponse.json({ error: "La conversación no existe" }, { status: 404 }),
    };
  }

  let sentBy = "Bot IA";
  let senderType: "agent" | "bot" = "bot";

  if (agentId) {
    const context = await getCrmAuthContext(request);
    if (
      context.agentId !== agentId ||
      context.organizationId !== conversation.organization_id
    ) {
      return {
        error: NextResponse.json(
          { error: "No tienes acceso a esta conversación" },
          { status: 403 },
        ),
      };
    }
    const { data: agent } = await supabase
      .from("agents")
      .select("id, name, status")
      .eq("id", agentId)
      .eq("organization_id", conversation.organization_id)
      .maybeSingle();
    if (!agent || agent.status === "inactive") {
      return {
        error: NextResponse.json({ error: "El agente no puede enviar mensajes" }, { status: 403 }),
      };
    }
    sentBy = agent.name;
    senderType = "agent";
  } else {
    const headerSecret = request.headers.get("x-crm-internal-secret") || "";
    const expectedSecret = process.env.CRM_INTERNAL_SECRET?.trim();
    if (!expectedSecret || headerSecret !== expectedSecret) {
      return {
        error: NextResponse.json(
          { error: "Se requiere un agente válido o autorización interna" },
          { status: 401 },
        ),
      };
    }
  }

  return {
    supabase,
    conversation,
    sentBy,
    senderType,
  };
};
