"use client";

import { useState } from "react";
import { UserMinus } from "lucide-react";
import { CrmButton } from "../shared/crm-button";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import type { Agent, Conversation } from "../../_lib/types";
import { AvatarInitials } from "../shared/avatar-initials";
import { StatusBadge } from "../shared/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface AgentCardProps {
  agent: Agent;
  currentAgent: Agent;
  conversations: Conversation[];
  onEdit: (agent: Agent) => void;
  onToggleStatus: (agent: Agent) => Promise<void>;
  onDelete?: (agent: Agent) => Promise<void>;
}

export const AgentCard = ({
  agent,
  currentAgent,
  conversations,
  onEdit,
  onToggleStatus,
  onDelete,
}: AgentCardProps) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const isAdmin = currentAgent.role === "admin";
  const isSelf = agent.id === currentAgent.id;

  const activeCount = conversations.filter(
    (conversation) =>
      conversation.agent_id === agent.id && conversation.status !== "resuelto",
  ).length;

  const handleDeleteConfirm = async () => {
    if (!onDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(agent);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <article className={`rounded-2xl p-4.5 ${CRM_SURFACES.card}`}>
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
            {isSelf ? (
              <span className="rounded-md bg-crm-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-crm-accent">
                Tú
              </span>
            ) : null}
            <span
              className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                agent.department === "cobranza"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : agent.department === "general"
                    ? "border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400"
                    : "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400"
              }`}>
              {agent.department === "cobranza"
                ? "💳 Cobranza"
                : agent.department === "general"
                  ? "🌐 General"
                  : "🛠️ Soporte"}
            </span>
          </div>
          <p className={`mt-1 truncate text-xs ${CRM_SURFACES.textMuted}`}>
            {agent.role === "admin" ? "Administrador de oficina" : "Asesor de atención"} · {agent.email}
          </p>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border/30 pt-3 text-xs">
        <span className={CRM_SURFACES.textMuted}>
          Conversaciones activas:{" "}
          <strong className={CRM_SURFACES.textPrimary}>{activeCount}</strong> / {agent.max_conversations || 5}
        </span>
        <span className={`text-[11px] ${agent.status === "inactive" ? "text-destructive" : "text-muted-foreground"}`}>
          {agent.status === "inactive" ? "Acceso suspendido" : "Miembro activo"}
        </span>
      </div>

      {isAdmin && !isSelf ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 pt-1">
          <CrmButton type="button" variant="secondary" size="sm" onClick={() => onEdit(agent)}>
            Editar
          </CrmButton>

          <CrmButton
            type="button"
            variant={agent.status === "inactive" ? "secondary" : "danger"}
            size="sm"
            onClick={() => onToggleStatus(agent)}>
            {agent.status === "inactive" ? "Reactivar" : "Suspender"}
          </CrmButton>

          {onDelete ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <CrmButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <UserMinus className="mr-1 size-3.5" />
                  Desvincular
                </CrmButton>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Desvincular asesor de la organización?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se removerá a <strong>{agent.name}</strong> ({agent.email}) de esta oficina.
                    Sus conversaciones activas quedarán liberadas para otros asesores y se preservará todo el historial de tickets y mensajes.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteConfirm}
                    disabled={isDeleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {isDeleting ? "Desvinculando…" : "Sí, desvincular"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      ) : null}
    </article>
  );
};
