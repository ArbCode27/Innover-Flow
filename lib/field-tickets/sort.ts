import type { FieldTicket, FieldTicketPriority } from "./types";

/** Lower rank = higher priority (urgent first). */
export const FIELD_TICKET_PRIORITY_RANK: Record<FieldTicketPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const priorityRank = (priority: string | null | undefined) => {
  if (priority && priority in FIELD_TICKET_PRIORITY_RANK) {
    return FIELD_TICKET_PRIORITY_RANK[priority as FieldTicketPriority];
  }
  return FIELD_TICKET_PRIORITY_RANK.medium;
};

const parseTime = (value: string | null | undefined) => {
  if (!value) return Number.POSITIVE_INFINITY;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
};

/**
 * Agenda time for ordering within the same priority:
 * visit window start, then createdAt when the window is missing.
 */
export const fieldTicketScheduleTime = (ticket: Pick<
  FieldTicket,
  "windowStart" | "createdAt"
>) => {
  const windowMs = parseTime(ticket.windowStart);
  if (Number.isFinite(windowMs) && windowMs !== Number.POSITIVE_INFINITY) {
    return windowMs;
  }
  return parseTime(ticket.createdAt);
};

/**
 * Sort: priority high→low, then earlier schedule first, then publicId.
 */
export const compareFieldTicketsByPriorityThenSchedule = (
  left: Pick<FieldTicket, "priority" | "windowStart" | "createdAt" | "publicId">,
  right: Pick<FieldTicket, "priority" | "windowStart" | "createdAt" | "publicId">,
) => {
  const byPriority = priorityRank(left.priority) - priorityRank(right.priority);
  if (byPriority !== 0) return byPriority;

  const bySchedule =
    fieldTicketScheduleTime(left) - fieldTicketScheduleTime(right);
  if (bySchedule !== 0) return bySchedule;

  return left.publicId - right.publicId;
};

export const sortFieldTicketsByPriorityThenSchedule = <T extends Pick<
  FieldTicket,
  "priority" | "windowStart" | "createdAt" | "publicId"
>>(
  tickets: T[],
): T[] => [...tickets].sort(compareFieldTicketsByPriorityThenSchedule);
