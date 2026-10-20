const pad = (value: number) => String(value).padStart(2, "0");

export const toDatetimeLocalValue = (iso: string | null | undefined) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const datetimeLocalToIso = (value: string | null | undefined) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

export const assertVisitWindowRange = (
  startIso: string | null,
  endIso: string | null,
) => {
  if (!startIso || !endIso) return { ok: true as const };
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return { ok: false as const, error: "invalid_window" };
  }
  if (end < start) {
    return { ok: false as const, error: "end_before_start" };
  }
  return { ok: true as const };
};
