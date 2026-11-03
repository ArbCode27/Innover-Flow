"use client";

import type { KeyboardEvent } from "react";
import {
  Building2,
  Check,
  CreditCard,
  Landmark,
  Layers,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CrmPaymentBankStat } from "../../_lib/payments";
import { formatPaymentAmount, getReceptorBankMeta } from "../../_lib/payments";

interface PaymentsBankCardsProps {
  bankStats: CrmPaymentBankStat[];
  selectedBank: string;
  onSelectBank: (bank: string) => void;
}

const getBankVisualConfig = (colorScheme: "red" | "emerald" | "blue" | "purple") => {
  switch (colorScheme) {
    case "red":
      return {
        icon: Landmark,
        cardBg: "bg-red-500/5 hover:bg-red-500/10 dark:bg-red-950/20 dark:hover:bg-red-950/30",
        cardBorder: "border-red-500/25 dark:border-red-500/30",
        activeRing: "ring-2 ring-red-500 shadow-md shadow-red-500/10",
        iconContainer: "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30",
        amountColor: "text-red-700 dark:text-red-300",
        activeBadge: "bg-red-600 text-white hover:bg-red-600",
        inactiveBadge: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
      };
    case "emerald":
      return {
        icon: Layers,
        cardBg: "bg-emerald-500/5 hover:bg-emerald-500/10 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30",
        cardBorder: "border-emerald-500/25 dark:border-emerald-500/30",
        activeRing: "ring-2 ring-emerald-500 shadow-md shadow-emerald-500/10",
        iconContainer: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30",
        amountColor: "text-emerald-700 dark:text-emerald-300",
        activeBadge: "bg-emerald-600 text-white hover:bg-emerald-600",
        inactiveBadge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
      };
    case "blue":
      return {
        icon: CreditCard,
        cardBg: "bg-blue-500/5 hover:bg-blue-500/10 dark:bg-blue-950/20 dark:hover:bg-blue-950/30",
        cardBorder: "border-blue-500/25 dark:border-blue-500/30",
        activeRing: "ring-2 ring-blue-500 shadow-md shadow-blue-500/10",
        iconContainer: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30",
        amountColor: "text-blue-700 dark:text-blue-300",
        activeBadge: "bg-blue-600 text-white hover:bg-blue-600",
        inactiveBadge: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
      };
    default:
      return {
        icon: Building2,
        cardBg: "bg-purple-500/5 hover:bg-purple-500/10 dark:bg-purple-950/20 dark:hover:bg-purple-950/30",
        cardBorder: "border-purple-500/25 dark:border-purple-500/30",
        activeRing: "ring-2 ring-purple-500 shadow-md shadow-purple-500/10",
        iconContainer: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30",
        amountColor: "text-purple-700 dark:text-purple-300",
        activeBadge: "bg-purple-600 text-white hover:bg-purple-600",
        inactiveBadge: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
      };
  }
};

export const PaymentsBankCards = ({
  bankStats,
  selectedBank,
  onSelectBank,
}: PaymentsBankCardsProps) => {
  if (!bankStats || bankStats.length === 0) {
    return null;
  }

  const handleCardClick = (bankKey: string) => {
    if (selectedBank === bankKey) {
      onSelectBank("all");
      return;
    }
    onSelectBank(bankKey);
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>, bankKey: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCardClick(bankKey);
    }
  };

  const handleResetFilter = () => {
    onSelectBank("all");
  };

  const isFiltered = selectedBank !== "all";

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Cuentas Receptoras de la Empresa
          </span>
          <span className="text-[11px] text-muted-foreground/80">
            (Filtros rápidos)
          </span>
        </div>

        {isFiltered ? (
          <button
            type="button"
            onClick={handleResetFilter}
            className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded px-1.5 py-0.5"
            aria-label="Mostrar todos los bancos">
            <RotateCcw className="size-3" aria-hidden="true" />
            Mostrar todos los bancos
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {bankStats.map((stat) => {
          const meta = getReceptorBankMeta(stat.bank);
          const visual = getBankVisualConfig(meta.colorScheme);
          const Icon = visual.icon;
          const isSelected = selectedBank === stat.bank;

          return (
            <div
              key={stat.bank}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`Filtrar por ${meta.displayName}: ${stat.totalPayments} pagos, total ${formatPaymentAmount(stat.totalAmount)}`}
              onClick={() => handleCardClick(stat.bank)}
              onKeyDown={(e) => handleCardKeyDown(e, stat.bank)}
              className={cn(
                "group relative flex cursor-pointer flex-col justify-between rounded-xl border p-3.5 transition-all duration-200 select-none focus-visible:outline-none",
                visual.cardBg,
                visual.cardBorder,
                isSelected ? visual.activeRing : "hover:border-foreground/20 hover:shadow-sm",
              )}>
              {/* Cabecera de la tarjeta */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg shadow-xs transition-transform group-hover:scale-105",
                      visual.iconContainer,
                    )}>
                    <Icon className="size-4.5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-sm text-foreground">
                      {meta.displayName}
                    </h3>
                    <p className="truncate text-[11px] font-medium text-muted-foreground">
                      {meta.subtitle}
                    </p>
                  </div>
                </div>

                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 font-medium text-[11px] transition-colors",
                    isSelected ? visual.activeBadge : visual.inactiveBadge,
                  )}>
                  {isSelected ? (
                    <>
                      <Check className="mr-1 size-3" aria-hidden="true" />
                      Activo
                    </>
                  ) : (
                    `${stat.totalPayments} ${stat.totalPayments === 1 ? "pago" : "pagos"}`
                  )}
                </Badge>
              </div>

              {/* Métricas y desglose */}
              <div className="mt-3.5 space-y-1">
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-xs text-muted-foreground">Recaudado:</span>
                  <span className={cn("font-bold text-base tracking-tight", visual.amountColor)}>
                    {formatPaymentAmount(stat.totalAmount)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                  <span>
                    <strong className="text-foreground/90 font-medium">{stat.approvedCount}</strong> aprobados ({formatPaymentAmount(stat.approvedAmount)})
                  </span>
                  <span>·</span>
                  <span>
                    <strong className="text-foreground/90 font-medium">{stat.inProcessCount}</strong> en proceso
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
