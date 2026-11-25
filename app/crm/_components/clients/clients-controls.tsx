"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CRM_MENU, CRM_MENU_ITEM, CRM_SURFACES } from "../../_lib/crm-theme";
import {
  CLIENT_ACCOUNT_FILTERS,
  CLIENT_PAGE_SIZES,
  CLIENT_PLAN_NONE,
  type ClientListQuery,
} from "../../_lib/client-list";
import { CrmButton } from "../shared/crm-button";

interface ClientsControlsProps {
  query: ClientListQuery;
  plans: string[];
  hasActiveFilters: boolean;
  onQueryChange: (query: ClientListQuery) => void;
  onClear: () => void;
}

const selectClass = `w-full sm:w-44 ${CRM_SURFACES.border} ${CRM_SURFACES.input} ${CRM_SURFACES.textPrimary}`;

export const ClientsControls = ({
  query,
  plans,
  hasActiveFilters,
  onQueryChange,
  onClear,
}: ClientsControlsProps) => {
  const planOptions =
    query.plan !== "all" &&
    query.plan !== CLIENT_PLAN_NONE &&
    !plans.includes(query.plan)
      ? [query.plan, ...plans]
      : plans;

  return (
    <div className={`space-y-3 rounded-2xl p-4 ${CRM_SURFACES.elevated}`}>
      <div>
        <label
          htmlFor="crm-clients-search"
          className={`mb-1.5 block text-xs font-medium ${CRM_SURFACES.textMuted}`}
        >
          Buscar cliente
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
            aria-hidden="true"
          />
          <Input
            id="crm-clients-search"
            value={query.search}
            onChange={(event) =>
              onQueryChange({ ...query, search: event.target.value })
            }
            placeholder="Nombre, cédula, teléfono, plan o zona"
            autoComplete="off"
            className={`pl-9 pr-9 ${CRM_SURFACES.border} ${CRM_SURFACES.input} ${CRM_SURFACES.textPrimary} ${CRM_SURFACES.placeholder}`}
          />
          {query.search ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:hover:text-slate-200"
              aria-label="Borrar búsqueda"
              onClick={() => onQueryChange({ ...query, search: "" })}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={query.account}
          onValueChange={(account) =>
            onQueryChange({
              ...query,
              account: account as ClientListQuery["account"],
            })
          }
        >
          <SelectTrigger className={selectClass} aria-label="Filtrar por estado de cuenta">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent className={CRM_MENU}>
            <SelectItem value="all" className={CRM_MENU_ITEM}>
              Todos los estados
            </SelectItem>
            {CLIENT_ACCOUNT_FILTERS.map((status) => (
              <SelectItem key={status} value={status} className={CRM_MENU_ITEM}>
                {status}
              </SelectItem>
            ))}
            <SelectItem value="none" className={CRM_MENU_ITEM}>
              Sin estado
            </SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={query.app}
          onValueChange={(app) =>
            onQueryChange({ ...query, app: app as ClientListQuery["app"] })
          }
        >
          <SelectTrigger className={selectClass} aria-label="Filtrar por app móvil">
            <SelectValue placeholder="App móvil" />
          </SelectTrigger>
          <SelectContent className={CRM_MENU}>
            <SelectItem value="all" className={CRM_MENU_ITEM}>
              App: todas
            </SelectItem>
            <SelectItem value="enabled" className={CRM_MENU_ITEM}>
              App habilitada
            </SelectItem>
            <SelectItem value="disabled" className={CRM_MENU_ITEM}>
              App inactiva
            </SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={query.tickets}
          onValueChange={(tickets) =>
            onQueryChange({
              ...query,
              tickets: tickets as ClientListQuery["tickets"],
            })
          }
        >
          <SelectTrigger className={selectClass} aria-label="Filtrar por tickets">
            <SelectValue placeholder="Tickets" />
          </SelectTrigger>
          <SelectContent className={CRM_MENU}>
            <SelectItem value="all" className={CRM_MENU_ITEM}>
              Todos los tickets
            </SelectItem>
            <SelectItem value="open" className={CRM_MENU_ITEM}>
              Con tickets abiertos
            </SelectItem>
            <SelectItem value="clear" className={CRM_MENU_ITEM}>
              Sin tickets abiertos
            </SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={query.plan}
          onValueChange={(plan) => onQueryChange({ ...query, plan })}
        >
          <SelectTrigger className={`${selectClass} sm:w-52`} aria-label="Filtrar por plan">
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent className={CRM_MENU}>
            <SelectItem value="all" className={CRM_MENU_ITEM}>
              Todos los planes
            </SelectItem>
            <SelectItem value={CLIENT_PLAN_NONE} className={CRM_MENU_ITEM}>
              Sin plan
            </SelectItem>
            {planOptions.map((plan) => (
              <SelectItem key={plan} value={plan} className={CRM_MENU_ITEM}>
                {plan}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters ? (
          <CrmButton type="button" variant="ghost" size="sm" onClick={onClear}>
            <X className="mr-1 size-4" aria-hidden="true" />
            Limpiar filtros
          </CrmButton>
        ) : null}
      </div>
    </div>
  );
};

interface ClientsPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  filtered: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export const ClientsPagination = ({
  page,
  pageSize,
  total,
  filtered,
  onPageChange,
  onPageSizeChange,
}: ClientsPaginationProps) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const from = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);
  const [pageDraft, setPageDraft] = useState(String(currentPage));

  useEffect(() => {
    setPageDraft(String(currentPage));
  }, [currentPage]);

  const handleCommitPage = () => {
    const next = Number(pageDraft);
    if (!Number.isInteger(next) || next < 1) {
      setPageDraft(String(currentPage));
      return;
    }
    onPageChange(Math.min(next, totalPages));
  };

  if (total === 0) return null;

  return (
    <nav
      aria-label="Paginación de clientes"
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className={`text-xs ${CRM_SURFACES.textMuted}`} aria-live="polite">
        Mostrando {from}–{to} de {total}
        {filtered ? " filtrados" : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        >
          <SelectTrigger
            className={`h-8 w-[8.5rem] ${CRM_SURFACES.border} ${CRM_SURFACES.input} ${CRM_SURFACES.textPrimary}`}
            aria-label="Clientes por página"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={CRM_MENU}>
            {CLIENT_PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)} className={CRM_MENU_ITEM}>
                {size} por página
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <CrmButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(1)}
          aria-label="Primera página"
        >
          <ChevronsLeft className="size-4" aria-hidden="true" />
        </CrmButton>
        <CrmButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Anterior
        </CrmButton>
        <label className={`flex items-center gap-2 text-xs ${CRM_SURFACES.textSecondary}`}>
          Página
          <Input
            value={pageDraft}
            inputMode="numeric"
            aria-label="Número de página"
            className={`h-8 w-14 px-2 text-center ${CRM_SURFACES.border} ${CRM_SURFACES.input} ${CRM_SURFACES.textPrimary}`}
            onChange={(event) => setPageDraft(event.target.value.replace(/\D/g, ""))}
            onBlur={handleCommitPage}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
          de {totalPages}
        </label>
        <CrmButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label="Página siguiente"
        >
          Siguiente
          <ChevronRight className="size-4" aria-hidden="true" />
        </CrmButton>
        <CrmButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          aria-label="Última página"
        >
          <ChevronsRight className="size-4" aria-hidden="true" />
        </CrmButton>
      </div>
    </nav>
  );
};
