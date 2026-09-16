"use client";

import { Trash2 } from "lucide-react";
import { CrmButton } from "../shared/crm-button";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import type { Conversation, Label } from "../../_lib/types";
import { LabelChip } from "../shared/label-chip";

interface LabelsListProps {
  labels: Label[];
  conversations: Conversation[];
  onDeleteLabel: (label: Label) => Promise<void>;
}

export const LabelsList = ({ labels, conversations, onDeleteLabel }: LabelsListProps) => (
  <div className={`max-w-3xl overflow-hidden rounded-2xl ${CRM_SURFACES.elevated}`}>
    <div className={`border-b px-5 py-4 text-sm font-semibold ${CRM_SURFACES.border} ${CRM_SURFACES.textSecondary}`}>
      Etiquetas ({labels.length})
    </div>
    <div className={`divide-y px-5 py-2 ${CRM_SURFACES.divider}`}>
      {labels.length ? (
        labels.map((label) => {
          const usage = conversations.filter((conversation) =>
            conversation.label_ids.includes(label.id),
          ).length;

          return (
            <div key={label.id} className="flex items-center gap-3 py-3">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: label.color }}
                aria-hidden="true"
              />
              <span className={`flex-1 text-sm ${CRM_SURFACES.textSecondary}`}>{label.name}</span>
              <span className={`text-xs ${CRM_SURFACES.textMuted}`}>{usage} conv.</span>
              <LabelChip label={label} />
              <CrmButton
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onDeleteLabel(label)}
                className={`size-8 ${CRM_SURFACES.textMuted} hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/60 dark:hover:text-red-100`}
                aria-label={`Eliminar ${label.name}`}>
                <Trash2 className="size-4" aria-hidden="true" />
              </CrmButton>
            </div>
          );
        })
      ) : (
        <div className={`py-8 text-sm ${CRM_SURFACES.textMuted}`}>Sin etiquetas.</div>
      )}
    </div>
  </div>
);
