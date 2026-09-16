import { CRM_COLORS } from "./constants";

/**
 * Removes unpaired UTF-16 surrogates that break JSON payloads (PostgREST PGRST102).
 * Well-formed emoji (paired surrogates) are kept.
 */
export const toJsonSafeText = (value: string | null | undefined) => {
  if (value == null) return value ?? null;

  let output = "";
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code == null) continue;
    if (code >= 0xd800 && code <= 0xdfff) continue;
    output += char;
  }

  return output;
};

/**
 * Initials Unicode-aware (emoji-safe): 2 letters from a single token,
 * or first letter of the first two words. Never indexes UTF-16 code units.
 */
export const getInitials = (value: string) => {
  const words = (value || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";

  if (words.length === 1) {
    const letters = [...words[0]].filter((char) => /\p{L}/u.test(char));
    return letters.slice(0, 2).join("").toUpperCase() || "??";
  }

  const letters = words
    .map((word) => [...word].find((char) => /\p{L}/u.test(char)))
    .filter((char): char is string => Boolean(char));

  return letters.slice(0, 2).join("").toUpperCase() || "??";
};

export const formatCrmTime = (value: string | null) => {
  if (!value) return "";

  return new Intl.DateTimeFormat("es-VE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

export const formatCrmDate = (value: string | null) => {
  if (!value) return "Sin fecha";

  return new Intl.DateTimeFormat("es-VE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

export const getCrmDateKeyFromDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getCrmDateKey = (value: string | null) => {
  if (!value) return "unknown";
  return getCrmDateKeyFromDate(new Date(value));
};

export const formatCrmDayLabel = (value: string | null) => {
  if (!value) return "Sin fecha";

  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const dateKey = getCrmDateKey(value);

  if (dateKey === getCrmDateKeyFromDate(today)) return "Hoy";
  if (dateKey === getCrmDateKeyFromDate(yesterday)) return "Ayer";

  const label = new Intl.DateTimeFormat("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(date.getFullYear() !== today.getFullYear()
      ? { year: "numeric" as const }
      : {}),
  }).format(date);

  // WhatsApp-style: capitalize first letter (es-VE often returns lowercase weekday).
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : label;
};

export type MessageDayGroupOf<T extends { created_at: string | null }> = {
  dateKey: string;
  label: string;
  messages: T[];
};

/** Group messages by local calendar day for WhatsApp-style date dividers. */
export const groupMessagesByDay = <T extends { created_at: string | null }>(
  messages: T[],
): MessageDayGroupOf<T>[] => {
  const sorted = [...messages].sort(
    (a, b) =>
      new Date(a.created_at || 0).getTime() -
      new Date(b.created_at || 0).getTime(),
  );
  const groups = new Map<string, MessageDayGroupOf<T>>();

  for (const message of sorted) {
    const dateKey = getCrmDateKey(message.created_at);
    const existing = groups.get(dateKey);

    if (existing) {
      existing.messages.push(message);
      continue;
    }

    groups.set(dateKey, {
      dateKey,
      label: formatCrmDayLabel(message.created_at),
      messages: [message],
    });
  }

  return Array.from(groups.values());
};

export const formatCrmResolvedLabel = (value: string | null) => {
  if (!value) return "Sin fecha de resolución";

  return new Intl.DateTimeFormat("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

export const getColorByIndex = (index: number) => CRM_COLORS[index % CRM_COLORS.length];

export const createTicketId = () => {
  const suffix = String(Date.now() % 10000).padStart(4, "0");
  return `TK-${suffix}`;
};
