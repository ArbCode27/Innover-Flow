const RECURRENCE_WINDOW_MS = 72 * 60 * 60 * 1000;

export type DerivedTicket = {
  id: string;
  crmClientId: number | null;
  employeeId: string | null;
  status: string;
  createdAt: string;
  closedAt: string | null;
  windowEnd: string | null;
};

export type PeriodRange = {
  fromMs: number;
  toMs: number;
};

const inRange = (value: number, range: PeriodRange) =>
  value >= range.fromMs && value <= range.toMs;

const parseTime = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const employeeMatches = (ticket: DerivedTicket, employeeIds: ReadonlySet<string>) =>
  Boolean(ticket.employeeId && employeeIds.has(ticket.employeeId));

/**
 * Reincidencia: un ticket `done` cerrado en el periodo, atribuido al técnico,
 * si el mismo `crm_client_id` tiene otro ticket creado después del cierre y
 * en menos de 72 horas. No hay columna de reincidencia en el esquema.
 */
export const countRecurrences72h = (
  employeeIds: ReadonlySet<string>,
  tickets: readonly DerivedTicket[],
  period: PeriodRange,
): number => {
  const closedByTech = tickets.filter((ticket) => {
    if (ticket.status !== "done") return false;
    if (!employeeMatches(ticket, employeeIds)) return false;
    const closedAt = parseTime(ticket.closedAt);
    return closedAt !== null && inRange(closedAt, period);
  });

  let recurrences = 0;
  for (const closed of closedByTech) {
    if (!closed.crmClientId) continue;
    const closedAt = parseTime(closed.closedAt);
    if (closedAt === null) continue;
    const recurred = tickets.some((other) => {
      if (other.id === closed.id) return false;
      if (other.crmClientId !== closed.crmClientId) return false;
      const createdAt = parseTime(other.createdAt);
      if (createdAt === null) return false;
      const delta = createdAt - closedAt;
      return delta > 0 && delta <= RECURRENCE_WINDOW_MS;
    });
    if (recurred) recurrences += 1;
  }
  return recurrences;
};

/**
 * SLA derivado: tickets `done` del técnico cerrados en el periodo que tienen
 * `window_end`. Cumple si `closed_at <= window_end`. Sin ventana, no entra al
 * denominador; si no hay muestra, el caller usa 0.
 */
export const slaComplianceRatio = (
  employeeIds: ReadonlySet<string>,
  tickets: readonly DerivedTicket[],
  period: PeriodRange,
): { ratio: number; sampleSize: number; onTime: number } => {
  const withWindow = tickets.filter((ticket) => {
    if (ticket.status !== "done") return false;
    if (!employeeMatches(ticket, employeeIds)) return false;
    if (!ticket.windowEnd) return false;
    const closedAt = parseTime(ticket.closedAt);
    return closedAt !== null && inRange(closedAt, period);
  });

  if (!withWindow.length) {
    return { ratio: 0, sampleSize: 0, onTime: 0 };
  }

  const onTime = withWindow.filter((ticket) => {
    const closedAt = parseTime(ticket.closedAt);
    const windowEnd = parseTime(ticket.windowEnd);
    return closedAt !== null && windowEnd !== null && closedAt <= windowEnd;
  }).length;

  return {
    ratio: onTime / withWindow.length,
    sampleSize: withWindow.length,
    onTime,
  };
};

export const countAssignedInPeriod = (
  employeeIds: ReadonlySet<string>,
  tickets: readonly DerivedTicket[],
  period: PeriodRange,
): number =>
  tickets.filter((ticket) => {
    if (!employeeMatches(ticket, employeeIds)) return false;
    if (ticket.status === "cancelled") return false;
    const createdAt = parseTime(ticket.createdAt);
    return createdAt !== null && inRange(createdAt, period);
  }).length;

export const countResolvedInPeriod = (
  employeeIds: ReadonlySet<string>,
  tickets: readonly DerivedTicket[],
  period: PeriodRange,
): number =>
  tickets.filter((ticket) => {
    if (ticket.status !== "done") return false;
    if (!employeeMatches(ticket, employeeIds)) return false;
    const closedAt = parseTime(ticket.closedAt);
    return closedAt !== null && inRange(closedAt, period);
  }).length;

export const departmentSlaRatio = (
  tickets: readonly DerivedTicket[],
  period: PeriodRange,
): { ratio: number | null; sampleSize: number } => {
  const withWindow = tickets.filter((ticket) => {
    if (ticket.status !== "done" || !ticket.employeeId || !ticket.windowEnd) {
      return false;
    }
    const closedAt = parseTime(ticket.closedAt);
    return closedAt !== null && inRange(closedAt, period);
  });
  if (!withWindow.length) return { ratio: null, sampleSize: 0 };
  const onTime = withWindow.filter((ticket) => {
    const closedAt = parseTime(ticket.closedAt);
    const windowEnd = parseTime(ticket.windowEnd);
    return closedAt !== null && windowEnd !== null && closedAt <= windowEnd;
  }).length;
  return { ratio: onTime / withWindow.length, sampleSize: withWindow.length };
};
