"use client";

import { Pencil, Power, Trash2 } from "lucide-react";
import { CrmButton } from "../shared/crm-button";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { isAdminRole } from "../../_lib/agent-role-utils";
import type { Agent, QuickReply } from "../../_lib/types";

interface QuickRepliesListProps {
  currentAgent: Agent;
  quickReplies: QuickReply[];
  onEdit: (quickReply: QuickReply) => void;
  onToggleStatus: (quickReply: QuickReply) => Promise<void>;
  onDelete: (quickReply: QuickReply) => Promise<void>;
}

export const QuickRepliesList = ({
  currentAgent,
  quickReplies,
  onEdit,
  onToggleStatus,
  onDelete,
}: QuickRepliesListProps) => {
  if (!quickReplies.length) {
    return (
      <div className={`rounded-2xl p-6 text-sm ${CRM_SURFACES.elevated} ${CRM_SURFACES.textMuted}`}>
        Aún no hay respuestas rápidas creadas.
      </div>
    );
  }

  const isAdmin = isAdminRole(currentAgent.role);

  return (
    <div className={`max-w-5xl overflow-hidden rounded-2xl ${CRM_SURFACES.elevated}`}>
      <div className={`border-b px-5 py-4 text-sm font-semibold ${CRM_SURFACES.border} ${CRM_SURFACES.textSecondary}`}>
        Respuestas rápidas ({quickReplies.length})
      </div>
      <div className={`divide-y px-5 py-2 ${CRM_SURFACES.divider}`}>
        {quickReplies.map((quickReply) => (
          <div key={quickReply.id} className="flex flex-col gap-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className={`text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
                {quickReply.title}
              </p>
              {quickReply.shortcut ? (
                <span className="rounded-md bg-crm-accent-muted px-2 py-0.5 text-xs font-medium text-crm-accent-muted-foreground">
                  /{quickReply.shortcut}
                </span>
              ) : null}
              {quickReply.category ? (
                <span className={`rounded-md px-2 py-0.5 text-xs ${CRM_SURFACES.input} ${CRM_SURFACES.textSecondary}`}>
                  {quickReply.category}
                </span>
              ) : null}
              <span
                className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                  quickReply.is_active
                    ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100"
                    : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                }`}>
                {quickReply.is_active ? "Activa" : "Inactiva"}
              </span>
            </div>

            <p className={`whitespace-pre-wrap text-sm leading-relaxed ${CRM_SURFACES.textSecondary}`}>
              {quickReply.content}
            </p>

            {isAdmin ? (
              <div className="flex flex-wrap items-center gap-2">
                <CrmButton
                  type="button"
                  variant="secondary"
                  className="h-8 px-3"
                  onClick={() => onEdit(quickReply)}>
                  <Pencil className="mr-1.5 size-3.5" aria-hidden="true" />
                  Editar
                </CrmButton>
                <CrmButton
                  type="button"
                  variant="ghost"
                  className="h-8 px-3"
                  onClick={() => onToggleStatus(quickReply)}>
                  <Power className="mr-1.5 size-3.5" aria-hidden="true" />
                  {quickReply.is_active ? "Desactivar" : "Activar"}
                </CrmButton>
                <CrmButton
                  type="button"
                  variant="ghost"
                  className="h-8 px-3 text-red-700 hover:bg-red-50 hover:text-red-800 dark:text-red-200 dark:hover:bg-red-950/40"
                  onClick={() => onDelete(quickReply)}>
                  <Trash2 className="mr-1.5 size-3.5" aria-hidden="true" />
                  Eliminar
                </CrmButton>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};
