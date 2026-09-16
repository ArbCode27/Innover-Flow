"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { CrmButton } from "../shared/crm-button";
import type { Conversation, CreateLabelInput, Label } from "../../_lib/types";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { LabelFormDialog } from "./label-form-dialog";
import { LabelsList } from "./labels-list";

interface LabelsViewProps {
  labels: Label[];
  conversations: Conversation[];
  onCreateLabel: (input: CreateLabelInput) => Promise<void>;
  onDeleteLabel: (label: Label) => Promise<void>;
}

export const LabelsView = ({
  labels,
  conversations,
  onCreateLabel,
  onDeleteLabel,
}: LabelsViewProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <div className={`crm-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-6`}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={`text-xl font-semibold md:text-2xl ${CRM_SURFACES.textPrimary}`}>Etiquetas</h2>
          <p className={`text-sm ${CRM_SURFACES.textMuted}`}>
            Organiza tus conversaciones por categoría
          </p>
        </div>
        <CrmButton type="button" onClick={() => setIsDialogOpen(true)} className="w-full sm:w-auto">
          <Plus className="mr-2 size-4" aria-hidden="true" />
          Nueva etiqueta
        </CrmButton>
      </div>
      <LabelsList labels={labels} conversations={conversations} onDeleteLabel={onDeleteLabel} />
      <LabelFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onCreateLabel={onCreateLabel}
      />
    </div>
  );
};
