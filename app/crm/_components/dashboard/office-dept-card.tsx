"use client";

import { Building2, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import type { OfficeDepartmentStats } from "../../_lib/types";

const formatMinutes = (minutes: number | null) => {
  if (minutes === null || !Number.isFinite(minutes)) return "Sin datos";
  if (minutes < 1) return "< 1 min";
  return `${Math.round(minutes)} min`;
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

export const OfficeDeptCard = ({
  stats,
  isLoading = false,
}: {
  stats: OfficeDepartmentStats | null;
  isLoading?: boolean;
}) => (
  <Card className={`rounded-2xl border-0 xl:col-span-3 ${CRM_SURFACES.elevated}`}>
    <CardHeader className="pb-2">
      <div className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Building2 className="size-4 text-blue-500" />
          Dpto. Oficina
        </CardTitle>
        <Badge
          variant="outline"
          className="border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400">
          {stats?.agentCount ?? 0} asesores
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
        <p className={`py-6 text-center ${CRM_SURFACES.textMuted}`}>Sin datos de oficina</p>
      ) : (
        <>
          <StatRow
            label="Volumen de chats"
            value={stats.chatsVolume.toLocaleString("es-VE")}
          />
          <StatRow
            label="Tickets creados"
            value={stats.ticketsCreated.toLocaleString("es-VE")}
          />
          <StatRow
            label="Pagos validados"
            value={stats.paymentsValidated.toLocaleString("es-VE")}
          />
          <div className="flex items-center justify-between rounded-lg bg-black/[0.02] p-2 dark:bg-white/[0.03]">
            <span className={`flex items-center gap-1 ${CRM_SURFACES.textMuted}`}>
              <Clock3 className="size-3" />
              TMR
            </span>
            <strong className={CRM_SURFACES.textPrimary}>
              {formatMinutes(stats.tmrMinutes)}
            </strong>
          </div>
        </>
      )}
    </CardContent>
  </Card>
);
