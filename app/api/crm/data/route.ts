import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_AI_MODEL } from "@/app/crm/_lib/ai-models";
import { DEFAULT_BOT_ENGINE, normalizeBotEngine } from "@/app/crm/_lib/bot-engine";
import { CRM_COLORS } from "@/app/crm/_lib/constants";
import { createTicketId, getInitials } from "@/app/crm/_lib/formatters";
import { parseCrmAccentId } from "@/app/crm/_lib/crm-accents";
import {
  DEFAULT_AFTER_HOURS_PAYMENTS,
  DEFAULT_OFFICE_HOURS,
  parseAfterHoursPaymentsConfig,
  parseOfficeHoursConfig,
} from "@/app/crm/_lib/office-hours";
import { parseAiRecoveryMessages } from "@/app/crm/_lib/ai-recovery-messages";
import {
  canManageOrganization,
  getCrmAuthContext,
} from "../_lib/crm-auth-context";
import { getSupabaseAdmin } from "../_lib/supabase-admin";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("updateAgentStatus"),
    id: z.number().int().positive(),
    status: z.enum(["online", "busy", "offline", "inactive"]),
  }),
  z.object({
    action: z.literal("clearUnread"),
    conversationId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("addNote"),
    conversationId: z.number().int().positive(),
    content: z.string().trim().min(1).max(4096),
  }),
  z.object({
    action: z.literal("updateConversation"),
    conversationId: z.number().int().positive(),
    payload: z
      .object({
        human_mode: z.boolean().optional(),
        status: z.enum(["abierto", "proceso", "resuelto"]).optional(),
        label_ids: z.array(z.number().int().positive()).optional(),
        agent_id: z.number().int().positive().nullable().optional(),
        agent_control: z.string().max(120).nullable().optional(),
      })
      .strict(),
  }),
  z.object({
    action: z.literal("takeControl"),
    conversationId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("createClient"),
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(7).max(30),
    plan: z.string().trim().max(120),
    zone: z.string().trim().max(120),
    account: z.enum(["Al día", "Con deuda", "Suspendido", "Prospecto"]),
  }),
  z.object({
    action: z.literal("createTicket"),
    clientId: z.number().int().positive(),
    type: z.string().trim().min(1).max(120),
    agent: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000),
  }),
  z.object({
    action: z.literal("createLabel"),
    name: z.string().trim().min(1).max(80),
    color: z.string().trim().min(1).max(40),
    bg: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal("deleteLabel"),
    id: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("createQuickReply"),
    title: z.string().trim().min(1).max(120),
    shortcut: z.string().trim().max(80).nullable(),
    content: z.string().trim().min(1).max(4096),
    category: z.string().trim().max(80).nullable(),
  }),
  z.object({
    action: z.literal("updateQuickReply"),
    id: z.number().int().positive(),
    title: z.string().trim().min(1).max(120),
    shortcut: z.string().trim().max(80).nullable(),
    content: z.string().trim().min(1).max(4096),
    category: z.string().trim().max(80).nullable(),
    is_active: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("toggleQuickReply"),
    id: z.number().int().positive(),
    isActive: z.boolean(),
  }),
  z.object({
    action: z.literal("deleteQuickReply"),
    id: z.number().int().positive(),
  }),
]);

const mapSettings = (row: Record<string, unknown> | null) => ({
  id: Number(row?.id) || 1,
  bot_engine: normalizeBotEngine(row?.bot_engine),
  ai_model: String(row?.ai_model || DEFAULT_AI_MODEL),
  ai_system_prompt:
    typeof row?.ai_system_prompt === "string" ? row.ai_system_prompt : null,
  payment_success_message:
    typeof row?.payment_success_message === "string"
      ? row.payment_success_message
      : null,
  ai_recovery_messages: parseAiRecoveryMessages(row?.ai_recovery_messages),
  office_hours: row?.office_hours
    ? parseOfficeHoursConfig(row.office_hours)
    : DEFAULT_OFFICE_HOURS,
  after_hours_payments: row?.after_hours_payments
    ? parseAfterHoursPaymentsConfig(row.after_hours_payments)
    : DEFAULT_AFTER_HOURS_PAYMENTS,
  ui_accent: parseCrmAccentId(row?.ui_accent),
  updated_at: typeof row?.updated_at === "string" ? row.updated_at : null,
  updated_by: row?.updated_by ? Number(row.updated_by) : null,
});

export const GET = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    const supabase = getSupabaseAdmin();
    const resource = request.nextUrl.searchParams.get("resource") || "bootstrap";

    if (resource === "messages") {
      const conversationId = Number(
        request.nextUrl.searchParams.get("conversationId"),
      );
      if (!Number.isInteger(conversationId) || conversationId <= 0) {
        return NextResponse.json({ error: "Conversación inválida" }, { status: 400 });
      }
      const { data: conversation } = await supabase
        .from("conversations")
        .select("agent_id")
        .eq("organization_id", context.organizationId)
        .eq("id", conversationId)
        .maybeSingle();
      if (
        !conversation ||
        (context.organizationRole === "advisor" &&
          conversation.agent_id &&
          conversation.agent_id !== context.agentId)
      ) {
        return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
      }
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("organization_id", context.organizationId)
        .eq("conversation_id", conversationId)
        .order("created_at");
      if (error) throw error;
      return NextResponse.json({ data: data || [] });
    }

    if (resource === "client") {
      const clientId = Number(request.nextUrl.searchParams.get("clientId"));
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("organization_id", context.organizationId)
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return NextResponse.json({ data });
    }

    const { data: memberships, error: membershipsError } = await supabase
      .from("organization_members")
      .select("agent_id")
      .eq("organization_id", context.organizationId)
      .eq("status", "active");
    if (membershipsError) throw membershipsError;
    const memberIds = (memberships || []).map((row) => row.agent_id);

    const [
      labels,
      clients,
      tickets,
      conversations,
      agents,
      quickReplies,
      settings,
    ] = await Promise.all([
      supabase.from("labels").select("*").eq("organization_id", context.organizationId).order("created_at"),
      supabase.from("clients").select("*").eq("organization_id", context.organizationId).order("created_at"),
      supabase.from("tickets").select("*").eq("organization_id", context.organizationId).order("created_at", { ascending: false }),
      supabase.from("conversations").select("*").eq("organization_id", context.organizationId).order("updated_at", { ascending: false }),
      supabase
        .from("agents")
        .select("id, organization_id, name, email, role, status, initials, avatar_color, avatar_bg, max_conversations, ui_accent, ui_mode, created_at, updated_at")
        .in("id", memberIds.length ? memberIds : [-1])
        .order("created_at"),
      supabase.from("quick_replies").select("*").eq("organization_id", context.organizationId).order("title"),
      supabase.from("crm_settings").select("*").eq("organization_id", context.organizationId).maybeSingle(),
    ]);
    const failed = [
      labels,
      clients,
      tickets,
      conversations,
      agents,
      quickReplies,
    ].find((result) => result.error);
    if (failed?.error) throw failed.error;

    const conversationRows = (conversations.data || []).map((row) => ({
      ...row,
      label_ids: row.label_ids || [],
      human_mode: Boolean(row.human_mode),
      bot_engine: row.bot_engine ? normalizeBotEngine(row.bot_engine) : null,
    }));
    const visibleConversations =
      context.organizationRole === "advisor"
        ? conversationRows.filter(
            (row) => !row.agent_id || row.agent_id === context.agentId,
          )
        : conversationRows;

    return NextResponse.json({
      data: {
        labels: labels.data || [],
        clients: clients.data || [],
        tickets: tickets.data || [],
        conversations: visibleConversations,
        agents: agents.data || [],
        quickReplies: quickReplies.data || [],
        settings: mapSettings(
          (settings.data as Record<string, unknown> | null) || null,
        ),
      },
    });
  } catch (error) {
    console.error("[CRM_DATA] load_failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo cargar" },
      { status: 500 },
    );
  }
};

export const POST = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }
    const input = parsed.data;
    const supabase = getSupabaseAdmin();
    const organizationId = context.organizationId;
    const canAccessConversation = async (conversationId: number) => {
      const { data } = await supabase
        .from("conversations")
        .select("agent_id")
        .eq("id", conversationId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (!data) return false;
      return (
        context.organizationRole !== "advisor" ||
        !data.agent_id ||
        data.agent_id === context.agentId
      );
    };

    if (input.action === "updateAgentStatus") {
      if (input.id !== context.agentId && !canManageOrganization(context)) {
        return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
      }
      const { data: membership } = await supabase
        .from("organization_members")
        .select("agent_id")
        .eq("organization_id", organizationId)
        .eq("agent_id", input.id)
        .eq("status", "active")
        .maybeSingle();
      if (!membership) {
        return NextResponse.json({ error: "Asesor no encontrado" }, { status: 404 });
      }
      const { error } = await supabase
        .from("agents")
        .update({ status: input.status, updated_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (input.action === "clearUnread") {
      if (!(await canAccessConversation(input.conversationId))) {
        return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
      }
      const { error } = await supabase
        .from("conversations")
        .update({ unread: 0 })
        .eq("id", input.conversationId)
        .eq("organization_id", organizationId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (input.action === "addNote") {
      if (!(await canAccessConversation(input.conversationId))) {
        return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
      }
      const { data, error } = await supabase
        .from("messages")
        .insert({
          organization_id: organizationId,
          conversation_id: input.conversationId,
          type: "note",
          content: input.content,
          sender_type: "agent",
          sent_by: String(context.agentId),
        })
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
    }

    if (input.action === "updateConversation") {
      if (!(await canAccessConversation(input.conversationId))) {
        return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
      }
      if (
        input.payload.agent_id &&
        input.payload.agent_id !== context.agentId &&
        !canManageOrganization(context)
      ) {
        return NextResponse.json(
          { error: "No puedes asignar conversaciones a otros asesores" },
          { status: 403 },
        );
      }
      if (input.payload.agent_id) {
        const { data: targetAgent } = await supabase
          .from("organization_members")
          .select("agent_id")
          .eq("agent_id", input.payload.agent_id)
          .eq("organization_id", organizationId)
          .maybeSingle();
        if (!targetAgent) {
          return NextResponse.json(
            { error: "El asesor no pertenece a la organización" },
            { status: 400 },
          );
        }
      }
      const { error } = await supabase
        .from("conversations")
        .update({ ...input.payload, updated_at: new Date().toISOString() })
        .eq("id", input.conversationId)
        .eq("organization_id", organizationId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (input.action === "takeControl") {
      if (!(await canAccessConversation(input.conversationId))) {
        return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
      }
      const { data: agent } = await supabase
        .from("agents")
        .select("name")
        .eq("id", context.agentId)
        .eq("organization_id", organizationId)
        .single();
      const { data, error } = await supabase
        .from("conversations")
        .update({
          human_mode: true,
          agent_id: context.agentId,
          agent_control: agent?.name || "Asesor",
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.conversationId)
        .eq("organization_id", organizationId)
        .or(`agent_id.is.null,agent_id.eq.${context.agentId}`)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return NextResponse.json(
          { error: "La conversación ya está asignada" },
          { status: 409 },
        );
      }
      return NextResponse.json({ data });
    }

    if (input.action === "createClient") {
      const { count } = await supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId);
      const color = CRM_COLORS[(count || 0) % CRM_COLORS.length];
      const { data, error } = await supabase
        .from("clients")
        .insert({
          organization_id: organizationId,
          name: input.name,
          phone: input.phone,
          plan: input.plan,
          zone: input.zone,
          account: input.account,
          color: color.color,
          bg: color.bg,
          initials: getInitials(input.name),
        })
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
    }

    if (input.action === "createTicket") {
      const { data, error } = await supabase
        .from("tickets")
        .insert({
          organization_id: organizationId,
          id: createTicketId(),
          client_id: input.clientId,
          type: input.type,
          status: "Abierto",
          agent: input.agent,
          description: input.description,
        })
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
    }

    if (!canManageOrganization(context)) {
      return NextResponse.json(
        { error: "Solo administradores pueden realizar esta acción" },
        { status: 403 },
      );
    }

    if (input.action === "createLabel") {
      const { action: _, ...values } = input;
      const { data, error } = await supabase
        .from("labels")
        .insert({ ...values, organization_id: organizationId })
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
    }
    if (input.action === "deleteLabel") {
      const { error } = await supabase
        .from("labels")
        .delete()
        .eq("id", input.id)
        .eq("organization_id", organizationId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }
    if (input.action === "createQuickReply") {
      const { action: _, ...values } = input;
      const { data, error } = await supabase
        .from("quick_replies")
        .insert({
          ...values,
          organization_id: organizationId,
          created_by: context.agentId,
          is_active: true,
        })
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
    }
    if (input.action === "updateQuickReply") {
      const { action: _, id, ...values } = input;
      const { data, error } = await supabase
        .from("quick_replies")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("organization_id", organizationId)
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
    }
    if (input.action === "toggleQuickReply") {
      const { data, error } = await supabase
        .from("quick_replies")
        .update({
          is_active: input.isActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .eq("organization_id", organizationId)
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ data });
    }
    if (input.action === "deleteQuickReply") {
      const { error } = await supabase
        .from("quick_replies")
        .delete()
        .eq("id", input.id)
        .eq("organization_id", organizationId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
  } catch (error) {
    console.error("[CRM_DATA] mutation_failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar" },
      { status: 500 },
    );
  }
};
