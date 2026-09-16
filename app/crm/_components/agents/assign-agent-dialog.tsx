"use client";

import { useMemo } from "react";
import { CrmButton } from "../shared/crm-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getAgentActiveConversationCount,
  getAssignableAgents,
  sortAgentsForAssignment,
} from "../../_lib/agent-utils";
import type { Agent, Conversation } from "../../_lib/types";
import { CRM_DIALOG, CRM_FOCUS_RING, CRM_SURFACES } from "../../_lib/crm-theme";
import { AvatarInitials } from "../shared/avatar-initials";
import { StatusBadge } from "../shared/status-badge";

interface AssignAgentDialogProps {
  open: boolean;
  agents: Agent[];
  conversations: Conversation[];
  onOpenChange: (open: boolean) => void;
  onAssign: (agentId: number) => Promise<void>;
}

export const AssignAgentDialog = ({
  open,
  agents,
  conversations,
  onOpenChange,
  onAssign,
}: AssignAgentDialogProps) => {
  const assignableAgents = useMemo(
    () => sortAgentsForAssignment(getAssignableAgents(agents)),
    [agents],
  );

  const handleAssignAgent = async (agentId: number) => {
    await onAssign(agentId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={CRM_DIALOG}>
        <DialogHeader>
          <DialogTitle>Asignar conversación</DialogTitle>
          <DialogDescription className={CRM_SURFACES.textMuted}>
            Selecciona el agente que atenderá esta conversación. Puedes asignar
            aunque esté desconectado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {assignableAgents.length ? (
            assignableAgents.map((agent) => {
              const activeCount = getAgentActiveConversationCount(
                agent.id,
                conversations,
              );

              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => handleAssignAgent(agent.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:border-crm-accent/40 ${CRM_FOCUS_RING} ${CRM_SURFACES.card}`}>
                  <AvatarInitials
                    name={agent.name}
                    initials={agent.initials}
                    color={agent.avatar_color}
                    bg={agent.avatar_bg}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{agent.name}</p>
                    <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                      {agent.role === "admin" ? "Admin" : "Agente"} · {activeCount}{" "}
                      activas de {agent.max_conversations || 5}
                    </p>
                  </div>
                  <StatusBadge status={agent.status} />
                </button>
              );
            })
          ) : (
            <div
              className={`rounded-2xl p-4 text-sm ${CRM_SURFACES.card} ${CRM_SURFACES.textMuted}`}>
              No hay agentes registrados.
            </div>
          )}
        </div>
        <CrmButton type="button" variant="secondary" onClick={() => onOpenChange(false)}>
          Cancelar
        </CrmButton>
      </DialogContent>
    </Dialog>
  );
};
