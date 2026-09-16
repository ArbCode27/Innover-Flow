"use client";

import { useMemo } from "react";
import type { Agent, Conversation } from "../_lib/types";

export const useAgents = (agents: Agent[], conversations: Conversation[]) => {
  const activeCounts = useMemo(
    () =>
      new Map(
        agents.map((agent) => [
          agent.id,
          conversations.filter(
            (conversation) =>
              conversation.agent_id === agent.id && conversation.status !== "resuelto"
          ).length,
        ])
      ),
    [agents, conversations]
  );

  return { activeCounts };
};
