"use client";

import { TableCell } from "@/components/ui/table";
import { formatScore, rankMedal, type FieldTeamRow, type OfficeTeamRow } from "@/lib/scoring";
import { CRM_SURFACES } from "../../_lib/crm-theme";

const MetricCell = ({
  value,
  label,
}: {
  value: string;
  label: string;
}) => (
  <TableCell className="py-3">
    <span className={`block font-semibold ${CRM_SURFACES.textPrimary}`}>{value}</span>
    <span className={`block text-[11px] ${CRM_SURFACES.textMuted}`}>{label}</span>
  </TableCell>
);

export const OfficeMetricCells = ({ row }: { row: OfficeTeamRow }) => (
  <>
    <MetricCell
      value={String(row.metrics.chatsResolved)}
      label="Chats resueltos (C)"
    />
    <MetricCell
      value={`${row.metrics.ticketsCreated} · ${row.metrics.paymentsValidated}`}
      label="Tickets (T) + Pagos (P)"
    />
    <MetricCell
      value={
        row.metrics.firstResponseMinutes < 1
          ? "< 1 min"
          : `${Math.round(row.metrics.firstResponseMinutes)} min`
      }
      label="1ª respuesta (TR)"
    />
    <ScoreCell score={row.score} rankInRole={row.rankInRole} />
  </>
);

export const FieldMetricCells = ({ row }: { row: FieldTeamRow }) => {
  const slaPercent =
    row.slaSampleSize === 0
      ? "Sin datos"
      : `${(Math.round(row.metrics.slaCompliance * 1000) / 10).toFixed(1)}%`;
  return (
    <>
      <MetricCell
        value={String(row.metrics.ticketsAssigned)}
        label="Tickets asignados"
      />
      <MetricCell
        value={String(row.metrics.ticketsResolved)}
        label="Tickets resueltos"
      />
      <MetricCell
        value={`${row.metrics.recurrences72h} · ${slaPercent}`}
        label="Reincidencias (R) + SLA"
      />
      <ScoreCell score={row.score} rankInRole={row.rankInRole} />
    </>
  );
};

export const ScoreCell = ({
  score,
  rankInRole,
}: {
  score: number;
  rankInRole: number;
}) => {
  const medal = rankMedal(rankInRole);
  const isNegative = score < 0;
  return (
    <TableCell className="py-3 text-center">
      <span
        className={`block font-semibold ${
          isNegative ? "text-destructive" : CRM_SURFACES.textPrimary
        }`}>
        {formatScore(score)}
      </span>
      <span className={`block text-[11px] ${CRM_SURFACES.textMuted}`}>
        {medal ? `${medal} ` : ""}#{rankInRole} en su rol
      </span>
    </TableCell>
  );
};

export const renderRoleMetricCells = (row: OfficeTeamRow | FieldTeamRow) => {
  switch (row.role) {
    case "office":
      return <OfficeMetricCells row={row} />;
    case "field":
      return <FieldMetricCells row={row} />;
  }
};
