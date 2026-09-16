"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import type {
  CrmPayment,
  CrmPaymentStatus,
  CrmPaymentStatusCounts,
} from "../../_lib/payments";
import { formatPaymentField } from "../../_lib/payments";
import type { Agent } from "../../_lib/types";
import { CrmButton } from "../shared/crm-button";
import { LoadingState } from "../shared/loading-state";
import {
  PaymentsFilters,
  PaymentsPagination,
  type PaymentsDateRange,
} from "./payments-filters";
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
  currentAgent?: Pick<Agent, "id" | "name"> | null;
  onOpenClientChat?: (conversationId: number) => void;
  /** After approve/reject: sync inbox assignment locally (no full CRM reload). */
  onPaymentReviewed?: (payload: PaymentReviewedPayload) => void | Promise<void>;
}

export const PaymentsView = ({
  currentAgent,
  onOpenClientChat,
  onPaymentReviewed,
}: PaymentsViewProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateRange, setDateRange] = useState<PaymentsDateRange>(DEFAULT_DATE_RANGE);
  const [status, setStatus] = useState<CrmPaymentStatus | "all">("EN_PROCESO");
  const [bank, setBank] = useState("all");
  const [page, setPage] = useState(1);
  const [payments, setPayments] = useState<CrmPayment[]>([]);
  const [banks, setBanks] = useState<string[]>([]);
  const [counts, setCounts] = useState<CrmPaymentStatusCounts>(EMPTY_COUNTS);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [searchTerm]);

  const loadPayments = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "refresh") setIsRefreshing(true);
      else setIsLoading(true);

      try {
        const params = new URLSearchParams();
        if (debouncedSearch) params.set("q", debouncedSearch);
        if (dateRange.from) params.set("from", dateRange.from);
        if (dateRange.to) params.set("to", dateRange.to);
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
        };

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
        setError(null);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudieron cargar los pagos",
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [bank, dateRange.from, dateRange.to, debouncedSearch, page, status],
  );

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const handleClearFilters = () => {
    setSearchTerm("");
    setDebouncedSearch("");
    setDateRange(DEFAULT_DATE_RANGE());
    setStatus("EN_PROCESO");
    setBank("all");
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
    action: "approve" | "reject",
  ) => {
    if (!currentAgent?.id) {
      setError("Debes iniciar sesión como asesor para gestionar pagos");
      toast.error("Sesión de asesor requerida");
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
      total,
    };

    const optimisticStatus: CrmPaymentStatus =
      action === "approve" ? "APROBADO" : "RECHAZADO";
    const optimisticPayment: CrmPayment = {
      ...paymentBeforeAction,
      status: optimisticStatus,
      error_message: null,
      updated_at: new Date().toISOString(),
    };

    setUpdatingId(paymentId);
    setError(null);
    startTransition(() => {
      applyLocalPaymentUpdate(paymentBeforeAction, optimisticPayment);
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
        }
      });

      if (conversationId) {
        void Promise.resolve(
          onPaymentReviewed?.({
            conversationId,
            agentId: currentAgent.id,
            action,
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

      if (action === "approve") {
        toast.success(
          `Pago de ${formatPaymentField(nextPayment.client_name)} aprobado`,
        );
      } else {
        toast.success(
          payload.assigned
            ? "Pago rechazado y chat asignado a ti"
            : "Pago rechazado",
        );
      }
    } catch (updateError) {
      startTransition(() => {
        setPayments(snapshot.payments);
        setCounts(snapshot.counts);
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

      <div className="space-y-5">
        <PaymentsStats total={total} counts={counts} />
        <PaymentsFilters
          searchTerm={searchTerm}
          dateRange={dateRange}
          status={status}
          bank={bank}
          banks={banks}
          onSearchChange={setSearchTerm}
          onDateRangeChange={handleDateRangeChange}
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
              onApprove={handleApprove}
              onReject={handleReject}
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
    </div>
  );
};
