"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CRM_SURFACES } from "../../_lib/crm-theme";

interface HistoryFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
}

export const HistoryFilters = ({
  searchTerm,
  onSearchChange,
}: HistoryFiltersProps) => (
  <div className={`border-b p-4 ${CRM_SURFACES.border}`}>
    <label htmlFor="crm-history-search" className="sr-only">
      Buscar en historial
    </label>
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
        aria-hidden="true"
      />
      <Input
        id="crm-history-search"
        value={searchTerm}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Buscar cliente, teléfono o mensaje..."
        className={`pl-9 ${CRM_SURFACES.border} ${CRM_SURFACES.input} ${CRM_SURFACES.textPrimary} ${CRM_SURFACES.placeholder}`}
      />
    </div>
  </div>
);
