"use client";

import { CrmButton } from "../shared/crm-button";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import type { Agent, Conversation } from "../../_lib/types";
import { AvatarInitials } from "../shared/avatar-initials";
import { StatusBadge } from "../shared/status-badge";

interface AgentCardProps {
  agent: Agent;
  currentAgent: Agent;
  conversations: Conversation[];
  onEdit: (agent: Agent) => void;
  onToggleStatus: (agent: Agent) => Promise<void>;
}

export const AgentCard = ({
  agent,
  currentAgent,
  conversations,
  onEdit,
  onToggleStatus,
}: AgentCardProps) => {
  const isAdmin = currentAgent.role === "admin";
  const activeCount = conversations.filter(
    (conversation) =>
      conversation.agent_id === agent.id && conversation.status !== "resuelto",
  ).length;

  return (
    <article className={`rounded-2xl p-4 ${CRM_SURFACES.card}`}>
      <div className="flex items-start gap-3">
        <AvatarInitials
          name={agent.name}
          initials={agent.initials}
          color={agent.avatar_color}
          bg={agent.avatar_bg}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={`truncate text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
              {agent.name}
            </h3>
            {agent.id === currentAgent.id ? (
              <span className="text-[10px] text-crm-accent">(tú)</span>
            ) : null}
          </div>
          <p className={`mt-1 truncate text-xs ${CRM_SURFACES.textMuted}`}>
            {agent.role === "admin" ? "Administrador" : "Agente básico"} · {agent.email}
          </p>
        </div>
        <StatusBadge status={agent.status} />
      </div>
      <p className={`mt-4 text-xs ${CRM_SURFACES.textMuted}`}>
        Conversaciones activas:{" "}
        <span className={`font-semibold ${CRM_SURFACES.textPrimary}`}>{activeCount}</span>/
        {agent.max_conversations || 5}
      </p>
      {isAdmin && agent.id !== currentAgent.id ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <CrmButton type="button" variant="secondary" size="sm" onClick={() => onEdit(agent)}>
            Editar
          </CrmButton>
          <CrmButton
            type="button"
            variant="danger"
            size="sm"
            onClick={() => onToggleStatus(agent)}>
            {agent.status === "inactive" ? "Activar" : "Desactivar"}
          </CrmButton>
        </div>
      ) : null}
    </article>
  );
};
