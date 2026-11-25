"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { FileSpreadsheet, Info, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import type {
  CrmPayment,
  CrmPaymentBankStat,
  CrmPaymentStatus,
  CrmPaymentStatusCounts,
} from "../../_lib/payments";
import {
  applyPaymentToBankStats,
  formatPaymentField,
  normalizeReceptorBank,
} from "../../_lib/payments";
import type { Agent } from "../../_lib/types";
import { CrmButton } from "../shared/crm-button";
import { LoadingState } from "../shared/loading-state";
import { PaymentsBankCards } from "./payments-bank-cards";
import { PaymentsExportDialog } from "./payments-export-dialog";
import {
  PaymentsFilters,
  PaymentsPagination,
  type PaymentDateType,
  type PaymentsDateRange,
} from "./payments-filters";
import { PaymentsEditorDialog, type PaymentEditorValues } from "./payments-editor-dialog";
import { PaymentsManualDialog } from "./payments-manual-dialog";
import { PaymentsStats } from "./payments-stats";
import { PaymentsTable } from "./payments-table";

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

const toCaracasIsoDate = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const todayIso = () => toCaracasIsoDate(new Date());

const EMPTY_COUNTS: CrmPaymentStatusCounts = {
  RECIBIDO: 0,
  EN_PROCESO: 0,
  APROBADO: 0,
  RECHAZADO: 0,
  DUPLICADO: 0,
  ERROR: 0,
};

const DEFAULT_DATE_RANGE = (): PaymentsDateRange => {
  const today = todayIso();
  return { from: today, to: today };
};

export type PaymentReviewedPayload = {
  conversationId: number;
  agentId: number;
  action: "approve" | "reject";
  assigned: boolean;
};

interface PaymentsViewProps {
  currentAgent?: Pick<Agent, "id" | "name" | "role" | "department"> | null;
  onOpenClientChat?: (conversationId: number) => void;
  /** After approve/reject: sync inbox assignment locally (no full CRM reload). */
  onPaymentReviewed?: (payload: PaymentReviewedPayload) => void | Promise<void>;
}

export const PaymentsView = ({
  currentAgent,
  onOpenClientChat,
  onPaymentReviewed,
}: PaymentsViewProps) => {
  const canReviewPayments =
    currentAgent?.role === "admin" || currentAgent?.department !== "soporte";
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateRange, setDateRange] = useState<PaymentsDateRange>(DEFAULT_DATE_RANGE);
  const [dateType, setDateType] = useState<PaymentDateType>("payment");
  const [status, setStatus] = useState<CrmPaymentStatus | "all">("EN_PROCESO");
  const [bank, setBank] = useState("all");
  const [page, setPage] = useState(1);
  const [payments, setPayments] = useState<CrmPayment[]>([]);
  const [banks, setBanks] = useState<string[]>([]);
  const [bankStats, setBankStats] = useState<CrmPaymentBankStat[]>([]);
  const [bankSeeds, setBankSeeds] = useState<string[] | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editingPayment, setEditingPayment] = useState<CrmPayment | null>(null);
  const [manualPayment, setManualPayment] = useState<CrmPayment | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [counts, setCounts] = useState<CrmPaymentStatusCounts>(EMPTY_COUNTS);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const requestSeq = useRef(0);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const next = searchTerm.trim();
      let shouldResetPage = false;
      setDebouncedSearch((current) => {
        shouldResetPage = current !== next;
        return next;
      });
      if (shouldResetPage) setPage(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  const loadPayments = useCallback(
    async (mode?: "initial" | "refresh") => {
      const effectiveMode =
        mode ?? (hasLoadedRef.current ? "refresh" : "initial");
      const requestId = ++requestSeq.current;
      if (effectiveMode === "refresh") setIsRefreshing(true);
      else setIsLoading(true);

      try {
        const params = new URLSearchParams();
        if (debouncedSearch) {
          params.set("q", debouncedSearch);
        } else {
          if (dateRange.from) params.set("from", dateRange.from);
          if (dateRange.to) params.set("to", dateRange.to);
          params.set("date_type", dateType);
        }
        if (status !== "all") params.set("status", status);
        if (bank !== "all") params.set("bank", bank);
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String((Math.max(page, 1) - 1) * PAGE_SIZE));

        const response = await fetch(`/api/crm/payments?${params.toString()}`);
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          payments?: CrmPayment[];
          total?: number;
          counts?: CrmPaymentStatusCounts;
          banks?: string[];
          bankStats?: CrmPaymentBankStat[];
          bankSeeds?: string[] | null;
        };

        if (requestId !== requestSeq.current) return;

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "No se pudieron cargar los pagos");
        }

        const nextTotal = payload.total ?? 0;
        const maxPage = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
        if (page > maxPage) {
          setPage(maxPage);
        }

        setPayments(payload.payments || []);
        setTotal(nextTotal);
        setCounts(payload.counts || EMPTY_COUNTS);
        setBanks(payload.banks || []);
        setBankStats(payload.bankStats || []);
        setBankSeeds(payload.bankSeeds ?? null);
        setError(null);
        hasLoadedRef.current = true;
      } catch (loadError) {
        if (requestId !== requestSeq.current) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudieron cargar los pagos",
        );
      } finally {
        if (requestId === requestSeq.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [bank, dateRange.from, dateRange.to, dateType, debouncedSearch, page, status],
  );

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const handleClearFilters = () => {
    setSearchTerm("");
    setDebouncedSearch("");
    setDateRange(DEFAULT_DATE_RANGE());
    setDateType("payment");
    setStatus("EN_PROCESO");
    setBank("all");
    setPage(1);
  };

  const handleDateTypeChange = (value: PaymentDateType) => {
    setDateType(value);
    if (value === "approval" && status !== "APROBADO") {
      setStatus("APROBADO");
    }
    setPage(1);
  };

  const handleDateRangeChange = (value: PaymentsDateRange) => {
    setDateRange(value);
    setPage(1);
  };

  const handleStatusChange = (value: CrmPaymentStatus | "all") => {
    setStatus(value);
    setPage(1);
  };

  const handleBankChange = (value: string) => {
    setBank(value);
    setPage(1);
  };

  /** Local list/stats update — no full refetch after approve/reject. */
  const applyLocalPaymentUpdate = (
    previous: CrmPayment | undefined,
    nextPayment: CrmPayment,
  ) => {
    const previousStatus = previous?.status;
    const nextStatus = nextPayment.status;

    if (previousStatus && previousStatus !== nextStatus) {
      setCounts((current) => ({
        ...current,
        [previousStatus]: Math.max(0, (current[previousStatus] || 0) - 1),
        [nextStatus]: (current[nextStatus] || 0) + 1,
      }));
    }

    const matchesStatusFilter = status === "all" || status === nextStatus;

    if (!matchesStatusFilter) {
      setPayments((current) =>
        current.filter((payment) => payment.id !== nextPayment.id),
      );
      setTotal((current) => Math.max(0, current - 1));
      return;
    }

    setPayments((current) => {
      const exists = current.some((payment) => payment.id === nextPayment.id);
      if (!exists) return [nextPayment, ...current];
      return current.map((payment) =>
        payment.id === nextPayment.id ? nextPayment : payment,
      );
    });
  };

  /** After optimistic status change, only patch row fields — avoid double count/total. */
  const reconcilePaymentRow = (nextPayment: CrmPayment) => {
    setPayments((current) => {
      if (!current.some((payment) => payment.id === nextPayment.id)) {
        return current;
      }
      return current.map((payment) =>
        payment.id === nextPayment.id ? { ...payment, ...nextPayment } : payment,
      );
    });
  };

  const handlePaymentAction = async (
    paymentId: string,
    action: "approve" | "approve_manual" | "reject",
  ) => {
    if (!currentAgent?.id) {
      setError("Debes iniciar sesión como asesor para gestionar pagos");
      toast.error("Sesión de asesor requerida");
      return;
    }

    if (!canReviewPayments) {
      toast.error("Los asesores de Soporte Técnico no tienen autorización para procesar pagos");
      return;
    }

    const paymentBeforeAction = payments.find((item) => item.id === paymentId);
    if (!paymentBeforeAction) {
      toast.error("No se encontró el pago en la lista");
      return;
    }

    const snapshot = {
      payments,
      counts,
      bankStats,
      total,
    };

    const optimisticStatus: CrmPaymentStatus =
      action === "reject" ? "RECHAZADO" : "APROBADO";
    const optimisticPayment: CrmPayment = {
      ...paymentBeforeAction,
      status: optimisticStatus,
      approved_at: action === "reject" ? null : new Date().toISOString(),
      error_message: null,
      updated_at: new Date().toISOString(),
    };

    setUpdatingId(paymentId);
    setError(null);
    setManualPayment(null);
    startTransition(() => {
      applyLocalPaymentUpdate(paymentBeforeAction, optimisticPayment);
      setBankStats((current) =>
        applyPaymentToBankStats(
          applyPaymentToBankStats(current, paymentBeforeAction, -1),
          optimisticPayment,
          1,
        ),
      );
    });

    try {
      const response = await fetch("/api/crm/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: paymentId,
          action,
          agent_id: currentAgent.id,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        payment?: CrmPayment;
        approve_kind?: string;
        remaining_amount?: number;
        conversation_id?: number | null;
        assigned?: boolean;
        assigned_agent_id?: number | null;
        assign_skip_reason?: string | null;
      };

      if (!response.ok || !payload.ok || !payload.payment) {
        throw new Error(payload.error || "No se pudo actualizar el estado");
      }

      const resolvedConversationId = Number(
        payload.conversation_id ??
          payload.payment.conversation_id ??
          paymentBeforeAction.conversation_id,
      );
      const conversationId =
        Number.isFinite(resolvedConversationId) && resolvedConversationId > 0
          ? resolvedConversationId
          : null;

      const nextPayment: CrmPayment = {
        ...payload.payment,
        conversation_id:
          conversationId ?? payload.payment.conversation_id ?? null,
        client_name:
          payload.payment.client_name ||
          paymentBeforeAction.client_name ||
          null,
        phone_id:
          payload.payment.phone_id || paymentBeforeAction.phone_id || null,
        latest_invoice_date:
          payload.payment.latest_invoice_date ??
          paymentBeforeAction.latest_invoice_date ??
          null,
      };

      startTransition(() => {
        if (nextPayment.status === optimisticStatus) {
          reconcilePaymentRow(nextPayment);
        } else {
          applyLocalPaymentUpdate(optimisticPayment, nextPayment);
          setBankStats((current) =>
            applyPaymentToBankStats(
              applyPaymentToBankStats(current, optimisticPayment, -1),
              nextPayment,
              1,
            ),
          );
        }
      });

      if (conversationId) {
        void Promise.resolve(
          onPaymentReviewed?.({
            conversationId,
            agentId: currentAgent.id,
            action: action === "reject" ? "reject" : "approve",
            assigned: Boolean(payload.assigned),
          }),
        ).catch((reviewError) => {
          console.warn("[PAYMENTS] onPaymentReviewed_failed", reviewError);
        });

        if (!payload.assigned) {
          toast.warning(
            "El pago se actualizó, pero no se pudo asignar el chat automáticamente",
          );
        }
      }

      if (action === "approve_manual") {
        toast.success(
          `Pago de ${formatPaymentField(nextPayment.client_name)} aprobado manualmente, sin el sistema de facturación`,
        );
      } else if (action === "approve") {
        toast.success(`Pago de ${formatPaymentField(nextPayment.client_name)} aprobado`);
      } else {
        toast.success("Pago rechazado");
      }
    } catch (updateError) {
      startTransition(() => {
        setPayments(snapshot.payments);
        setCounts(snapshot.counts);
        setBankStats(snapshot.bankStats);
        setTotal(snapshot.total);
      });
      const message =
        updateError instanceof Error
          ? updateError.message
          : "No se pudo actualizar el estado";
      setError(message);
      toast.error(message);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleApprove = (paymentId: string) => {
    void handlePaymentAction(paymentId, "approve");
  };

  const handleReject = (paymentId: string) => {
    void handlePaymentAction(paymentId, "reject");
  };

  const handleConfirmManual = () => {
    if (!manualPayment) return;
    void handlePaymentAction(manualPayment.id, "approve_manual");
  };

  const paymentMatchesList = (
    payment: CrmPayment,
    options?: { ignoreStatus?: boolean; ignoreBank?: boolean },
  ) => {
    if (!options?.ignoreStatus && status !== "all" && payment.status !== status) {
      return false;
    }
    const bankKey = normalizeReceptorBank(payment.bank);
    if (!options?.ignoreBank && bank !== "all" && bankKey !== bank) return false;
    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase();
      const digits = query.replace(/\D/g, "");
      const fields = [payment.client_name, payment.cedula, payment.transaction_code].map(
        (value) => String(value || "").toLowerCase(),
      );
      return (
        fields.some((value) => value.includes(query)) ||
        (digits.length >= 4 && fields.some((value) => value.includes(digits)))
      );
    }

    const day =
      dateType === "approval"
        ? payment.approved_at?.slice(0, 10)
        : payment.payment_date?.slice(0, 10);
    if (!day) return dateType !== "approval";
    if (dateRange.from && day < dateRange.from) return false;
    if (dateRange.to && day > dateRange.to) return false;
    return true;
  };

  const applyCreatedPayment = (payment: CrmPayment) => {
    if (paymentMatchesList(payment, { ignoreStatus: true, ignoreBank: true })) {
      setBankStats((current) => applyPaymentToBankStats(current, payment, 1));
    }
    if (paymentMatchesList(payment, { ignoreStatus: true })) {
      setCounts((current) => ({
        ...current,
        [payment.status]: (current[payment.status] || 0) + 1,
      }));
    }
    if (!paymentMatchesList(payment)) return;
    setTotal((current) => current + 1);
    if (page === 1) {
      setPayments((current) => [payment, ...current].slice(0, PAGE_SIZE));
    }
  };

  const applyEditedPayment = (previous: CrmPayment, payment: CrmPayment) => {
    if (previous.status !== payment.status) {
      setCounts((current) => ({
        ...current,
        [previous.status]: Math.max(0, (current[previous.status] || 0) - 1),
        [payment.status]: (current[payment.status] || 0) + 1,
      }));
    }

    setBankStats((current) =>
      applyPaymentToBankStats(
        applyPaymentToBankStats(current, previous, -1),
        payment,
        1,
      ),
    );

    const matchesStatus = status === "all" || status === payment.status;
    if (!matchesStatus) {
      setPayments((current) => current.filter((item) => item.id !== payment.id));
      setTotal((current) => Math.max(0, current - 1));
      return;
    }

    setPayments((current) =>
      current.map((item) => (item.id === payment.id ? payment : item)),
    );
  };

  const handleEditorSubmit = async (values: PaymentEditorValues) => {
    if (!currentAgent?.id) {
      setError("Debes iniciar sesión como asesor para gestionar pagos");
      toast.error("Sesión de asesor requerida");
      return;
    }

    if (!canReviewPayments) {
      toast.error("Los asesores de Soporte Técnico no tienen autorización para procesar pagos");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const response =
        editorMode === "create"
          ? await fetch("/api/crm/payments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                agent_id: currentAgent.id,
                ...values,
              }),
            })
          : await fetch("/api/crm/payments", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: editingPayment?.id,
                action: "update",
                agent_id: currentAgent.id,
                ...values,
              }),
            });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        payment?: CrmPayment;
      };
      if (!response.ok || !payload.ok || !payload.payment) {
        throw new Error(payload.error || "No se pudo guardar el pago");
      }

      if (editorMode === "create") {
        applyCreatedPayment(payload.payment);
        toast.success("Pago registrado");
      } else if (editingPayment) {
        applyEditedPayment(editingPayment, payload.payment);
        toast.success("Pago actualizado con éxito");
      }

      setEditorOpen(false);
      setEditingPayment(null);
      void loadPayments("refresh");
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "No se pudo guardar el pago";
      setError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`crm-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-6`}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2
            className={`text-xl font-semibold md:text-2xl ${CRM_SURFACES.textPrimary}`}>
            Pagos
          </h2>
          <p className={`text-sm ${CRM_SURFACES.textMuted}`}>
            Bandeja de comprobantes: entran al registrarlos y se completan con la
            extracción
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
          {currentAgent && canReviewPayments ? (
            <Button
              type="button"
              onClick={() => {
                setEditorMode("create");
                setEditingPayment(null);
                setEditorOpen(true);
              }}
              className="w-full cursor-pointer bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
              aria-label="Registrar pago manual">
              <Plus className="mr-2 size-4" aria-hidden="true" />
              Registrar pago manual
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => setExportDialogOpen(true)}
            className="w-full sm:w-auto cursor-pointer border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-800 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
            aria-label="Abrir modal para exportar pagos a Excel">
            <FileSpreadsheet
              className="mr-2 size-4 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            Exportar a Excel
          </Button>

          <CrmButton
            type="button"
            variant="secondary"
            onClick={() => void loadPayments("refresh")}
            disabled={isRefreshing || isLoading}
            className="w-full cursor-pointer sm:w-auto"
            aria-label="Actualizar listado de pagos">
            <RefreshCw
              className={`mr-2 size-4 ${isRefreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Actualizar
          </CrmButton>
        </div>
      </div>

      <div className="space-y-5">
        {!canReviewPayments ? (
          <div className="flex items-center gap-3 rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 text-xs text-blue-800 dark:text-blue-200">
            <Info className="size-5 shrink-0 text-blue-500" aria-hidden="true" />
            <div>
              <p className="font-semibold text-sm">Bandeja de Pagos · Modo solo lectura (Soporte Técnico)</p>
              <p className="mt-0.5 text-muted-foreground text-xs">
                Tu usuario tiene asignado el departamento de Soporte Técnico. Por política de segregación de funciones, la validación, aprobación y conciliación de pagos está reservada para el departamento de Cobranzas y Administradores.
              </p>
            </div>
          </div>
        ) : null}

        <PaymentsStats total={total} counts={counts} />

        <PaymentsBankCards
          bankStats={bankStats}
          seedBanks={bankSeeds}
          selectedBank={bank}
          onSelectBank={handleBankChange}
        />

        <PaymentsFilters
          searchTerm={searchTerm}
          dateRange={dateRange}
          dateType={dateType}
          status={status}
          bank={bank}
          banks={banks}
          onSearchChange={setSearchTerm}
          onDateRangeChange={handleDateRangeChange}
          onDateTypeChange={handleDateTypeChange}
          onStatusChange={handleStatusChange}
          onBankChange={handleBankChange}
          onClearFilters={handleClearFilters}
        />

        {error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-100">
            {error}
          </p>
        ) : null}

        {isLoading ? (
          <LoadingState label="Cargando pagos..." />
        ) : (
          <>
            <PaymentsTable
              payments={payments}
              updatingId={updatingId}
              canReviewPayments={canReviewPayments}
              onApprove={handleApprove}
              onApproveManual={(paymentId) => {
                const payment = payments.find((item) => item.id === paymentId) ?? null;
                setManualPayment(payment);
              }}
              onReject={handleReject}
              onEdit={(payment) => {
                setEditorMode("edit");
                setEditingPayment(payment);
                setEditorOpen(true);
              }}
              onOpenChat={onOpenClientChat}
            />
            <PaymentsPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              isLoading={isRefreshing}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      <PaymentsManualDialog
        payment={manualPayment}
        submitting={updatingId === manualPayment?.id}
        onOpenChange={(open) => {
          if (!open) setManualPayment(null);
        }}
        onConfirm={handleConfirmManual}
      />

      <PaymentsEditorDialog
        open={editorOpen}
        mode={editorMode}
        payment={editingPayment}
        banks={banks}
        submitting={isSaving}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditingPayment(null);
        }}
        onSubmit={handleEditorSubmit}
      />

      <PaymentsExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        initialFrom={dateRange.from}
        initialTo={dateRange.to}
        initialDateType={dateType}
        initialStatus={status}
        initialBank={bank}
        bankStats={bankStats}
        knownBanks={banks}
      />
    </div>
  );
};
