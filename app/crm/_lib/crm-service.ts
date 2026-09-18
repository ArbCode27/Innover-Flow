"use client";

import { createTicketId, getColorByIndex, getInitials } from "./formatters";
import { getSupabaseClient } from "./supabase";
import type {
  Agent,
  AgentStatus,
  Conversation,
  CreateClientInput,
  CreateLabelInput,
  CreateQuickReplyInput,
  CreateTicketInput,
  CrmData,
  CrmSettings,
  Label,
  Message,
  QuickReply,
  Ticket,
  Client,
  ConversationHistory,
  Organization,
  OrganizationRole,
  OrganizationAccess,
  UpdateQuickReplyInput,
  UpsertAgentInput,
} from "./types";
import {
  EMPTY_AI_RECOVERY_MESSAGES,
  parseAiRecoveryMessages,
} from "./ai-recovery-messages";
import { DEFAULT_AI_MODEL } from "./ai-models";
import { DEFAULT_BOT_ENGINE, normalizeBotEngine } from "./bot-engine";
import {
  DEFAULT_AFTER_HOURS_PAYMENTS,
  DEFAULT_OFFICE_HOURS,
  parseAfterHoursPaymentsConfig,
  parseOfficeHoursConfig,
} from "./office-hours";
import { DEFAULT_CRM_ACCENT, parseCrmAccentId } from "./crm-accents";
import type { CrmAccentId, CrmColorMode } from "./crm-accents";

const db = () => getSupabaseClient();

const throwIfError = (error: unknown) => {
  if (error) throw error;
};

const ensureData = <T,>(data: T | null, message: string) => {
  if (!data) throw new Error(message);
  return data;
};

const mutateCrmData = async <T,>(body: Record<string, unknown>) => {
  const response = await fetch("/api/crm/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "No se pudo actualizar el CRM");
  }
  return payload.data as T;
};

const normalizeShortcut = (value?: string) => {
  const trimmed = value?.trim().toLowerCase() ?? "";
  if (!trimmed) return null;

  const normalized = trimmed
    .replace(/^\/+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");

  return normalized || null;
};

export const crmService = {
  async loginAgent(email: string, password: string) {
    const res = await fetch("/api/crm/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Correo o contraseña incorrectos");
    }

    return data.agent as Agent;
  },

  async registerOrganization(payload: {
    organizationName: string;
    name: string;
    email: string;
    password: string;
  }): Promise<{ agent: Agent; organization: Organization }> {
    const res = await fetch("/api/crm/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "No se pudo registrar la organización");
    }

    return data as { agent: Agent; organization: Organization };
  },

  async createOrganization(name: string, slug?: string): Promise<Organization> {
    const res = await fetch("/api/crm/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "No se pudo crear la organización");
    }

    return data.organization as Organization;
  },

  async getCurrentSession(): Promise<{
    agent: Agent;
    organization: Organization;
    organizationRole: OrganizationRole;
  }> {
    const response = await fetch("/api/crm/auth/me", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Sesión no válida");
    }
    return data;
  },

  async getOrganizations(): Promise<OrganizationAccess[]> {
    const response = await fetch("/api/crm/organizations", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudieron cargar las organizaciones");
    }
    return data.organizations || [];
  },

  async switchOrganization(organizationId: string) {
    const response = await fetch("/api/crm/organizations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo cambiar de organización");
    }
  },

  async updateAgentStatus(id: number, status: AgentStatus, organizationId: string) {
    void organizationId;
    await mutateCrmData({ action: "updateAgentStatus", id, status });
  },

  async loadAll(currentAgent: Agent): Promise<CrmData> {
    void currentAgent;
    const response = await fetch("/api/crm/data?resource=bootstrap", {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "No se pudieron cargar los datos del CRM");
    }
    return payload.data as CrmData;
  },

  async updateCrmSettings(
    agentId: number,
    patch: {
      ai_model?: string;
      ai_system_prompt?: string | null;
      payment_success_message?: string | null;
      ai_recovery_messages?: import("./ai-recovery-messages").AiRecoveryMessages;
      office_hours?: import("./office-hours").OfficeHoursConfig;
      after_hours_payments?: import("./office-hours").AfterHoursPaymentsConfig;
    },
  ) {
    const response = await fetch("/api/crm/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: agentId,
        ...patch,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudieron guardar los ajustes");
    }

    return data.settings as CrmSettings;
  },

  async updateAppearance(
    agentId: number,
    patch: {
      ui_accent?: CrmAccentId;
      ui_mode?: CrmColorMode;
      office_ui_accent?: CrmAccentId;
    },
  ) {
    const response = await fetch("/api/crm/appearance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: agentId,
        ...patch,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "No se pudo guardar la apariencia");
    }

    return data as {
      ui_accent?: CrmAccentId;
      ui_mode?: CrmColorMode | null;
      office_ui_accent: CrmAccentId;
    };
  },

  async loadMessages(conversationId: number, organizationId: string) {
    void organizationId;
    const response = await fetch(
      `/api/crm/data?resource=messages&conversationId=${conversationId}`,
      { cache: "no-store" },
    );
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No se pudo cargar");
    return (payload.data || []) as Message[];
  },

  async clearUnread(conversationId: number, organizationId: string) {
    void organizationId;
    await mutateCrmData({ action: "clearUnread", conversationId });
  },

  async sendMessage(conversationId: number, content: string, senderType: "agent" | "bot") {
    const now = new Date().toISOString();
    const { data, error } = await db()
      .from("messages")
      .insert({
        conversation_id: conversationId,
        type: "out",
        content,
        sender_type: senderType,
      })
      .select()
      .single<Message>();

    throwIfError(error);

    const { error: conversationError } = await db()
      .from("conversations")
      .update({ preview: content, updated_at: now })
      .eq("id", conversationId);

    throwIfError(conversationError);
    return ensureData(data, "No se pudo guardar el mensaje");
  },

  async addNote(conversationId: number, content: string, organizationId: string) {
    void organizationId;
    return mutateCrmData<Message>({
      action: "addNote",
      conversationId,
      content,
    });
  },

  async updateConversation(
    conversationId: number,
    organizationId: string,
    payload: Partial<
      Pick<
        Conversation,
        "human_mode" | "status" | "label_ids" | "agent_id" | "agent_control"
      >
    >
  ) {
    void organizationId;
    await mutateCrmData({ action: "updateConversation", conversationId, payload });
  },

  async takeControlConversation(
    conversationId: number,
    organizationId: string,
    agent: Pick<Agent, "id" | "name">,
  ) {
    void organizationId;
    void agent;
    const data = await mutateCrmData<Conversation>({
      action: "takeControl",
      conversationId,
    });

    return {
      ...data,
      label_ids: data.label_ids || [],
      human_mode: Boolean(data.human_mode),
    } as Conversation;
  },

  async resolveTicketForClient(clientId: number | null, organizationId: string) {
    if (!clientId) return;

    const { data } = await db()
      .from("tickets")
      .select("*")
      .eq("client_id", clientId)
      .eq("organization_id", organizationId)
      .neq("status", "Resuelto")
      .limit(1)
      .maybeSingle<Ticket>();

    if (!data) return;

    const { error } = await db()
      .from("tickets")
      .update({ status: "Resuelto" })
      .eq("id", data.id)
      .eq("organization_id", organizationId);

    throwIfError(error);
  },

  async archiveAndResolveConversation(
    conversationId: number,
    resolvedBy: number,
  ): Promise<number> {
    const response = await fetch("/api/crm/conversations/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, resolvedBy }),
    });

    const payload = (await response.json()) as {
      historyId?: number;
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error || "No se pudo archivar la conversación");
    }

    if (!payload.historyId) {
      throw new Error("No se recibió el historial de la conversación");
    }

    return payload.historyId;
  },

  async loadConversationHistory(): Promise<ConversationHistory[]> {
    const response = await fetch("/api/crm/conversations/history");

    const payload = (await response.json()) as {
      entries?: ConversationHistory[];
      error?: string;
    };

    if (!response.ok) {
      throw new Error(
        payload.error || "No se pudo cargar el historial de conversaciones",
      );
    }

    return payload.entries ?? [];
  },

  async createClient(
    input: CreateClientInput,
    existingClients: number,
    organizationId: string,
  ) {
    void existingClients;
    void organizationId;
    return mutateCrmData<Client>({ action: "createClient", ...input });
  },

  async getClientById(clientId: number, organizationId: string) {
    void organizationId;
    const response = await fetch(
      `/api/crm/data?resource=client&clientId=${clientId}`,
      { cache: "no-store" },
    );
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No se pudo cargar");
    return payload.data as Client | null;
  },

  async createTicket(input: CreateTicketInput, organizationId: string) {
    void organizationId;
    return mutateCrmData<Ticket>({ action: "createTicket", ...input });
  },

  async createLabel(input: CreateLabelInput, organizationId: string) {
    void organizationId;
    return mutateCrmData<Label>({ action: "createLabel", ...input });
  },

  async createQuickReply(
    input: CreateQuickReplyInput,
    createdBy: number,
    organizationId: string,
  ) {
    const title = input.title.trim();
    const content = input.content.trim();
    if (!title) throw new Error("El título es requerido");
    if (!content) throw new Error("El contenido es requerido");

    const shortcut = normalizeShortcut(input.shortcut);
    const category = input.category?.trim() || null;

    void createdBy;
    void organizationId;
    return mutateCrmData<QuickReply>({
      action: "createQuickReply",
      title,
      content,
      shortcut,
      category,
    });
  },

  async updateQuickReply(
    id: number,
    input: UpdateQuickReplyInput,
    organizationId: string,
  ) {
    const title = input.title.trim();
    const content = input.content.trim();
    if (!title) throw new Error("El título es requerido");
    if (!content) throw new Error("El contenido es requerido");

    const shortcut = normalizeShortcut(input.shortcut);
    const category = input.category?.trim() || null;

    const payload = {
      title,
      content,
      shortcut,
      category,
      ...(typeof input.is_active === "boolean"
        ? { is_active: input.is_active }
        : {}),
      updated_at: new Date().toISOString(),
    };

    void organizationId;
    return mutateCrmData<QuickReply>({
      action: "updateQuickReply",
      id,
      title,
      content,
      shortcut,
      category,
      ...(typeof input.is_active === "boolean"
        ? { is_active: input.is_active }
        : {}),
    });
  },

  async toggleQuickReplyStatus(
    id: number,
    isActive: boolean,
    organizationId: string,
  ) {
    void organizationId;
    return mutateCrmData<QuickReply>({
      action: "toggleQuickReply",
      id,
      isActive,
    });
  },

  async deleteQuickReply(id: number, organizationId: string) {
    void organizationId;
    await mutateCrmData({ action: "deleteQuickReply", id });
  },

  async deleteLabel(
    labelId: number,
    conversations: Conversation[],
    organizationId: string,
  ) {
    await mutateCrmData({ action: "deleteLabel", id: labelId });

    const affected = conversations.filter((conversation) =>
      conversation.label_ids.includes(labelId)
    );

    await Promise.all(
      affected.map((conversation) =>
        this.updateConversation(conversation.id, organizationId, {
          label_ids: conversation.label_ids.filter((id) => id !== labelId),
        })
      )
    );
  },

  async upsertAgent(
    input: UpsertAgentInput,
    _existingAgents: number,
    _organizationId: string,
  ) {
    const response = await fetch("/api/crm/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "No se pudo guardar el asesor");
    }
  },

  async deleteAgent(agentId: number) {
    const response = await fetch(`/api/crm/agents?id=${agentId}`, {
      method: "DELETE",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "No se pudo desvincular el asesor");
    }
    return payload;
  },
};
