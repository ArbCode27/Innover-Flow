"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import type { Label } from "../../_lib/types";
import { CrmFilterChip } from "../shared/crm-filter-chip";
import { ConversationLabelFilter } from "./conversation-label-filter";

interface MyConversationsFiltersProps {
  searchTerm: string;
  includeResolved: boolean;
  labels: Label[];
  selectedLabelId: number | null;
  onSearchChange: (value: string) => void;
  onIncludeResolvedChange: (value: boolean) => void;
  onLabelChange: (value: number | null) => void;
}

export const MyConversationsFilters = ({
  searchTerm,
  includeResolved,
  labels,
  selectedLabelId,
  onSearchChange,
  onIncludeResolvedChange,
  onLabelChange,
}: MyConversationsFiltersProps) => (
  <div className={`space-y-3 border-b p-4 ${CRM_SURFACES.border}`}>
    <div>
      <label htmlFor="crm-my-conversation-search" className="sr-only">
        Buscar en mis asignadas
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500 dark:text-slate-500"
          aria-hidden="true"
        />
        <Input
          id="crm-my-conversation-search"
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar..."
          className={cn(
            "pl-9",
            CRM_SURFACES.border,
            CRM_SURFACES.input,
            CRM_SURFACES.textPrimary,
            CRM_SURFACES.placeholder,
          )}
        />
      </div>
    </div>

    <div className="crm-scrollbar flex gap-2 overflow-x-auto pb-1">
      <CrmFilterChip
        label="Activas"
        isActive={!includeResolved}
        onClick={() => onIncludeResolvedChange(false)}
      />
      <CrmFilterChip
        label="Incluir resueltas"
        isActive={includeResolved}
        onClick={() => onIncludeResolvedChange(true)}
      />
    </div>

    <ConversationLabelFilter
      labels={labels}
      selectedLabelId={selectedLabelId}
      onLabelChange={onLabelChange}
    />
  </div>
);
