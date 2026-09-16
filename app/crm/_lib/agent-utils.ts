import type { Agent, AgentStatus } from "./types";

const ASSIGNMENT_STATUS_ORDER: Record<AgentStatus, number> = {
  online: 0,
  busy: 1,
  offline: 2,
  inactive: 3,
};

export const getAssignableAgents = (agents: Agent[]) =>
  agents.filter((agent) => agent.status !== "inactive");

export const sortAgentsForAssignment = (agents: Agent[]) =>
  [...agents].sort((left, right) => {
    const statusDiff =
      ASSIGNMENT_STATUS_ORDER[left.status] - ASSIGNMENT_STATUS_ORDER[right.status];

    if (statusDiff !== 0) return statusDiff;

    return left.name.localeCompare(right.name, "es");
  });

export const getAgentActiveConversationCount = (
  agentId: number,
  conversations: Array<{ agent_id: number | null; status: string }>,
) =>
  conversations.filter(
    (conversation) =>
      conversation.agent_id === agentId && conversation.status !== "resuelto",
  ).length;
