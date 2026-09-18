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
        .select("agent_id, agents(*)")
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

    const rawAgents = (agentsResult.data || [])
      .map((membership) => membership.agents)
      .flat()
      .filter((agent): agent is Record<string, unknown> => Boolean(agent && (agent as Record<string, unknown>).status !== "inactive"));

    const agents = rawAgents.map((agent) => ({
      id: Number(agent.id),
      name: String(agent.name || "Asesor"),
      status: String(agent.status || "offline"),
      department: (String(agent.department || "soporte") as "cobranza" | "soporte" | "general"),
      max_conversations: Number(agent.max_conversations) || 10,
    }));

    const allConversations = conversationsResult.data || [];
    const allHistory = historyResult.data || [];
    const allPayments = paymentsResult.data || [];
    const allTickets = ticketsResult.data || [];
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
      const activeCount = assigned.filter((row) => row.status !== "resuelto").length;
      const resolvedCount = resolved.length;
      const totalChats = activeCount + resolvedCount;
      const resolutionRate = totalChats > 0 ? Math.round((resolvedCount / totalChats) * 100) : 0;
      const workloadPercentage =
        agent.max_conversations > 0
          ? Math.min(100, Math.round((activeCount / agent.max_conversations) * 100))
          : 0;

      const agentResponseTimes = events
        .filter(
          (event) =>
            event.agent_id === agent.id && event.event_type === "first_response",
        )
        .map((event) =>
          Number((event.metadata as Record<string, unknown>)?.duration_ms),
        )
        .filter((value) => Number.isFinite(value) && value >= 0);
      const avgFirstResponse = average(agentResponseTimes);

      const agentResolutions = resolved
        .map((row) => {
          const start = Date.parse(row.first_message_at || "");
          const end = Date.parse(row.resolved_at || row.last_message_at || "");
          return Number.isFinite(start) && Number.isFinite(end) && end >= start
            ? end - start
            : Number.NaN;
        })
        .filter(Number.isFinite);
      const avgResolutionTime = average(agentResolutions);

      const agentNameNorm = agent.name.toLowerCase().trim();
      const agentTickets = allTickets.filter(
        (t) => t.agent && String(t.agent).toLowerCase().trim() === agentNameNorm,
      );
      const assignedTickets = agentTickets.length;
      const resolvedTickets = agentTickets.filter(
        (t) => String(t.status).toLowerCase() === "resuelto",
      ).length;
      const ticketResolutionRate =
        assignedTickets > 0 ? Math.round((resolvedTickets / assignedTickets) * 100) : 0;

      const agentPayments = allPayments.filter(
        (row) => row.submitted_by_agent_id === agent.id,
      );
      const approvedPayments = agentPayments.filter((row) => row.status === "APROBADO").length;
      const rejectedPayments = agentPayments.filter((row) => row.status === "RECHAZADO").length;
      const processedPayments = approvedPayments + rejectedPayments;
      const approvalRate =
        processedPayments > 0 ? Math.round((approvedPayments / processedPayments) * 100) : 0;
      const approvedPaymentAmount = agentPayments
        .filter((row) => row.status === "APROBADO")
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);

      // Score de Productividad (0 - 100)
      let score = 0;
      const hasActivity =
        activeCount > 0 ||
        resolvedCount > 0 ||
        assignedTickets > 0 ||
        processedPayments > 0 ||
        avgFirstResponse !== null;

      if (!hasActivity) {
        score = 0;
      } else if (agent.department === "cobranza") {
        const volumeScore = Math.min(45, approvedPayments * 8 + (approvedPaymentAmount > 0 ? 10 : 0));
        const accuracyScore = Math.round(approvalRate * 0.35);
        const activityScore = Math.min(20, (activeCount + resolvedCount) * 4);
        score = Math.min(100, volumeScore + accuracyScore + activityScore);
      } else if (agent.department === "soporte") {
        const volumeScore = Math.min(45, resolvedCount * 5 + resolvedTickets * 6);
        const efficiencyScore = Math.round(resolutionRate * 0.25);
        let speedScore = 0;
        if (avgFirstResponse !== null) {
          if (avgFirstResponse < 120_000) speedScore = 30; // < 2 min
          else if (avgFirstResponse < 300_000) speedScore = 24; // < 5 min
          else if (avgFirstResponse < 600_000) speedScore = 18; // < 10 min
          else if (avgFirstResponse < 1_800_000) speedScore = 10; // < 30 min
          else speedScore = 5;
        }
        score = Math.min(100, volumeScore + efficiencyScore + speedScore);
      } else {
        const supportVol = Math.min(25, resolvedCount * 3 + resolvedTickets * 4);
        const billingVol = Math.min(25, approvedPayments * 5);
        const speedAndAcc = Math.round(resolutionRate * 0.15 + approvalRate * 0.15);
        const activeBonus = Math.min(20, (activeCount + resolvedCount) * 3);
        score = Math.min(100, supportVol + billingVol + speedAndAcc + activeBonus);
      }

      return {
        agent_id: agent.id,
        name: agent.name,
        status: agent.status,
        department: agent.department,
        max_conversations: agent.max_conversations,

        // Carga
        active_conversations: activeCount,
        workload_percentage: workloadPercentage,

        // Soporte
        resolved_conversations: resolvedCount,
        resolution_rate: resolutionRate,
        average_first_response_ms: avgFirstResponse,
        average_resolution_ms: avgResolutionTime,
        assigned_tickets: assignedTickets,
        resolved_tickets: resolvedTickets,
        ticket_resolution_rate: ticketResolutionRate,

        // Cobranza
        processed_payments: processedPayments,
        approved_payments: approvedPayments,
        rejected_payments: rejectedPayments,
        approval_rate: approvalRate,
        approved_payment_amount: approvedPaymentAmount,

        // Score
        productivity_score: Math.max(0, Math.min(100, score)),
      };
    });

    agentMetrics.sort((a, b) => b.productivity_score - a.productivity_score);

    const supportMetrics = agentMetrics.filter(
      (a) => a.department === "soporte" || a.department === "general",
    );
    const billingMetrics = agentMetrics.filter(
      (a) => a.department === "cobranza" || a.department === "general",
    );

    const totalBillingProcessed = billingMetrics.reduce((sum, a) => sum + a.processed_payments, 0);
    const totalBillingApproved = billingMetrics.reduce((sum, a) => sum + a.approved_payments, 0);

    const departmentStats = {
      support: {
        total_agents: agents.filter((a) => a.department === "soporte").length,
        online_agents: agents.filter((a) => a.department === "soporte" && a.status === "online").length,
        resolved_conversations: supportMetrics.reduce((sum, a) => sum + a.resolved_conversations, 0),
        resolved_tickets: supportMetrics.reduce((sum, a) => sum + a.resolved_tickets, 0),
        average_first_response_ms: average(
          agentMetrics
            .filter((a) => a.department === "soporte" && a.average_first_response_ms !== null)
            .map((a) => a.average_first_response_ms as number),
        ),
        average_resolution_ms: average(
          agentMetrics
            .filter((a) => a.department === "soporte" && a.average_resolution_ms !== null)
            .map((a) => a.average_resolution_ms as number),
        ),
      },
      billing: {
        total_agents: agents.filter((a) => a.department === "cobranza").length,
        online_agents: agents.filter((a) => a.department === "cobranza" && a.status === "online").length,
        processed_payments: totalBillingProcessed,
        approved_payments: totalBillingApproved,
        rejected_payments: billingMetrics.reduce((sum, a) => sum + a.rejected_payments, 0),
        approved_payment_amount: billingMetrics.reduce((sum, a) => sum + a.approved_payment_amount, 0),
        approval_rate:
          totalBillingProcessed > 0
            ? Math.round((totalBillingApproved / totalBillingProcessed) * 100)
            : 0,
      },
    };

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
        department_stats: departmentStats,
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
