import type { SupabaseClient } from "@supabase/supabase-js";

const LOG_PREFIX = "[CRM_ASSIGN]";

/**
 * Assigns a conversation to an advisor (human mode). Soft-fails on errors.
 * Reopens resolved chats so they appear in "Mis conversaciones".
 */
export const assignConversationToAgent = async (
  supabase: SupabaseClient,
  input: {
    conversationId: number;
    agentId: number;
  },
): Promise<{
  assigned: boolean;
  agentName: string | null;
  conversationId: number;
}> => {
  const conversationId = Number(input.conversationId);
  const agentId = Number(input.agentId);

  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    console.warn(`${LOG_PREFIX} invalid_conversation_id`, {
      conversationId: input.conversationId,
      agentId: input.agentId,
    });
    return {
      assigned: false,
      agentName: null,
      conversationId: conversationId || 0,
    };
  }

  if (!Number.isFinite(agentId) || agentId <= 0) {
    console.warn(`${LOG_PREFIX} invalid_agent_id`, {
      conversationId,
      agentId: input.agentId,
    });
    return { assigned: false, agentName: null, conversationId };
  }

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id, name")
    .eq("id", agentId)
    .maybeSingle();

  if (agentError || !agent) {
    console.warn(`${LOG_PREFIX} agent_not_found`, {
      conversationId,
      agentId,
      error: agentError?.message || "not_found",
    });
    return { assigned: false, agentName: null, conversationId };
  }

  const agentName = String(agent.name || "").trim() || `Asesor #${agentId}`;
  const now = new Date().toISOString();

  const { data: conversation, error: readError } = await supabase
    .from("conversations")
    .select("id, status, agent_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (readError || !conversation) {
    console.warn(`${LOG_PREFIX} conversation_not_found`, {
      conversationId,
      agentId,
      error: readError?.message || "not_found",
    });
    return { assigned: false, agentName, conversationId };
  }

  const currentStatus = String(conversation.status || "").trim().toLowerCase();
  const nextStatus = currentStatus === "resuelto" ? "proceso" : conversation.status;

  const { data: updated, error: updateError } = await supabase
    .from("conversations")
    .update({
      agent_id: agentId,
      human_mode: true,
      agent_control: agentName,
      status: nextStatus,
      updated_at: now,
    })
    .eq("id", conversationId)
    .select("id, agent_id, human_mode")
    .maybeSingle();

  if (updateError || !updated) {
    console.warn(`${LOG_PREFIX} assign_failed`, {
      conversationId,
      agentId,
      error: updateError?.message || "no_row_returned",
    });
    return { assigned: false, agentName, conversationId };
  }

  const persistedAgentId = Number(updated.agent_id);
  const assignedOk = persistedAgentId === agentId;

  console.log(`${LOG_PREFIX} assigned`, {
    conversationId,
    agentId,
    agentName,
    previousAgentId: conversation.agent_id ?? null,
    persistedAgentId,
    humanMode: updated.human_mode,
    status: nextStatus,
    assignedOk,
  });

  return { assigned: assignedOk, agentName, conversationId };
};

/**
 * Prefer payment.conversation_id; else newest open conversation for the client.
 * Coerces string/bigint ids from PostgREST.
 */
export const resolveConversationIdForPayment = async (
  supabase: SupabaseClient,
  input: {
    conversationId?: number | string | null;
    clientId?: number | string | null;
  },
): Promise<number | null> => {
  const conversationId = Number(input.conversationId);
  if (Number.isFinite(conversationId) && conversationId > 0) {
    return conversationId;
  }

  const clientId = Number(input.clientId);
  if (!Number.isFinite(clientId) || clientId <= 0) {
    return null;
  }

  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("client_id", clientId)
    .neq("status", "resuelto")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn(`${LOG_PREFIX} resolve_by_client_failed`, {
      clientId,
      error: error.message,
    });
    return null;
  }

  const resolved = Number(data?.id);
  return Number.isFinite(resolved) && resolved > 0 ? resolved : null;
};
