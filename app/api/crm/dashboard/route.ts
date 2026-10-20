import { NextRequest, NextResponse } from "next/server";
import {
  canViewOrganizationMetrics,
  CrmAuthError,
  getCrmAuthContext,
} from "../_lib/crm-auth-context";
import { getSupabaseAdmin } from "../_lib/supabase-admin";
import {
  assignRoleRanks,
  calculateFieldScore,
  calculateOfficeScore,
  recurrenceRatePercent,
  sortTeamByScoreDesc,
  type FieldTeamRow,
  type OfficeTeamRow,
  type TeamRow,
} from "@/lib/scoring";
import {
  countAssignedInPeriod,
  countRecurrences72h,
  countResolvedInPeriod,
  departmentSlaRatio,
  slaComplianceRatio,
  type DerivedTicket,
} from "@/lib/dashboard-derived-metrics";

const DAY_MS = 86_400_000;
const RECURRENCE_LOOKBACK_MS = 72 * 60 * 60 * 1000;

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
  return { from: from.toISOString(), to: to.toISOString(), fromMs: from.getTime(), toMs: to.getTime() };
};

const average = (values: number[]) => {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const msToMinutes = (milliseconds: number) => milliseconds / 60_000;

const uniqueById = <T extends { id: string }>(rows: T[]) => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
};

export const GET = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    const { from, to, fromMs, toMs } = parseDateRange(request);
    const supabase = getSupabaseAdmin();
    const canViewTeam = canViewOrganizationMetrics(context);
    const lookback = new Date(fromMs - RECURRENCE_LOOKBACK_MS).toISOString();

    const [
      agentsResult,
      conversationsResult,
      historyResult,
      paymentsResult,
      eventsResult,
      techniciansResult,
      fieldTicketsCreatedResult,
      fieldTicketsClosedResult,
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
      supabase
        .from("technicians")
        .select("id, name, source_employee_id")
        .eq("organization_id", context.organizationId),
      supabase
        .from("field_tickets")
        .select(
          "id, crm_client_id, conversation_id, employee_id, status, created_at, closed_at, window_end",
        )
        .eq("organization_id", context.organizationId)
        .gte("created_at", lookback)
        .lte("created_at", to),
      supabase
        .from("field_tickets")
        .select(
          "id, crm_client_id, conversation_id, employee_id, status, created_at, closed_at, window_end",
        )
        .eq("organization_id", context.organizationId)
        .gte("closed_at", from)
        .lte("closed_at", to),
    ]);

    const requiredError = [agentsResult, conversationsResult, historyResult, paymentsResult].find(
      (result) => result.error,
    )?.error;
    if (requiredError) throw requiredError;

    if (techniciansResult.error) {
      console.warn("[CRM_DASHBOARD] technicians_unavailable", techniciansResult.error);
    }
    if (fieldTicketsCreatedResult.error || fieldTicketsClosedResult.error) {
      console.warn(
        "[CRM_DASHBOARD] field_tickets_unavailable",
        fieldTicketsCreatedResult.error || fieldTicketsClosedResult.error,
      );
    }

    const rawAgents = (agentsResult.data || [])
      .map((membership) => membership.agents)
      .flat()
      .filter(
        (agent): agent is Record<string, unknown> =>
          Boolean(agent && (agent as Record<string, unknown>).status !== "inactive"),
      );

    const agents = rawAgents.map((agent) => ({
      id: Number(agent.id),
      name: String(agent.name || "Asesor"),
      status: String(agent.status || "offline"),
    }));

    const allConversations = conversationsResult.data || [];
    const allHistory = historyResult.data || [];
    const allPayments = paymentsResult.data || [];
    const events = eventsResult.error ? [] : eventsResult.data || [];
    const technicians = techniciansResult.error ? [] : techniciansResult.data || [];

    const fieldTicketRows = [
      ...(fieldTicketsCreatedResult.error ? [] : fieldTicketsCreatedResult.data || []),
      ...(fieldTicketsClosedResult.error ? [] : fieldTicketsClosedResult.data || []),
    ];

    const derivedTickets: DerivedTicket[] = uniqueById(
      fieldTicketRows.map((row) => ({
        id: String(row.id),
        crmClientId:
          row.crm_client_id === null || row.crm_client_id === undefined
            ? null
            : Number(row.crm_client_id),
        employeeId: row.employee_id ? String(row.employee_id) : null,
        status: String(row.status || ""),
        createdAt: String(row.created_at),
        closedAt: row.closed_at ? String(row.closed_at) : null,
        windowEnd: row.window_end ? String(row.window_end) : null,
      })),
    );

    const conversationIds = [
      ...new Set(
        fieldTicketRows
          .map((row) => row.conversation_id)
          .filter((id): id is number => typeof id === "number"),
      ),
    ];

    const extraConversations =
      conversationIds.length > 0
        ? await supabase
            .from("conversations")
            .select("id, agent_id")
            .eq("organization_id", context.organizationId)
            .in("id", conversationIds)
        : { data: [] as Array<{ id: number; agent_id: number | null }>, error: null };

    if (extraConversations.error) throw extraConversations.error;

    const conversationAgentById = new Map<number, number>();
    for (const row of allConversations) {
      if (row.agent_id) conversationAgentById.set(Number(row.id), Number(row.agent_id));
    }
    for (const row of extraConversations.data || []) {
      if (row.agent_id) conversationAgentById.set(Number(row.id), Number(row.agent_id));
    }

    const createdFieldTickets = fieldTicketsCreatedResult.error
      ? []
      : fieldTicketsCreatedResult.data || [];

    const ticketsCreatedByAgentId = new Map<number, number>();
    for (const row of createdFieldTickets) {
      const createdAt = Date.parse(String(row.created_at || ""));
      if (!Number.isFinite(createdAt) || createdAt < fromMs || createdAt > toMs) continue;
      const conversationId = row.conversation_id;
      if (typeof conversationId !== "number") continue;
      const agentId = conversationAgentById.get(conversationId);
      if (!agentId) continue;
      ticketsCreatedByAgentId.set(agentId, (ticketsCreatedByAgentId.get(agentId) || 0) + 1);
    }

    const conversations = canViewTeam
      ? allConversations
      : allConversations.filter((row) => row.agent_id === context.agentId);
    const history = canViewTeam
      ? allHistory
      : allHistory.filter((row) => row.agent_id === context.agentId);
    const payments = canViewTeam
      ? allPayments
      : allPayments.filter((row) => row.submitted_by_agent_id === context.agentId);

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
      .filter((value): value is number => Number.isFinite(value));

    const period = { fromMs, toMs };
    const visibleAgents = canViewTeam
      ? agents
      : agents.filter((agent) => agent.id === context.agentId);

    const officeRowsUnranked: Array<Omit<OfficeTeamRow, "rankInRole">> = visibleAgents.map(
      (agent) => {
        const chatsResolved = history.filter((row) => row.agent_id === agent.id).length;
        const ticketsCreated = ticketsCreatedByAgentId.get(agent.id) || 0;
        const paymentsValidated = payments.filter(
          (row) => row.submitted_by_agent_id === agent.id && row.status === "APROBADO",
        ).length;
        const agentResponseTimes = events
          .filter(
            (event) =>
              event.agent_id === agent.id && event.event_type === "first_response",
          )
          .map((event) =>
            Number((event.metadata as Record<string, unknown>)?.duration_ms),
          )
          .filter((value) => Number.isFinite(value) && value >= 0);
        const avgMs = average(agentResponseTimes);
        const firstResponseMinutes = avgMs === null ? 0 : msToMinutes(avgMs);
        const metrics = {
          chatsResolved,
          ticketsCreated,
          paymentsValidated,
          firstResponseMinutes,
        };
        return {
          role: "office" as const,
          id: `office:${agent.id}`,
          name: agent.name,
          status: agent.status,
          metrics,
          score: calculateOfficeScore(metrics),
        };
      },
    );

    const visibleTechnicians = canViewTeam ? technicians : [];
    const fieldRowsUnranked: Array<Omit<FieldTeamRow, "rankInRole">> =
      visibleTechnicians.map((technician) => {
        const employeeIds = new Set(
          [technician.id, technician.source_employee_id]
            .filter((value): value is string => Boolean(value))
            .map((value) => String(value)),
        );
        const ticketsAssigned = countAssignedInPeriod(employeeIds, derivedTickets, period);
        const ticketsResolved = countResolvedInPeriod(employeeIds, derivedTickets, period);
        const recurrences72h = countRecurrences72h(employeeIds, derivedTickets, period);
        const sla = slaComplianceRatio(employeeIds, derivedTickets, period);
        const metrics = {
          ticketsAssigned,
          ticketsResolved,
          recurrences72h,
          slaCompliance: sla.ratio,
        };
        return {
          role: "field" as const,
          id: `field:${technician.id}`,
          name: technician.name,
          metrics,
          score: calculateFieldScore(metrics),
          slaSampleSize: sla.sampleSize,
        };
      });

    const team: TeamRow[] = sortTeamByScoreDesc(
      assignRoleRanks([...officeRowsUnranked, ...fieldRowsUnranked]),
    );

    const ticketsCreatedInPeriod = createdFieldTickets.filter((row) => {
      const createdAt = Date.parse(String(row.created_at || ""));
      return Number.isFinite(createdAt) && createdAt >= fromMs && createdAt <= toMs;
    });
    const ticketsAssignedInPeriod = ticketsCreatedInPeriod.filter(
      (row) => row.employee_id && String(row.status) !== "cancelled",
    );
    const ticketsResolvedInPeriod = derivedTickets.filter((ticket) => {
      if (ticket.status !== "done" || !ticket.closedAt) return false;
      const closedAt = Date.parse(ticket.closedAt);
      return Number.isFinite(closedAt) && closedAt >= fromMs && closedAt <= toMs;
    });
    const recurrencesTotal = visibleTechnicians.reduce((sum, technician) => {
      const employeeIds = new Set(
        [technician.id, technician.source_employee_id]
          .filter((value): value is string => Boolean(value))
          .map((value) => String(value)),
      );
      return sum + countRecurrences72h(employeeIds, derivedTickets, period);
    }, 0);
    const deptSla = departmentSlaRatio(derivedTickets, period);
    const officeResponseMinutes = average(responseDurations.map(msToMinutes));

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
        active_conversations: conversations.filter((row) => row.status !== "resuelto").length,
        resolved_conversations: history.length,
        average_first_response_ms: average(responseDurations),
        average_resolution_ms: average(resolutionDurations),
        human_conversations: conversations.filter((row) => row.human_mode).length,
        bot_conversations: conversations.filter((row) => !row.human_mode).length,
        open_tickets: derivedTickets.filter(
          (ticket) => ticket.status === "open" || ticket.status === "scheduled",
        ).length,
        approved_payments: payments.filter((row) => row.status === "APROBADO").length,
        approved_payment_amount: payments
          .filter((row) => row.status === "APROBADO")
          .reduce((sum, row) => sum + Number(row.amount || 0), 0),
        office: {
          agentCount: visibleAgents.length,
          chatsVolume: conversations.length,
          ticketsCreated: ticketsCreatedInPeriod.length,
          paymentsValidated: payments.filter((row) => row.status === "APROBADO").length,
          tmrMinutes: officeResponseMinutes,
        },
        field: {
          technicianCount: visibleTechnicians.length,
          ticketsAssigned: ticketsAssignedInPeriod.length,
          ticketsResolved: ticketsResolvedInPeriod.length,
          recurrences72h: recurrencesTotal,
          recurrenceRate: recurrenceRatePercent(
            recurrencesTotal,
            ticketsResolvedInPeriod.length,
          ),
          slaCompliance: deptSla.ratio,
        },
      },
      daily_volume: [...dailyVolume.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, values]) => ({ date, ...values })),
      team: canViewTeam ? team : team.filter((row) => row.role === "office"),
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
