"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { CrmButton } from "../shared/crm-button";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { isAdminRole } from "../../_lib/agent-role-utils";
import type {
  Agent,
  CreateQuickReplyInput,
  QuickReply,
  UpdateQuickReplyInput,
} from "../../_lib/types";
import { QuickRepliesList } from "./quick-replies-list";
import { QuickReplyFormDialog } from "./quick-reply-form-dialog";

interface QuickRepliesViewProps {
  currentAgent: Agent;
  quickReplies: QuickReply[];
  onCreateQuickReply: (input: CreateQuickReplyInput) => Promise<void>;
  onUpdateQuickReply: (quickReplyId: number, input: UpdateQuickReplyInput) => Promise<void>;
  onToggleQuickReplyStatus: (quickReply: QuickReply) => Promise<void>;
  onDeleteQuickReply: (quickReply: QuickReply) => Promise<void>;
}

export const QuickRepliesView = ({
  currentAgent,
  quickReplies,
  onCreateQuickReply,
  onUpdateQuickReply,
  onToggleQuickReplyStatus,
  onDeleteQuickReply,
}: QuickRepliesViewProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingQuickReply, setEditingQuickReply] = useState<QuickReply | null>(null);

  const sortedQuickReplies = useMemo(
    () =>
      [...quickReplies].sort((left, right) =>
        left.title.localeCompare(right.title, "es"),
      ),
    [quickReplies],
  );

  const isAdmin = isAdminRole(currentAgent.role);

  const handleCreate = () => {
    setEditingQuickReply(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (quickReply: QuickReply) => {
    setEditingQuickReply(quickReply);
    setIsDialogOpen(true);
  };

  return (
    <div className={`crm-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-6`}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={`text-xl font-semibold md:text-2xl ${CRM_SURFACES.textPrimary}`}>
            Respuestas rápidas
          </h2>
          <p className={`text-sm ${CRM_SURFACES.textMuted}`}>
            Crea mensajes predefinidos y úsalos con el atajo / en el chat.
          </p>
        </div>
        {isAdmin ? (
          <CrmButton type="button" onClick={handleCreate} className="w-full sm:w-auto">
            <Plus className="mr-2 size-4" aria-hidden="true" />
            Nueva respuesta
          </CrmButton>
        ) : null}
      </div>

      {!isAdmin ? (
        <div className={`mb-4 rounded-2xl px-4 py-3 text-sm ${CRM_SURFACES.elevated} ${CRM_SURFACES.textMuted}`}>
          Solo los administradores pueden gestionar respuestas rápidas. Como asesor
          puedes usarlas desde el chat escribiendo /.
        </div>
      ) : null}

      <QuickRepliesList
        currentAgent={currentAgent}
        quickReplies={sortedQuickReplies}
        onEdit={handleEdit}
        onToggleStatus={onToggleQuickReplyStatus}
        onDelete={onDeleteQuickReply}
      />

      {isAdmin ? (
        <QuickReplyFormDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          editingQuickReply={editingQuickReply}
          onCreateQuickReply={onCreateQuickReply}
          onUpdateQuickReply={onUpdateQuickReply}
        />
      ) : null}
    </div>
  );
};
