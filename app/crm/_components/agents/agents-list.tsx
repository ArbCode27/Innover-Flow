"use client";

import type { Agent, Conversation } from "../../_lib/types";
import { AgentCard } from "./agent-card";

interface AgentsListProps {
  agents: Agent[];
  currentAgent: Agent;
  conversations: Conversation[];
  onEdit: (agent: Agent) => void;
  onToggleStatus: (agent: Agent) => Promise<void>;
}

export const AgentsList = ({
  agents,
  currentAgent,
  conversations,
  onEdit,
  onToggleStatus,
}: AgentsListProps) => (
  <div className="grid gap-3 xl:grid-cols-2">
    {agents.map((agent) => (
      <AgentCard
        key={agent.id}
        agent={agent}
        currentAgent={currentAgent}
        conversations={conversations}
        onEdit={onEdit}
        onToggleStatus={onToggleStatus}
      />
    ))}
  </div>
);
