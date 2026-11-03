"use client";

import { useId, useMemo, useState } from "react";
import {
  Calendar,
  CheckSquare,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Info,
  Loader2,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  CrmPayment,
  CrmPaymentBankStat,
  CrmPaymentStatus,
} from "../../_lib/payments";
import {
  CRM_KNOWN_PAYMENT_BANKS,
  CRM_PAYMENT_STATUSES,
  CRM_PAYMENT_STATUS_LABELS,
  formatPaymentAmount,
  getReceptorBankMeta,
  normalizeReceptorBank,
} from "../../_lib/payments";
import {
  buildExportFilename,
  generatePaymentsCsv,
  generatePaymentsXmlSpreadsheet,
} from "../../_lib/payments-export";

interface PaymentsExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFrom?: string | null;
  initialTo?: string | null;
  initialBank?: string;
  bankStats?: CrmPaymentBankStat[];
  knownBanks?: string[];
}

const toCaracasIso = (date: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const getTodayIso = () => toCaracasIso(new Date());

const getSevenDaysAgoIso = () => {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return toCaracasIso(d);
};

const getFirstDayOfMonthIso = () => {
  const d = new Date();
  d.setDate(1);
  return toCaracasIso(d);
};

export const PaymentsExportDialog = ({
  open,
  onOpenChange,
  initialFrom,
  initialTo,
  initialBank,
  bankStats = [],
  knownBanks = [],
}: PaymentsExportDialogProps) => {
  const fromInputId = useId();
  const toInputId = useId();
  const statusSelectId = useId();

  // Lista consolidada de bancos receptores
  const availableBanks = useMemo(() => {
    const set = new Set<string>(CRM_KNOWN_PAYMENT_BANKS);
    for (const stat of bankStats) {
      if (stat.bank) set.add(stat.bank);
    }
    for (const b of knownBanks) {
      const norm = normalizeReceptorBank(b);
      if (norm) set.add(norm);
    }
    // Ordenar: canónicos primero, luego alfabético
    const canonicalOrder = ["Venezuela", "Banplus", "Bancamiga"];
    return Array.from(set).sort((a, b) => {
      const idxA = canonicalOrder.indexOf(a);
      const idxB = canonicalOrder.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [bankStats, knownBanks]);

  // Estado del formulario
  const [selectedBanks, setSelectedBanks] = useState<string[]>(() => {
    if (initialBank && initialBank !== "all") {
      const norm = normalizeReceptorBank(initialBank);
      return norm ? [norm] : availableBanks;
    }
    return availableBanks;
  });

  const [fromDate, setFromDate] = useState<string>(
    initialFrom || getTodayIso(),
  );
  const [toDate, setToDate] = useState<string>(initialTo || getTodayIso());
  const [statusFilter, setStatusFilter] = useState<CrmPaymentStatus | "all">(
    "all",
  );
  const [exportingType, setExportingType] = useState<"xls" | "csv" | null>(
    null,
  );

  // Atajos rápidos de fecha
  const handleShortcutToday = () => {
    const today = getTodayIso();
    setFromDate(today);
    setToDate(today);
  };

  const handleShortcut7Days = () => {
    setFromDate(getSevenDaysAgoIso());
    setToDate(getTodayIso());
  };

  const handleShortcutThisMonth = () => {
    setFromDate(getFirstDayOfMonthIso());
    setToDate(getTodayIso());
  };

  // Acciones de multi-selección de bancos
  const handleToggleBank = (bank: string) => {
    setSelectedBanks((current) =>
      current.includes(bank)
        ? current.filter((b) => b !== bank)
        : [...current, bank],
    );
  };

  const handleSelectAllBanks = () => {
    setSelectedBanks([...availableBanks]);
  };

  const handleClearBanks = () => {
    setSelectedBanks([]);
  };

  // Cálculo en tiempo real para el banner dinámico según bankStats
  const previewStats = useMemo(() => {
    if (selectedBanks.length === 0) {
      return { totalPayments: 0, totalAmount: 0 };
    }

    let payments = 0;
    let amount = 0;

    for (const stat of bankStats) {
      if (selectedBanks.includes(stat.bank)) {
        if (statusFilter === "all") {
          payments += stat.totalPayments;
          amount += stat.totalAmount;
        } else if (statusFilter === "APROBADO") {
          payments += stat.approvedCount;
          amount += stat.approvedAmount;
        } else if (statusFilter === "EN_PROCESO" || statusFilter === "RECIBIDO") {
          payments += stat.inProcessCount;
          amount += stat.inProcessAmount;
        } else {
          // Para otros estados estimar proporcionalmente
          payments += Math.round(stat.totalPayments * 0.1);
        }
      }
    }

    return { totalPayments: payments, totalAmount: amount };
  }, [bankStats, selectedBanks, statusFilter]);

  // Función de descarga
  const handleExport = async (format: "xls" | "csv") => {
    if (selectedBanks.length === 0) {
      toast.error("Selecciona al menos una cuenta receptora para exportar");
      return;
    }

    if (fromDate && toDate && fromDate > toDate) {
      toast.error("La fecha 'Desde' no puede ser posterior a la fecha 'Hasta'");
      return;
    }

    setExportingType(format);

    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (statusFilter !== "all") params.set("status", statusFilter);
      // Solicitar lote completo hasta 2000 registros para el reporte
      params.set("limit", "2000");

      const response = await fetch(`/api/crm/payments?${params.toString()}`);
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        payments?: CrmPayment[];
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Error al obtener los pagos");
      }

      const rawPayments = payload.payments || [];

      // Filtrar por los bancos seleccionados
      const filteredPayments = rawPayments.filter((p) => {
        const norm = normalizeReceptorBank(p.bank) || "Otro";
        return selectedBanks.includes(norm) || selectedBanks.includes(p.bank || "");
      });

      const filename = buildExportFilename(
        selectedBanks,
        fromDate,
        toDate,
        format,
      );

      if (format === "xls") {
        const xml = generatePaymentsXmlSpreadsheet(filteredPayments, {
          selectedBanks,
          from: fromDate,
          to: toDate,
          organizationName: "INNOVER CORP",
        });

        const blob = new Blob([xml], {
          type: "application/vnd.ms-excel;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success(
          `Reporte Excel descargado (${filteredPayments.length} transacciones)`,
        );
      } else {
        const csv = generatePaymentsCsv(filteredPayments, {
          selectedBanks,
          from: fromDate,
          to: toDate,
        });

        const blob = new Blob([csv], {
          type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success(
          `Reporte CSV descargado (${filteredPayments.length} transacciones)`,
        );
      }

      onOpenChange(false);
    } catch (error) {
      console.error("Export error:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo generar el reporte de exportación",
      );
    } finally {
      setExportingType(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:rounded-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <FileSpreadsheet className="size-5" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">
                Exportar Reporte de Pagos
              </DialogTitle>
              <DialogDescription className="text-xs">
                Genera un informe detallado en Excel (.xls estructurado) o CSV con desglose por cuenta receptora
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* SECCIÓN 1: Selección de Cuentas / Bancos Receptores */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                1. Cuentas Receptoras Destino
              </Label>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAllBanks}
                  className="cursor-pointer text-primary hover:underline inline-flex items-center gap-1 font-medium">
                  <CheckSquare className="size-3.5" aria-hidden="true" />
                  Seleccionar todos
                </button>
                <span className="text-muted-foreground/60">·</span>
                <button
                  type="button"
                  onClick={handleClearBanks}
                  className="cursor-pointer text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  <Square className="size-3.5" aria-hidden="true" />
                  Limpiar
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {availableBanks.map((bankKey) => {
                const meta = getReceptorBankMeta(bankKey);
                const isSelected = selectedBanks.includes(bankKey);
                const stat = bankStats.find((s) => s.bank === bankKey);

                return (
                  <div
                    key={bankKey}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleToggleBank(bankKey)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleToggleBank(bankKey);
                      }
                    }}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition-all select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      isSelected
                        ? "border-emerald-500/50 bg-emerald-500/10 text-foreground shadow-xs"
                        : "border-border/60 bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/50",
                    )}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggleBank(bankKey)}
                      aria-label={`Seleccionar ${meta.displayName}`}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {meta.displayName}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {meta.subtitle}
                      </p>
                      {stat ? (
                        <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                          {stat.totalPayments} pagos · {formatPaymentAmount(stat.totalAmount)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECCIÓN 2: Rango de Fechas y Estado */}
          <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="size-3.5 text-primary" aria-hidden="true" />
                2. Período y Estado
              </Label>

              {/* Atajos rápidos de fecha */}
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={handleShortcutToday}>
                  Hoy
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={handleShortcut7Days}>
                  Últimos 7 días
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={handleShortcutThisMonth}>
                  Este mes
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor={fromInputId} className="text-xs text-muted-foreground">
                  Desde:
                </Label>
                <Input
                  id={fromInputId}
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={toInputId} className="text-xs text-muted-foreground">
                  Hasta:
                </Label>
                <Input
                  id={toInputId}
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={statusSelectId} className="text-xs text-muted-foreground flex items-center gap-1">
                  <Filter className="size-3" aria-hidden="true" />
                  Estado:
                </Label>
                <Select
                  value={statusFilter}
                  onValueChange={(val) =>
                    setStatusFilter(val as CrmPaymentStatus | "all")
                  }>
                  <SelectTrigger id={statusSelectId} className="h-9 text-xs">
                    <SelectValue placeholder="Todos los estados" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    {CRM_PAYMENT_STATUSES.map((st) => (
                      <SelectItem key={st} value={st}>
                        {CRM_PAYMENT_STATUS_LABELS[st]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: Banner dinámico de confirmación */}
          <div
            className={cn(
              "rounded-xl border p-3.5 transition-all",
              selectedBanks.length > 0
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                : "border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100",
            )}>
            <div className="flex items-start gap-2.5">
              <Info className="size-4.5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-sm">
                  {selectedBanks.length > 0
                    ? `Exportación lista: ${selectedBanks.length === availableBanks.length ? "Todos los bancos" : selectedBanks.join(", ")}`
                    : "Ningún banco seleccionado"}
                </p>
                {selectedBanks.length > 0 ? (
                  <p className="text-muted-foreground leading-relaxed">
                    Período: <strong className="text-foreground">{fromDate || "Inicio"}</strong> hasta{" "}
                    <strong className="text-foreground">{toDate || "Hoy"}</strong> · Estado:{" "}
                    <strong className="text-foreground">
                      {statusFilter === "all" ? "Todos los estados" : CRM_PAYMENT_STATUS_LABELS[statusFilter]}
                    </strong>
                    {previewStats.totalPayments > 0 ? (
                      <>
                        {" "}
                        · Estimado en rango:{" "}
                        <strong className="text-emerald-700 dark:text-emerald-300">
                          {previewStats.totalPayments} pagos ({formatPaymentAmount(previewStats.totalAmount)})
                        </strong>
                      </>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Marca al menos una cuenta bancaria receptora arriba para habilitar la descarga.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={exportingType !== null}
            className="cursor-pointer">
            Cancelar
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleExport("csv")}
              disabled={exportingType !== null || selectedBanks.length === 0}
              className="cursor-pointer"
              aria-label="Descargar en formato CSV">
              {exportingType === "csv" ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileText className="mr-1.5 size-4 text-muted-foreground" aria-hidden="true" />
              )}
              Descargar CSV
            </Button>

            <Button
              type="button"
              onClick={() => handleExport("xls")}
              disabled={exportingType !== null || selectedBanks.length === 0}
              className="cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
              aria-label="Descargar en formato Excel nativo (.xls)">
              {exportingType === "xls" ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="mr-1.5 size-4" aria-hidden="true" />
              )}
              Descargar Excel (.xls)
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
