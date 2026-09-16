/**
 * Office hours + after-hours payments policy (America/Caracas).
 * Sundays and empty day slots = office closed. human_mode never auto-replies.
 */

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type OfficeHoursConfig = {
  enabled: boolean;
  timezone: string;
  /** Time windows per weekday as [start, end] HH:mm (local). Empty = closed all day. */
  days: Record<WeekdayKey, Array<[string, string]>>;
  holidays?: string[];
};

export type AfterHoursPaymentsConfig = {
  enabled: boolean;
  allowedTools: string[];
};

export const DEFAULT_OFFICE_TIMEZONE = "America/Caracas";

/** Mon–Fri 08:00–17:00, Sat 08:00–12:00, Sun closed. */
export const DEFAULT_OFFICE_HOURS: OfficeHoursConfig = {
  enabled: true,
  timezone: DEFAULT_OFFICE_TIMEZONE,
  days: {
    mon: [["08:00", "17:00"]],
    tue: [["08:00", "17:00"]],
    wed: [["08:00", "17:00"]],
    thu: [["08:00", "17:00"]],
    fri: [["08:00", "17:00"]],
    sat: [["08:00", "12:00"]],
    sun: [],
  },
  holidays: [],
};

export const DEFAULT_AFTER_HOURS_PAYMENT_TOOLS = [
  "lookup_wispro_by_cedula",
  "submit_payment_receipt",
  "get_bcv_rate",
  "link_wispro_client",
] as const;

export const DEFAULT_AFTER_HOURS_PAYMENTS: AfterHoursPaymentsConfig = {
  enabled: true,
  allowedTools: [...DEFAULT_AFTER_HOURS_PAYMENT_TOOLS],
};

/** Display order Mon→Sun for CRM settings UI. */
export const OFFICE_WEEKDAY_OPTIONS: Array<{
  key: WeekdayKey;
  label: string;
}> = [
  { key: "mon", label: "Lunes" },
  { key: "tue", label: "Martes" },
  { key: "wed", label: "Miércoles" },
  { key: "thu", label: "Jueves" },
  { key: "fri", label: "Viernes" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];

const WEEKDAY_BY_INDEX: WeekdayKey[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

const parseHmToMinutes = (value: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
};

/** Local calendar parts in the given IANA timezone. */
export const getZonedDateParts = (
  date: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  weekday: WeekdayKey;
  minutes: number;
} => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";

  const weekdayShort = read("weekday").toLowerCase();
  const weekdayMap: Record<string, WeekdayKey> = {
    sun: "sun",
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
  };

  const hours = Number(read("hour"));
  const minutes = Number(read("minute"));

  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    weekday:
      weekdayMap[weekdayShort] || WEEKDAY_BY_INDEX[date.getUTCDay()] || "mon",
    minutes:
      (Number.isFinite(hours) ? hours : 0) * 60 +
      (Number.isFinite(minutes) ? minutes : 0),
  };
};

const isHoliday = (
  parts: { year: number; month: number; day: number },
  holidays: string[] | undefined,
): boolean => {
  if (!holidays?.length) return false;
  const iso = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  return holidays.includes(iso);
};

const isInWindows = (
  minutesNow: number,
  windows: Array<[string, string]>,
): boolean => {
  for (const [start, end] of windows) {
    const startMin = parseHmToMinutes(start);
    const endMin = parseHmToMinutes(end);
    if (startMin === null || endMin === null) continue;
    if (startMin <= endMin) {
      if (minutesNow >= startMin && minutesNow < endMin) return true;
    } else {
      if (minutesNow >= startMin || minutesNow < endMin) return true;
    }
  }
  return false;
};

export const isWithinOfficeHours = (
  date: Date,
  config: OfficeHoursConfig = DEFAULT_OFFICE_HOURS,
): boolean => {
  if (!config.enabled) {
    return true;
  }

  const timeZone = config.timezone || DEFAULT_OFFICE_TIMEZONE;
  const parts = getZonedDateParts(date, timeZone);

  if (isHoliday(parts, config.holidays)) {
    return false;
  }

  const windows = config.days[parts.weekday] || [];
  if (!windows.length) {
    return false;
  }

  return isInWindows(parts.minutes, windows);
};

export const isOfficeClosed = (
  date: Date = new Date(),
  config: OfficeHoursConfig = DEFAULT_OFFICE_HOURS,
): boolean => !isWithinOfficeHours(date, config);

const WEEKDAY_LABEL_BY_KEY: Record<WeekdayKey, string> = {
  mon: "lunes",
  tue: "martes",
  wed: "miércoles",
  thu: "jueves",
  fri: "viernes",
  sat: "sábado",
  sun: "domingo",
};

export type OfficeHoursSnapshot = {
  enabled: boolean;
  closed: boolean;
  timezone: string;
  timezoneLabel: string;
  weeklySummary: string;
  nextOpenLabel: string | null;
  closesAtLabel: string | null;
  /** Prompt block injected on every AI run. */
  promptBlock: string;
  /** Client-facing notice when the office is closed; null if open or disabled. */
  clientNotice: string | null;
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const addCalendarDays = (
  parts: { year: number; month: number; day: number },
  offset: number,
) => {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offset));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: WEEKDAY_BY_INDEX[date.getUTCDay()] || "mon",
  };
};

export const formatOfficeClockForClient = (hhmm: string) => {
  const minutes = parseHmToMinutes(hhmm);
  if (minutes === null) return hhmm;
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const minsLabel = pad2(mins);
  if (hours24 === 0) return `12:${minsLabel} a.m.`;
  if (hours24 === 12) {
    return mins === 0 ? `12:00 m.` : `12:${minsLabel} p.m.`;
  }
  if (hours24 > 12) return `${hours24 - 12}:${minsLabel} p.m.`;
  return `${hours24}:${minsLabel} a.m.`;
};

const formatWindowsForClient = (windows: Array<[string, string]>) => {
  if (!windows.length) return "cerrado";
  return windows
    .map(
      ([start, end]) =>
        `${formatOfficeClockForClient(start)} a ${formatOfficeClockForClient(end)}`,
    )
    .join(" y ");
};

export const formatWeeklyOfficeHours = (config: OfficeHoursConfig) => {
  const lines: string[] = [];
  let index = 0;
  const order = OFFICE_WEEKDAY_OPTIONS;

  while (index < order.length) {
    const start = order[index];
    const signature = (config.days[start.key] || [])
      .map(([from, to]) => `${from}-${to}`)
      .join(",") || "closed";
    let endIndex = index;
    while (endIndex + 1 < order.length) {
      const next = order[endIndex + 1];
      const nextSignature =
        (config.days[next.key] || [])
          .map(([from, to]) => `${from}-${to}`)
          .join(",") || "closed";
      if (nextSignature !== signature) break;
      endIndex += 1;
    }

    const hoursText = formatWindowsForClient(config.days[start.key] || []);
    const label =
      endIndex === index
        ? start.label
        : `${start.label} a ${order[endIndex].label}`;
    lines.push(`${label}: ${hoursText}`);
    index = endIndex + 1;
  }

  return lines.join("; ");
};

const findCurrentWindowEnd = (
  minutesNow: number,
  windows: Array<[string, string]>,
) => {
  for (const [start, end] of windows) {
    const startMin = parseHmToMinutes(start);
    const endMin = parseHmToMinutes(end);
    if (startMin === null || endMin === null) continue;
    if (startMin <= endMin) {
      if (minutesNow >= startMin && minutesNow < endMin) return end;
    } else if (minutesNow >= startMin || minutesNow < endMin) {
      return end;
    }
  }
  return null;
};

const findNextOpen = (
  nowParts: ReturnType<typeof getZonedDateParts>,
  config: OfficeHoursConfig,
) => {
  for (let offset = 0; offset < 8; offset += 1) {
    const day = addCalendarDays(nowParts, offset);
    if (isHoliday(day, config.holidays)) continue;
    const windows = config.days[day.weekday] || [];
    for (const [start] of windows) {
      const startMin = parseHmToMinutes(start);
      if (startMin === null) continue;
      if (offset === 0 && startMin <= nowParts.minutes) continue;
      const weekdayLabel = WEEKDAY_LABEL_BY_KEY[day.weekday];
      const clock = formatOfficeClockForClient(start);
      if (offset === 0) return `hoy a las ${clock}`;
      if (offset === 1) return `mañana (${weekdayLabel}) a las ${clock}`;
      return `el ${weekdayLabel} a las ${clock}`;
    }
  }
  return null;
};

const timezoneLabelFor = (timezone: string) =>
  timezone === DEFAULT_OFFICE_TIMEZONE || timezone === "America/Caracas"
    ? "hora Venezuela"
    : timezone;

export const resolveOfficeHoursSnapshot = (
  now: Date = new Date(),
  config: OfficeHoursConfig = DEFAULT_OFFICE_HOURS,
): OfficeHoursSnapshot => {
  const timezone = config.timezone || DEFAULT_OFFICE_TIMEZONE;
  const timezoneLabel = timezoneLabelFor(timezone);
  const weeklySummary = formatWeeklyOfficeHours(config);
  const closed = isOfficeClosed(now, config);
  const parts = getZonedDateParts(now, timezone);
  const nextOpenLabel = config.enabled ? findNextOpen(parts, config) : null;
  const closesAtRaw = closed
    ? null
    : findCurrentWindowEnd(parts.minutes, config.days[parts.weekday] || []);
  const closesAtLabel = closesAtRaw
    ? `hoy a las ${formatOfficeClockForClient(closesAtRaw)}`
    : null;

  const clientNotice =
    config.enabled && closed
      ? [
          "En este momento la oficina está cerrada.",
          nextOpenLabel
            ? `Un asesor puede atenderte a partir de ${nextOpenLabel}.`
            : "Un asesor te atenderá en el próximo horario laboral.",
          `Horario: ${weeklySummary} (${timezoneLabel}).`,
        ].join(" ")
      : null;

  const promptBlock = [
    "Horario de asesores (inyectado por el sistema; no lo inventes ni lo redondees):",
    `- zona: ${timezone} (${timezoneLabel})`,
    `- regla_activa: ${config.enabled ? "sí" : "no"}`,
    `- estado_ahora: ${!config.enabled ? "ABIERTA (regla desactivada)" : closed ? "CERRADA" : "ABIERTA"}`,
    `- cierra: ${closesAtLabel || "N/D"}`,
    `- proxima_apertura: ${nextOpenLabel || "N/D"}`,
    `- semana: ${weeklySummary}`,
    "Reglas de horario:",
    "- Usa exactamente este horario si el cliente pregunta cuándo hay asesores o pide un humano.",
    "- Si estado_ahora es CERRADA: no digas “en breve”, “ahora mismo” ni actúes como si hubiera un asesor en línea.",
    "- Cerrada + pago/comprobante: registra el pago y di que un asesor lo revisa al abrir (usa proxima_apertura).",
    "- Cerrada + soporte u otra consulta: informa el horario y la próxima apertura; ofrece dejar el caso para el turno.",
    "- No repitas el horario si ya lo explicaste en los últimos mensajes del historial.",
  ].join("\n");

  return {
    enabled: config.enabled,
    closed,
    timezone,
    timezoneLabel,
    weeklySummary,
    nextOpenLabel,
    closesAtLabel,
    promptBlock,
    clientNotice,
  };
};

/** Appends the closed-office notice and avoids promising immediate human help. */
export const withClosedOfficeNotice = (
  message: string,
  snapshot: OfficeHoursSnapshot | null | undefined,
) => {
  const text = String(message || "").trim();
  if (!text) return snapshot?.clientNotice || text;
  if (!snapshot?.enabled || !snapshot.closed || !snapshot.clientNotice) {
    return text;
  }

  const alreadyMentionsHours =
    /oficina está cerrada|próximo horario|proxima_apertura|hora Venezuela/i.test(
      text,
    );
  const cleaned = text
    .replace(/\s*en breve/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .trim();

  if (alreadyMentionsHours) return cleaned || snapshot.clientNotice;
  return `${cleaned}\n\n${snapshot.clientNotice}`;
};

export const defaultAdvisorHandoffMessage = (
  snapshot: OfficeHoursSnapshot | null | undefined,
) =>
  withClosedOfficeNotice(
    "Un asesor de nuestro equipo continuará contigo en breve.",
    snapshot,
  );

const mergeDayWindows = (
  raw: unknown,
  fallback: Array<[string, string]>,
): Array<[string, string]> => {
  if (!Array.isArray(raw)) return fallback;
  const windows: Array<[string, string]> = [];
  for (const entry of raw) {
    if (
      Array.isArray(entry) &&
      entry.length >= 2 &&
      typeof entry[0] === "string" &&
      typeof entry[1] === "string"
    ) {
      windows.push([entry[0], entry[1]]);
    }
  }
  return windows;
};

export const parseOfficeHoursConfig = (raw: unknown): OfficeHoursConfig => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_OFFICE_HOURS;
  }

  const row = raw as Record<string, unknown>;
  const base = DEFAULT_OFFICE_HOURS;
  const daysRaw =
    row.days && typeof row.days === "object" && !Array.isArray(row.days)
      ? (row.days as Record<string, unknown>)
      : {};

  const days = { ...base.days } as OfficeHoursConfig["days"];
  for (const key of WEEKDAY_BY_INDEX) {
    if (key in daysRaw) {
      days[key] = mergeDayWindows(daysRaw[key], base.days[key]);
    }
  }

  const holidays = Array.isArray(row.holidays)
    ? row.holidays.filter((item): item is string => typeof item === "string")
    : base.holidays;

  return {
    enabled: row.enabled === undefined ? base.enabled : Boolean(row.enabled),
    timezone:
      typeof row.timezone === "string" && row.timezone.trim()
        ? row.timezone.trim()
        : base.timezone,
    days,
    holidays,
  };
};

export const parseAfterHoursPaymentsConfig = (
  raw: unknown,
): AfterHoursPaymentsConfig => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_AFTER_HOURS_PAYMENTS;
  }

  const row = raw as Record<string, unknown>;
  const allowedTools = Array.isArray(row.allowedTools)
    ? row.allowedTools.filter((item): item is string => typeof item === "string")
    : DEFAULT_AFTER_HOURS_PAYMENTS.allowedTools;

  return {
    enabled:
      row.enabled === undefined
        ? DEFAULT_AFTER_HOURS_PAYMENTS.enabled
        : Boolean(row.enabled),
    allowedTools: allowedTools.length
      ? allowedTools
      : [...DEFAULT_AFTER_HOURS_PAYMENT_TOOLS],
  };
};

/** Optional env override: CRM_OFFICE_HOURS_JSON */
export const resolveOfficeHoursFromEnv = (): OfficeHoursConfig => {
  const raw = process.env.CRM_OFFICE_HOURS_JSON?.trim();
  if (!raw) return DEFAULT_OFFICE_HOURS;
  try {
    return parseOfficeHoursConfig(JSON.parse(raw));
  } catch {
    console.warn("[OFFICE_HOURS] invalid CRM_OFFICE_HOURS_JSON, using defaults");
    return DEFAULT_OFFICE_HOURS;
  }
};

export const cloneOfficeHoursConfig = (
  config: OfficeHoursConfig,
): OfficeHoursConfig => ({
  enabled: config.enabled,
  timezone: config.timezone,
  holidays: [...(config.holidays || [])],
  days: {
    mon: config.days.mon.map((window) => [...window] as [string, string]),
    tue: config.days.tue.map((window) => [...window] as [string, string]),
    wed: config.days.wed.map((window) => [...window] as [string, string]),
    thu: config.days.thu.map((window) => [...window] as [string, string]),
    fri: config.days.fri.map((window) => [...window] as [string, string]),
    sat: config.days.sat.map((window) => [...window] as [string, string]),
    sun: config.days.sun.map((window) => [...window] as [string, string]),
  },
});
