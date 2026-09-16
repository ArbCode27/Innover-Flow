"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CRM_MENU, CRM_MENU_ITEM, CRM_SURFACES } from "../../_lib/crm-theme";
import {
  CRM_KNOWN_PAYMENT_BANKS,
  CRM_PAYMENT_STATUSES,
  CRM_PAYMENT_STATUS_LABELS,
  type CrmPaymentStatus,
} from "../../_lib/payments";
import { CrmButton } from "../shared/crm-button";

export type PaymentsDateRange = {
  from: string | null;
  to: string | null;
};

interface PaymentsFiltersProps {
  searchTerm: string;
  dateRange: PaymentsDateRange;
  status: CrmPaymentStatus | "all";
  bank: string;
  banks: string[];
  onSearchChange: (value: string) => void;
  onDateRangeChange: (value: PaymentsDateRange) => void;
  onStatusChange: (value: CrmPaymentStatus | "all") => void;
  onBankChange: (value: string) => void;
  onClearFilters: () => void;
}

const selectClass = `w-full ${CRM_SURFACES.border} ${CRM_SURFACES.input} ${CRM_SURFACES.textPrimary}`;

const parseIsoDateLocal = (value: string | null): Date | undefined => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
};

const toIsoDateLocal = (date: Date) =>
  format(date, "yyyy-MM-dd");

const formatRangeLabel = (range: PaymentsDateRange) => {
  const from = parseIsoDateLocal(range.from);
  const to = parseIsoDateLocal(range.to);

  if (from && to) {
    if (range.from === range.to) {
      return format(from, "d MMM yyyy", { locale: es });
    }
    return `${format(from, "d MMM yyyy", { locale: es })} – ${format(to, "d MMM yyyy", { locale: es })}`;
  }

  if (from) {
    return `Desde ${format(from, "d MMM yyyy", { locale: es })}`;
  }

  return "Seleccionar fechas";
};

export const PaymentsFilters = ({
  searchTerm,
  dateRange,
  status,
  bank,
  banks,
  onSearchChange,
  onDateRangeChange,
  onStatusChange,
  onBankChange,
  onClearFilters,
}: PaymentsFiltersProps) => {
  const [calendarOpen, setCalendarOpen] = useState(false);

  const selectedRange = useMemo<DateRange | undefined>(() => {
    const from = parseIsoDateLocal(dateRange.from);
    const to = parseIsoDateLocal(dateRange.to);
    if (!from && !to) return undefined;
    return { from, to: to || from };
  }, [dateRange.from, dateRange.to]);

  const bankOptions = Array.from(
    new Set([...CRM_KNOWN_PAYMENT_BANKS, ...banks]),
  );

  const hasActiveFilters = Boolean(
    searchTerm ||
      dateRange.from ||
      dateRange.to ||
      status !== "EN_PROCESO" ||
      bank !== "all",
  );

  const handleStatusChange = (value: string) => {
    if (value === "all") {
      onStatusChange("all");
      return;
    }
    if (CRM_PAYMENT_STATUSES.includes(value as CrmPaymentStatus)) {
      onStatusChange(value as CrmPaymentStatus);
    }
  };

  const handleCalendarSelect = (range: DateRange | undefined) => {
    if (!range?.from) {
      onDateRangeChange({ from: null, to: null });
      return;
    }

    const from = toIsoDateLocal(range.from);
    const to = range.to ? toIsoDateLocal(range.to) : from;
    onDateRangeChange({ from, to });

    if (range.to) {
      setCalendarOpen(false);
    }
  };

  return (
    <div className={`rounded-2xl p-4 ${CRM_SURFACES.elevated}`}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <label htmlFor="crm-payments-search" className="sr-only">
            Buscar por cédula o nombre
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <Input
              id="crm-payments-search"
              value={searchTerm}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Buscar cédula o nombre..."
              className={`pl-9 ${CRM_SURFACES.border} ${CRM_SURFACES.input} ${CRM_SURFACES.textPrimary} ${CRM_SURFACES.placeholder}`}
            />
          </div>
        </div>

        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <CrmButton
              type="button"
              variant="secondary"
              className={`h-9 w-full cursor-pointer justify-start gap-2 px-3 font-normal ${CRM_SURFACES.border} ${CRM_SURFACES.input} ${CRM_SURFACES.textPrimary}`}
              aria-label="Filtrar por fecha o rango">
              <CalendarIcon
                className="size-4 shrink-0 text-crm-accent-muted-foreground"
                aria-hidden="true"
              />
              <span className="truncate">{formatRangeLabel(dateRange)}</span>
            </CrmButton>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className={`w-auto overflow-hidden rounded-2xl border p-0 shadow-lg ${CRM_SURFACES.border} ${CRM_MENU}`}
            sideOffset={8}>
            <Calendar
              mode="range"
              numberOfMonths={1}
              defaultMonth={selectedRange?.from}
              selected={selectedRange}
              onSelect={handleCalendarSelect}
              locale={es}
              disabled={{ after: new Date() }}
            />
            <div
              className={`flex items-center justify-between gap-2 border-t px-3 py-2 ${CRM_SURFACES.border}`}>
              <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                Elige un día o un rango
              </p>
              <CrmButton
                type="button"
                variant="ghost"
                size="sm"
                className="cursor-pointer text-crm-accent-muted-foreground hover:bg-crm-accent-muted hover:text-crm-accent-muted-foreground"
                disabled={!dateRange.from && !dateRange.to}
                onClick={() => {
                  onDateRangeChange({ from: null, to: null });
                  setCalendarOpen(false);
                }}>
                Limpiar fechas
              </CrmButton>
            </div>
          </PopoverContent>
        </Popover>

        <Select value={status} onValueChange={handleStatusChange}>
          <SelectTrigger className={selectClass} aria-label="Filtrar por estado">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent className={CRM_MENU}>
            <SelectItem value="all" className={CRM_MENU_ITEM}>
              Todos los estados
            </SelectItem>
            {CRM_PAYMENT_STATUSES.map((item) => (
              <SelectItem key={item} value={item} className={CRM_MENU_ITEM}>
                {CRM_PAYMENT_STATUS_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={bank} onValueChange={onBankChange}>
          <SelectTrigger className={selectClass} aria-label="Filtrar por banco">
            <SelectValue placeholder="Banco" />
          </SelectTrigger>
          <SelectContent className={CRM_MENU}>
            <SelectItem value="all" className={CRM_MENU_ITEM}>
              Todos los bancos
            </SelectItem>
            {bankOptions.map((item) => (
              <SelectItem key={item} value={item} className={CRM_MENU_ITEM}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasActiveFilters ? (
        <div className="mt-3 flex justify-end">
          <CrmButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearFilters}>
            <X className="mr-1 size-4" aria-hidden="true" />
            Limpiar filtros
          </CrmButton>
        </div>
      ) : null}
    </div>
  );
};

interface PaymentsPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  isLoading?: boolean;
  onPageChange: (page: number) => void;
}

export const PaymentsPagination = ({
  page,
  pageSize,
  total,
  isLoading = false,
  onPageChange,
}: PaymentsPaginationProps) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const from = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);

  if (total === 0) return null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
        Mostrando {from}–{to} de {total}
      </p>
      <div className="flex items-center gap-2">
        <CrmButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={isLoading || currentPage <= 1}
          className="cursor-pointer"
          onClick={() => onPageChange(currentPage - 1)}
          aria-label="Página anterior">
          <ChevronLeft className="size-4" aria-hidden="true" />
          Anterior
        </CrmButton>
        <span className={`min-w-24 text-center text-xs ${CRM_SURFACES.textSecondary}`}>
          Página {currentPage} de {totalPages}
        </span>
        <CrmButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={isLoading || currentPage >= totalPages}
          className="cursor-pointer"
          onClick={() => onPageChange(currentPage + 1)}
          aria-label="Página siguiente">
          Siguiente
          <ChevronRight className="size-4" aria-hidden="true" />
        </CrmButton>
      </div>
    </div>
  );
};
