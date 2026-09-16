"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CONVERSATION_FILTERS } from "../../_lib/constants";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import type { ConversationFilterCounts } from "../../_lib/conversation-filter-utils";
import type { ConversationFilter, Label } from "../../_lib/types";
import { CrmFilterChip } from "../shared/crm-filter-chip";
import { ConversationLabelFilter } from "./conversation-label-filter";

interface ConversationFiltersProps {
  searchTerm: string;
  filter: ConversationFilter;
  counts: ConversationFilterCounts;
  labels: Label[];
  selectedLabelId: number | null;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: ConversationFilter) => void;
  onLabelChange: (value: number | null) => void;
}

export const ConversationFilters = ({
  searchTerm,
  filter,
  counts,
  labels,
  selectedLabelId,
  onSearchChange,
  onFilterChange,
  onLabelChange,
}: ConversationFiltersProps) => (
  <div className={`space-y-3 border-b p-4 ${CRM_SURFACES.border}`}>
    <div>
      <label htmlFor="crm-conversation-search" className="sr-only">
        Buscar conversación
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500 dark:text-slate-500"
          aria-hidden="true"
        />
        <Input
          id="crm-conversation-search"
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar..."
          className={`rounded-full pl-9 ${CRM_SURFACES.border} ${CRM_SURFACES.input} ${CRM_SURFACES.textPrimary} ${CRM_SURFACES.placeholder}`}
        />
      </div>
    </div>

    <div className="crm-scrollbar flex gap-2 overflow-x-auto pb-1">
      {CONVERSATION_FILTERS.map((item) => (
        <CrmFilterChip
          key={item.id}
          label={item.label}
          count={counts[item.id]}
          isActive={filter === item.id}
          onClick={() => onFilterChange(item.id)}
        />
      ))}
    </div>

    <ConversationLabelFilter
      labels={labels}
      selectedLabelId={selectedLabelId}
      onLabelChange={onLabelChange}
    />
  </div>
);
