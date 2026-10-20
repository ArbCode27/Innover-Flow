export type Role = "office" | "field";

export interface OfficeMetrics {
  chatsResolved: number;
  ticketsCreated: number;
  paymentsValidated: number;
  firstResponseMinutes: number;
}

export interface FieldMetrics {
  ticketsAssigned: number;
  ticketsResolved: number;
  recurrences72h: number;
  slaCompliance: number;
}

export type OfficeTeamRow = {
  role: "office";
  id: string;
  name: string;
  status: string;
  metrics: OfficeMetrics;
  score: number;
  rankInRole: number;
};

export type FieldTeamRow = {
  role: "field";
  id: string;
  name: string;
  metrics: FieldMetrics;
  score: number;
  rankInRole: number;
  slaSampleSize: number;
};

export type TeamRow = OfficeTeamRow | FieldTeamRow;

export const OFFICE_SCORE_WEIGHTS = {
  chatsResolved: 1,
  ticketsCreated: 1.5,
  paymentsValidated: 1.5,
  firstResponseMinutes: 0.5,
} as const;

export const FIELD_SCORE_WEIGHTS = {
  ticketsResolved: 5,
  recurrences72h: 15,
} as const;

/**
 * SLA may arrive as a 0–1 ratio or a 0–100 percentage.
 * Values greater than 1 are treated as percentages and divided by 100, then clamped to [0, 1].
 */
export const normalizeSlaCompliance = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const ratio = value > 1 ? value / 100 : value;
  return Math.min(1, Math.max(0, ratio));
};

export const calculateOfficeScore = (metrics: OfficeMetrics): number => {
  const chats = Number.isFinite(metrics.chatsResolved) ? metrics.chatsResolved : 0;
  const tickets = Number.isFinite(metrics.ticketsCreated) ? metrics.ticketsCreated : 0;
  const payments = Number.isFinite(metrics.paymentsValidated)
    ? metrics.paymentsValidated
    : 0;
  const firstResponse = Number.isFinite(metrics.firstResponseMinutes)
    ? metrics.firstResponseMinutes
    : 0;

  return (
    chats * OFFICE_SCORE_WEIGHTS.chatsResolved +
    tickets * OFFICE_SCORE_WEIGHTS.ticketsCreated +
    payments * OFFICE_SCORE_WEIGHTS.paymentsValidated -
    firstResponse * OFFICE_SCORE_WEIGHTS.firstResponseMinutes
  );
};

export const calculateFieldScore = (metrics: FieldMetrics): number => {
  const resolved = Number.isFinite(metrics.ticketsResolved)
    ? metrics.ticketsResolved
    : 0;
  const recurrences = Number.isFinite(metrics.recurrences72h)
    ? metrics.recurrences72h
    : 0;
  const sla = normalizeSlaCompliance(metrics.slaCompliance);

  return (
    (resolved * FIELD_SCORE_WEIGHTS.ticketsResolved -
      recurrences * FIELD_SCORE_WEIGHTS.recurrences72h) *
    (1 + sla)
  );
};

export function calculateScore(role: "office", metrics: OfficeMetrics): number;
export function calculateScore(role: "field", metrics: FieldMetrics): number;
export function calculateScore(
  role: Role,
  metrics: OfficeMetrics | FieldMetrics,
): number;
export function calculateScore(
  role: Role,
  metrics: OfficeMetrics | FieldMetrics,
): number {
  if (role === "office") {
    return calculateOfficeScore(metrics as OfficeMetrics);
  }
  return calculateFieldScore(metrics as FieldMetrics);
}

export const formatScore = (score: number): string =>
  (Math.round(score * 10) / 10).toFixed(1);

export const recurrenceRatePercent = (
  recurrences72h: number,
  ticketsResolved: number,
): number | null => {
  if (!ticketsResolved) return null;
  return (recurrences72h / ticketsResolved) * 100;
};

type Rankable = {
  role: Role;
  name: string;
  score: number;
};

export const assignRoleRanks = <T extends Rankable>(
  rows: T[],
): Array<T & { rankInRole: number }> => {
  const ranks = new Map<T, number>();

  (["office", "field"] as const).forEach((role) => {
    const sorted = rows
      .filter((row) => row.role === role)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return left.name.localeCompare(right.name, "es");
      });
    sorted.forEach((row, index) => {
      ranks.set(row, index + 1);
    });
  });

  return rows.map((row) => ({
    ...row,
    rankInRole: ranks.get(row) ?? 0,
  }));
};

export const sortTeamByScoreDesc = <T extends { score: number; name: string }>(
  rows: T[],
): T[] =>
  [...rows].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.name.localeCompare(right.name, "es");
  });

export const topPerformerByRole = <T extends { role: Role; score: number; name: string }>(
  rows: T[],
  role: Role,
): T | null => {
  const ranked = sortTeamByScoreDesc(rows.filter((row) => row.role === role));
  return ranked[0] ?? null;
};

export const rankMedal = (rankInRole: number): string => {
  if (rankInRole === 1) return "🥇";
  if (rankInRole === 2) return "🥈";
  if (rankInRole === 3) return "🥉";
  return "";
};
