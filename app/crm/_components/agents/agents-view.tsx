"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { CrmButton } from "../shared/crm-button";
import type { Agent, Conversation, UpsertAgentInput } from "../../_lib/types";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { AgentFormDialog } from "./agent-form-dialog";
import { AgentsList } from "./agents-list";

interface AgentsViewProps {
  currentAgent: Agent;
  agents: Agent[];
  conversations: Conversation[];
  onSaveAgent: (input: UpsertAgentInput) => Promise<void>;
  onToggleAgentStatus: (agent: Agent) => Promise<void>;
}

export const AgentsView = ({
  currentAgent,
  agents,
  conversations,
  onSaveAgent,
  onToggleAgentStatus,
}: AgentsViewProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  const handleNewAgent = () => {
    setEditingAgent(null);
    setIsDialogOpen(true);
  };

  const handleEditAgent = (agent: Agent) => {
    setEditingAgent(agent);
    setIsDialogOpen(true);
  };

  return (
    <div className={`crm-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-6`}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={`text-xl font-semibold md:text-2xl ${CRM_SURFACES.textPrimary}`}>Agentes</h2>
          <p className={`text-sm ${CRM_SURFACES.textMuted}`}>Gestión del equipo</p>
        </div>
        {currentAgent.role === "admin" ? (
          <CrmButton type="button" onClick={handleNewAgent} className="w-full sm:w-auto">
            <Plus className="mr-2 size-4" aria-hidden="true" />
            Nuevo agente
          </CrmButton>
        ) : null}
      </div>
      <AgentsList
        agents={agents}
        currentAgent={currentAgent}
        conversations={conversations}
        onEdit={handleEditAgent}
        onToggleStatus={onToggleAgentStatus}
      />
      <AgentFormDialog
        open={isDialogOpen}
        editingAgent={editingAgent}
        onOpenChange={setIsDialogOpen}
        onSaveAgent={onSaveAgent}
      />
    </div>
  );
};
