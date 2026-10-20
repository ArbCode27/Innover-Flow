"use client";

import { HardHat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import type { FieldDepartmentStats } from "../../_lib/types";

const formatPercent = (value: number | null, asRatio = false) => {
  if (value === null || !Number.isFinite(value)) return "Sin datos";
  const percent = asRatio ? value * 100 : value;
  return `${(Math.round(percent * 10) / 10).toFixed(1)}%`;
};

const StatRow = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => (
  <div className="flex items-center justify-between rounded-lg bg-black/[0.02] p-2 dark:bg-white/[0.03]">
    <span className={CRM_SURFACES.textMuted}>{label}</span>
    <strong className={CRM_SURFACES.textPrimary}>{value}</strong>
  </div>
);

export const FieldDeptCard = ({
  stats,
  isLoading = false,
}: {
  stats: FieldDepartmentStats | null;
  isLoading?: boolean;
}) => (
  <Card className={`rounded-2xl border-0 xl:col-span-3 ${CRM_SURFACES.elevated}`}>
    <CardHeader className="pb-2">
      <div className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <HardHat className="size-4 text-amber-500" />
          Dpto. Técnico
        </CardTitle>
        <Badge
          variant="outline"
          className="border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400">
          {stats?.technicianCount ?? 0} técnicos
        </Badge>
      </div>
    </CardHeader>
    <CardContent className="space-y-2.5 pt-1 text-xs">
      {isLoading ? (
        <>
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </>
      ) : !stats ? (
        <p className={`py-6 text-center ${CRM_SURFACES.textMuted}`}>Sin datos de campo</p>
      ) : (
        <>
          <StatRow
            label="Tickets asignados"
            value={stats.ticketsAssigned.toLocaleString("es-VE")}
          />
          <StatRow
            label="Tickets resueltos"
            value={stats.ticketsResolved.toLocaleString("es-VE")}
          />
          <StatRow
            label="Tasa de reincidencia"
            value={formatPercent(stats.recurrenceRate)}
          />
          <StatRow
            label="SLA"
            value={formatPercent(stats.slaCompliance, true)}
          />
        </>
      )}
    </CardContent>
  </Card>
);
