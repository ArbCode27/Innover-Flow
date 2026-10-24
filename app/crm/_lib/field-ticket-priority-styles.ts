import type { FieldTicketPriority } from "@/lib/field-tickets";

/** Badge fill/text for the Prioridad column. */
export const FIELD_TICKET_PRIORITY_BADGE_CLASS: Record<
  FieldTicketPriority,
  string
> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  medium: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  high: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  urgent: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
};

/**
 * Full-row accent: left border + subtle tint.
 * Hover is included so it wins over the generic table hover.
 */
export const FIELD_TICKET_PRIORITY_ROW_CLASS: Record<
  FieldTicketPriority,
  string
> = {
  low: "border-l-2 border-l-slate-400/70 hover:bg-slate-500/[0.06] dark:hover:bg-slate-400/[0.08]",
  medium:
    "border-l-2 border-l-sky-500/80 bg-sky-500/[0.04] hover:bg-sky-500/[0.09] dark:bg-sky-400/[0.06] dark:hover:bg-sky-400/[0.11]",
  high:
    "border-l-2 border-l-amber-500/90 bg-amber-500/[0.06] hover:bg-amber-500/[0.11] dark:bg-amber-400/[0.08] dark:hover:bg-amber-400/[0.13]",
  urgent:
    "border-l-2 border-l-rose-500 bg-rose-500/[0.08] hover:bg-rose-500/[0.13] dark:bg-rose-400/[0.1] dark:hover:bg-rose-400/[0.15]",
};

const isPriority = (value: string): value is FieldTicketPriority =>
  value === "low" ||
  value === "medium" ||
  value === "high" ||
  value === "urgent";

export const fieldTicketPriorityBadgeClass = (
  priority: string | null | undefined,
) =>
  isPriority(priority || "")
    ? FIELD_TICKET_PRIORITY_BADGE_CLASS[priority as FieldTicketPriority]
    : FIELD_TICKET_PRIORITY_BADGE_CLASS.medium;

export const fieldTicketPriorityRowClass = (
  priority: string | null | undefined,
) =>
  isPriority(priority || "")
    ? FIELD_TICKET_PRIORITY_ROW_CLASS[priority as FieldTicketPriority]
    : FIELD_TICKET_PRIORITY_ROW_CLASS.medium;
