import type { Agent } from "./types";

export const canAssignConversation = (agent: Agent) =>
  agent.status !== "inactive";
