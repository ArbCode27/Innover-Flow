import { NextRequest, NextResponse } from "next/server";
import {
  canViewOrganizationMetrics,
  CrmAuthError,
  getCrmAuthContext,
} from "../_lib/crm-auth-context";
import { getSupabaseAdmin } from "../_lib/supabase-admin";

const DAY_MS = 86_400_000;

const parseDateRange = (request: NextRequest) => {
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 29 * DAY_MS);
  const fromValue = request.nextUrl.searchParams.get("from");
  const toValue = request.nextUrl.searchParams.get("to");
  const from = fromValue ? new Date(`${fromValue}T00:00:00.000Z`) : defaultFrom;
  const to = toValue ? new Date(`${toValue}T23:59:59.999Z`) : now;
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    from > to ||
    to.getTime() - from.getTime() > 366 * DAY_MS
  ) {
    throw new Error("Rango de fechas inválido");
  }
  return { from: from.toISOString(), to: to.toISOString() };
};

const average = (values: number[]) => {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

export const GET = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    const { from, to } = parseDateRange(request);
    const supabase = getSupabaseAdmin();
    const canViewTeam = canViewOrganizationMetrics(context);

    const [
      agentsResult,
      conversationsResult,
      historyResult,
      ticketsResult,
      paymentsResult,
      eventsResult,
    ] = await Promise.all([
      supabase
        .from("organization_members")
        .select("agent_id, agents(id, name, status, max_conversations)")
        .eq("organization_id", context.organizationId)
        .eq("status", "active"),
      supabase
        .from("conversations")
        .select("id, agent_id, status, human_mode, created_at, updated_at")
        .eq("organization_id", context.organizationId)
        .gte("created_at", from)
        .lte("created_at", to),
      supabase
        .from("conversation_history")
        .select("id, agent_id, resolved_at, first_message_at, last_message_at")
        .eq("organization_id", context.organizationId)
        .gte("resolved_at", from)
        .lte("resolved_at", to),
      supabase
        .from("tickets")
        .select("id, status, agent, created_at")
        .eq("organization_id", context.organizationId)
        .gte("created_at", from)
        .lte("created_at", to),
      supabase
        .from("crm_payments")
        .select("id, status, amount, submitted_by_agent_id, created_at")
        .eq("organization_id", context.organizationId)
        .gte("created_at", from)
        .lte("created_at", to),
      supabase
        .from("conversation_events")
        .select("agent_id, event_type, metadata, occurred_at")
        .eq("organization_id", context.organizationId)
        .gte("occurred_at", from)
        .lte("occurred_at", to),
    ]);

    const requiredResults = [
      agentsResult,
      conversationsResult,
      historyResult,
      ticketsResult,
      paymentsResult,
    ];
    const requiredError = requiredResults.find((result) => result.error)?.error;
    if (requiredError) throw requiredError;

    const agents = (agentsResult.data || [])
      .map((membership) => membership.agents)
      .flat()
      .filter(
        (agent): agent is {
          id: number;
          name: string;
          status: string;
          max_conversations: number | null;
        } => Boolean(agent && agent.status !== "inactive"),
      );
    const allConversations = conversationsResult.data || [];
    const allHistory = historyResult.data || [];
    const allPayments = paymentsResult.data || [];
    const events = eventsResult.error ? [] : eventsResult.data || [];

    const conversations = canViewTeam
      ? allConversations
      : allConversations.filter((row) => row.agent_id === context.agentId);
    const history = canViewTeam
      ? allHistory
      : allHistory.filter((row) => row.agent_id === context.agentId);
    const payments = canViewTeam
      ? allPayments
      : allPayments.filter(
          (row) => row.submitted_by_agent_id === context.agentId,
        );

    const responseDurations = events
      .filter((event) => event.event_type === "first_response")
      .map((event) => Number((event.metadata as Record<string, unknown>)?.duration_ms))
      .filter((value) => Number.isFinite(value) && value >= 0);
    const resolutionDurations = history
      .map((row) => {
        const start = Date.parse(row.first_message_at || "");
        const end = Date.parse(row.resolved_at || row.last_message_at || "");
        return Number.isFinite(start) && Number.isFinite(end) && end >= start
          ? end - start
          : Number.NaN;
      })
      .filter(Number.isFinite);

    const agentMetrics = agents.map((agent) => {
      const assigned = conversations.filter((row) => row.agent_id === agent.id);
      const resolved = history.filter((row) => row.agent_id === agent.id);
      const agentResponseTimes = events
        .filter(
          (event) =>
            event.agent_id === agent.id && event.event_type === "first_response",
        )
        .map((event) =>
          Number((event.metadata as Record<string, unknown>)?.duration_ms),
        )
        .filter((value) => Number.isFinite(value) && value >= 0);
      return {
        agent_id: agent.id,
        name: agent.name,
        status: agent.status,
        active_conversations: assigned.filter((row) => row.status !== "resuelto")
          .length,
        resolved_conversations: resolved.length,
        average_first_response_ms: average(agentResponseTimes),
        approved_payments: allPayments.filter(
          (row) =>
            row.submitted_by_agent_id === agent.id && row.status === "APROBADO",
        ).length,
      };
    });

    const dailyVolume = new Map<string, { received: number; resolved: number }>();
    for (const row of conversations) {
      const day = String(row.created_at || "").slice(0, 10);
      if (!day) continue;
      const current = dailyVolume.get(day) || { received: 0, resolved: 0 };
      current.received += 1;
      dailyVolume.set(day, current);
    }
    for (const row of history) {
      const day = String(row.resolved_at || "").slice(0, 10);
      if (!day) continue;
      const current = dailyVolume.get(day) || { received: 0, resolved: 0 };
      current.resolved += 1;
      dailyVolume.set(day, current);
    }

    return NextResponse.json({
      range: { from, to },
      scope: canViewTeam ? "organization" : "advisor",
      metrics: {
        received_conversations: conversations.length,
        active_conversations: conversations.filter(
          (row) => row.status !== "resuelto",
        ).length,
        resolved_conversations: history.length,
        average_first_response_ms: average(responseDurations),
        average_resolution_ms: average(resolutionDurations),
        human_conversations: conversations.filter((row) => row.human_mode).length,
        bot_conversations: conversations.filter((row) => !row.human_mode).length,
        open_tickets: (ticketsResult.data || []).filter(
          (row) => String(row.status).toLowerCase() !== "resuelto",
        ).length,
        approved_payments: payments.filter((row) => row.status === "APROBADO")
          .length,
        approved_payment_amount: payments
          .filter((row) => row.status === "APROBADO")
          .reduce((sum, row) => sum + Number(row.amount || 0), 0),
      },
      daily_volume: [...dailyVolume.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, values]) => ({ date, ...values })),
      advisors: canViewTeam ? agentMetrics : [],
    });
  } catch (error) {
    if (error instanceof CrmAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "No se pudieron cargar las métricas";
    console.error("[CRM_DASHBOARD] load_failed", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
