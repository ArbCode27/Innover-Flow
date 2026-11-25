import type { SaePaymentSnapshot } from "@/lib/sae-cuentas";

export const CRM_PAYMENT_STATUSES = [
  "RECIBIDO",
  "EN_PROCESO",
  "APROBADO",
  "RECHAZADO",
  "DUPLICADO",
  "ERROR",
] as const;

export type CrmPaymentStatus = (typeof CRM_PAYMENT_STATUSES)[number];

export const CRM_PAYMENT_STATUS_LABELS: Record<CrmPaymentStatus, string> = {
  RECIBIDO: "Recibido",
  EN_PROCESO: "En proceso",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
  DUPLICADO: "Duplicado",
  ERROR: "Error",
};

export const PAYMENT_PENDING_LABEL = "Pendiente";

export const CRM_KNOWN_PAYMENT_BANKS = [
  "Bancamiga",
  "Banplus",
  "Binance",
  "Tarjeta de Débito",
  "Zelle",
  "PayPal",
] as const;

export const CRM_EXCLUDED_RECEPTOR_BANKS = ["Venezuela", "BDV"] as const;

export type CrmPayment = {
  id: string;
  client_id: number | null;
  conversation_id: number | null;
  message_id: number | null;
  submitted_by_agent_id: number | null;
  wispro_client_id: string | null;
  client_name: string | null;
  cedula: string | null;
  phone_id: string | null;
  amount: number | null;
  expected_amount?: number | null;
  plan_amount?: number | null;
  amount_raw: string | null;
  bank: string | null;
  receptor_bank?: string | null;
  transaction_code: string | null;
  payment_date: string;
  comment: string | null;
  status: CrmPaymentStatus;
  source: string;
  external_payment_id: string | null;
  external_api_status: number | null;
  error_message: string | null;
  receipt_media_url: string | null;
  /** Most recent pending Wispro invoice date (YYYY-MM-DD), when available. */
  latest_invoice_date?: string | null;
  approved_at?: string | null;
  /** Etapa SAE del mismo comprobante: registro y luego conciliación. */
  sae?: SaePaymentSnapshot | null;
  created_at: string;
  updated_at: string;
};

export type CrmPaymentStatusCounts = Record<CrmPaymentStatus, number>;

export type CrmPaymentBankStat = {
  bank: string;
  totalPayments: number;
  totalAmount: number;
  approvedCount: number;
  approvedAmount: number;
  inProcessCount: number;
  inProcessAmount: number;
};

export type CrmPaymentsListResponse = {
  ok: true;
  payments: CrmPayment[];
  total: number;
  counts: CrmPaymentStatusCounts;
  banks: string[];
  bankStats?: CrmPaymentBankStat[];
  /** Cuentas receptoras de SAE. Nulo cuando la bandeja usa las seis cuentas fijas. */
  bankSeeds?: string[] | null;
  limit: number;
  offset: number;
};

const digitsOnly = (value: string | null | undefined) =>
  String(value || "").replace(/\D/g, "");

export const formatPaymentField = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return PAYMENT_PENDING_LABEL;
  const text = String(value).trim();
  return text || PAYMENT_PENDING_LABEL;
};

export const formatPaymentAmount = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) {
    return PAYMENT_PENDING_LABEL;
  }

  return new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number(amount));
};

export const isValidPaymentReference = (value: string | null | undefined) => {
  const text = String(value || "").trim();
  if (!text) return false;
  return /\d/.test(text) || text.length >= 3;
};

export const isPaymentReadyForApproval = (payment: {
  status: CrmPaymentStatus;
  wispro_client_id: string | null;
  cedula: string | null;
  bank: string | null;
  transaction_code: string | null;
  amount: number | null;
}) => {
  if (payment.status !== "EN_PROCESO" && payment.status !== "ERROR") {
    return false;
  }

  const hasBillingIdentity = Boolean(
    payment.wispro_client_id?.trim() || String(payment.cedula || "").trim(),
  );

  return Boolean(
    hasBillingIdentity &&
      String(payment.bank || "").trim() &&
      isValidPaymentReference(payment.transaction_code) &&
      Number(payment.amount) > 0,
  );
};

export const canApprovePaymentManually = (payment: { amount: number | null }) =>
  Number(payment.amount) > 0;

export const formatPlanPriceLabel = (amount: number | null | undefined) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return "—";

  const text = Number.isInteger(value)
    ? new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 }).format(value)
    : new Intl.NumberFormat("es-VE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);

  return `Plan ${text}$`;
};

export const getPaymentAmountDelta = (payment: {
  amount: number | null;
  expected_amount?: number | null;
}) => {
  const paid = Number(payment.amount);
  const expected = Number(payment.expected_amount);
  if (!Number.isFinite(paid) || !Number.isFinite(expected) || expected <= 0) {
    return null;
  }

  const diff = Math.round((expected - paid) * 100) / 100;
  if (diff > 0.009) return { kind: "remaining" as const, amount: diff };
  if (diff < -0.009) return { kind: "credit" as const, amount: Math.abs(diff) };
  return null;
};

export const canRejectPayment = (payment: { status: CrmPaymentStatus }) =>
  payment.status === "RECIBIDO" ||
  payment.status === "EN_PROCESO" ||
  payment.status === "ERROR";

export const formatPaymentDate = (value: string) => {
  const dateOnly = value.slice(0, 10);
  const [year, month, day] = dateOnly.split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
};

export const formatPaymentDateTime = (value: string) =>
  new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

/**
 * Normaliza y extrae el BANCO RECEPTOR (cuenta de destino de la empresa)
 * ignorando bancos emisores u origen del cliente.
 */
export const normalizeReceptorBank = (
  raw: string | null | undefined,
): string | null => {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // 1. Detección de patrones con prefijo o preposición de destino
  let candidate = trimmed;

  // Patrón "Desde X hacia/a/para Y", "De X a Y", "X -> Y", "X => Y"
  const arrowMatch = candidate.match(
    /(?:->|=>|→|\bhacia\b|\bpara\b|\ba\b)\s+([^->=→]+)$/i,
  );
  if (arrowMatch?.[1]?.trim()) {
    candidate = arrowMatch[1].trim();
  } else {
    // Patrón "Destino: X", "Banco receptor: X", "Destinatario: X", "Acreditado a: X"
    const prefixMatch = candidate.match(
      /(?:banco\s+)?(?:destino|receptor|destinatario|acreditado\s+(?:a|en)|cuenta\s+destino)\s*[:\-]?\s*(.+)$/i,
    );
    if (prefixMatch?.[1]?.trim()) {
      candidate = prefixMatch[1].trim();
    }
  }

  // 2. Mapeo a nombres canónicos conocidos
  const clean = candidate
    .replace(/[.,:;()_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const lower = clean
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Banco de Venezuela / BDV: se reconoce, pero no entra en tarjetas ni selector.
  if (
    /\b(venezuela|bdv)\b/.test(lower) ||
    lower.includes("banco de venezuela") ||
    lower === "bdv"
  ) {
    return "Venezuela";
  }

  if (lower.includes("bancamiga") || /\bamiga\b/.test(lower)) {
    return "Bancamiga";
  }

  if (lower.includes("banplus")) {
    return "Banplus";
  }

  if (lower.includes("binance") || /\busdt\b/.test(lower)) {
    return "Binance";
  }

  if (
    lower.includes("tarjeta") ||
    lower.includes("debito") ||
    lower.includes("punto de venta") ||
    /\bpos\b/.test(lower)
  ) {
    return "Tarjeta de Débito";
  }

  if (lower.includes("zelle")) {
    return "Zelle";
  }

  if (lower.includes("paypal")) {
    return "PayPal";
  }

  // Otros bancos venezolanos habituales
  if (lower.includes("banesco")) return "Banesco";
  if (lower.includes("mercantil")) return "Mercantil";
  if (lower.includes("provincial") || lower.includes("bbva")) return "Provincial";
  if (/\bbnc\b/.test(lower) || lower.includes("nacional de credito")) return "BNC";
  if (lower.includes("bancaribe") || lower.includes("del caribe")) return "Bancaribe";
  if (lower.includes("bicentenario")) return "Bicentenario";
  if (lower.includes("exterior")) return "Exterior";
  if (lower.includes("activo")) return "Activo";
  if (lower.includes("plaza")) return "Plaza";
  if (/\bbfc\b/.test(lower) || lower.includes("fondo comun")) return "BFC";
  if (lower.includes("tesoro")) return "Tesoro";
  if (lower.includes("100%")) return "100% Banco";
  // 3. Limpieza de prefijos/sufijos para bancos personalizados válidos
  let stripped = clean
    .replace(/^(?:banco\s+(?:de\s+|del\s+)?|bco\.?\s+)/i, "")
    .replace(/\s+(?:banco\s+universal|banco\s+comercial|c\.?a\.?|s\.?a\.?)$/i, "")
    .trim();

  if (stripped.length >= 2) {
    // Capitalizar cada palabra (Title Case)
    return stripped
      .split(/\s+/)
      .map((word) =>
        word.length > 2
          ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          : word.toUpperCase(),
      )
      .join(" ");
  }

  return clean || null;
};

export type ReceptorColorScheme =
  | "emerald"
  | "blue"
  | "amber"
  | "violet"
  | "sky"
  | "indigo"
  | "red"
  | "purple";

export type ReceptorBankMeta = {
  bank: string;
  displayName: string;
  subtitle: string;
  shortCode: string;
  colorScheme: ReceptorColorScheme;
};

export const isExcludedReceptorBank = (bank: string | null | undefined) => {
  const normalized = normalizeReceptorBank(bank) || String(bank || "").trim();
  if (!normalized) return false;
  const lowered = normalized
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return (
    lowered === "venezuela" ||
    lowered === "bdv" ||
    lowered === "banco de venezuela"
  );
};

export const receptorBankKey = (bank: string | null | undefined) => {
  const normalized = normalizeReceptorBank(bank);
  if (!normalized || isExcludedReceptorBank(normalized)) return null;
  return normalized;
};

export const countablePaymentAmount = (amount: number | null | undefined) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100) / 100;
};

export const roundPaymentAmount = (amount: number) =>
  Math.max(0, Math.round(amount * 100) / 100);

export const getReceptorBankMeta = (bank: string): ReceptorBankMeta => {
  const normalized = normalizeReceptorBank(bank) || bank;
  switch (normalized) {
    case "Venezuela":
      return {
        bank: "Venezuela",
        displayName: "Banco de Venezuela",
        subtitle: "BDV · Receptor",
        shortCode: "BDV",
        colorScheme: "red",
      };
    case "Bancamiga":
      return {
        bank: "Bancamiga",
        displayName: "Bancamiga",
        subtitle: "Bancamiga · Receptor",
        shortCode: "Bancamiga",
        colorScheme: "emerald",
      };
    case "Banplus":
      return {
        bank: "Banplus",
        displayName: "Banplus",
        subtitle: "Banplus · Receptor",
        shortCode: "Banplus",
        colorScheme: "blue",
      };
    case "Binance":
      return {
        bank: "Binance",
        displayName: "Binance",
        subtitle: "USDT · Cripto",
        shortCode: "BNB",
        colorScheme: "amber",
      };
    case "Tarjeta de Débito":
      return {
        bank: "Tarjeta de Débito",
        displayName: "Tarjeta de Débito",
        subtitle: "Punto de venta · POS",
        shortCode: "POS",
        colorScheme: "violet",
      };
    case "Zelle":
      return {
        bank: "Zelle",
        displayName: "Zelle",
        subtitle: "Zelle · Receptor",
        shortCode: "Zelle",
        colorScheme: "sky",
      };
    case "PayPal":
      return {
        bank: "PayPal",
        displayName: "PayPal",
        subtitle: "PayPal · Receptor",
        shortCode: "PayPal",
        colorScheme: "indigo",
      };
    default:
      return {
        bank: normalized,
        displayName: normalized,
        subtitle: `${normalized} · Receptor`,
        shortCode: normalized.slice(0, 4).toUpperCase(),
        colorScheme: "purple",
      };
  }
};

const emptyBankStat = (bank: string): CrmPaymentBankStat => ({
  bank,
  totalPayments: 0,
  totalAmount: 0,
  approvedCount: 0,
  approvedAmount: 0,
  inProcessCount: 0,
  inProcessAmount: 0,
});

const addAmountToStat = (
  stat: CrmPaymentBankStat,
  row: { amount: number | null; status: string },
  direction: 1 | -1,
) => {
  const money = countablePaymentAmount(row.amount);
  const next = { ...stat };
  next.totalPayments = Math.max(0, next.totalPayments + direction);
  next.totalAmount = roundPaymentAmount(next.totalAmount + direction * money);

  const status = String(row.status || "").toUpperCase();
  if (status === "APROBADO") {
    next.approvedCount = Math.max(0, next.approvedCount + direction);
    next.approvedAmount = roundPaymentAmount(next.approvedAmount + direction * money);
  } else if (status === "EN_PROCESO" || status === "RECIBIDO") {
    next.inProcessCount = Math.max(0, next.inProcessCount + direction);
    next.inProcessAmount = roundPaymentAmount(
      next.inProcessAmount + direction * money,
    );
  }

  return next;
};

/**
 * Agrupa por cuenta receptora.
 * Sin `seedBanks` siembra las seis cuentas fijas y omite Venezuela/BDV.
 * Con `seedBanks` (cuentas activas de SAE) respeta ese orden e incluye Venezuela.
 */
export const buildPaymentBankStats = (
  rows: Array<{
    bank: string | null;
    amount: number | null;
    status: string;
  }>,
  options?: { includeExcluded?: boolean; seedBanks?: string[] },
): CrmPaymentBankStat[] => {
  const includeExcluded = options?.includeExcluded ?? false;
  const seedBanks = (options?.seedBanks || [...CRM_KNOWN_PAYMENT_BANKS]).filter(
    (bank, index, all) => bank.trim() && all.indexOf(bank) === index,
  );
  const seedSet = new Set(seedBanks);
  const map = new Map<string, CrmPaymentBankStat>();

  for (const bank of seedBanks) {
    map.set(bank, emptyBankStat(bank));
  }

  for (const row of rows) {
    const normalized = normalizeReceptorBank(row.bank);
    if (!normalized) continue;
    const kept =
      includeExcluded || seedSet.has(normalized) || !isExcludedReceptorBank(normalized);
    if (!kept) continue;

    const stat = map.get(normalized) ?? emptyBankStat(normalized);
    map.set(normalized, addAmountToStat(stat, row, 1));
  }

  const known = seedBanks.map((bank) => map.get(bank) ?? emptyBankStat(bank));
  const others = Array.from(map.values())
    .filter((stat) => !seedSet.has(stat.bank))
    .sort((a, b) => a.bank.localeCompare(b.bank, "es"));

  return [...known, ...others];
};

export const applyPaymentToBankStats = (
  stats: CrmPaymentBankStat[],
  payment: { bank: string | null; amount: number | null; status: string },
  direction: 1 | -1,
): CrmPaymentBankStat[] => {
  const normalized = normalizeReceptorBank(payment.bank);
  if (!normalized) return stats;
  if (
    isExcludedReceptorBank(normalized) &&
    !stats.some((stat) => stat.bank === normalized)
  ) {
    return stats;
  }

  const next = stats.some((stat) => stat.bank === normalized)
    ? stats
    : [...stats, emptyBankStat(normalized)];

  return next.map((stat) =>
    stat.bank === normalized ? addAmountToStat(stat, payment, direction) : stat,
  );
};
