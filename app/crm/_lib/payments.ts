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
  "Venezuela",
  "Banplus",
  "Bancamiga",
] as const;

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

  return Boolean(
    payment.wispro_client_id?.trim() &&
      digitsOnly(payment.cedula) &&
      String(payment.bank || "").trim() &&
      digitsOnly(payment.transaction_code) &&
      Number(payment.amount) > 0,
  );
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

  // Banco de Venezuela / BDV
  if (
    /\b(venezuela|bdv)\b/.test(lower) ||
    lower.includes("banco de venezuela") ||
    lower === "bdv"
  ) {
    return "Venezuela";
  }

  // Bancamiga
  if (lower.includes("bancamiga")) {
    return "Bancamiga";
  }

  // Banplus
  if (lower.includes("banplus")) {
    return "Banplus";
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
  if (lower.includes("zelle")) return "Zelle";
  if (lower.includes("binance")) return "Binance";
  if (lower.includes("paypal")) return "PayPal";

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

export type ReceptorBankMeta = {
  bank: string;
  displayName: string;
  subtitle: string;
  shortCode: string;
  colorScheme: "red" | "emerald" | "blue" | "purple";
};

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

/**
 * Agrupa y calcula métricas por banco receptor para el rango analizado.
 * Garantiza que los bancos canónicos conocidos (Venezuela, Banplus, Bancamiga)
 * figuren siempre sembrados en la respuesta, incluso con 0 pagos.
 */
export const buildPaymentBankStats = (
  rows: Array<{
    bank: string | null;
    amount: number | null;
    status: string;
  }>,
): CrmPaymentBankStat[] => {
  const map = new Map<string, CrmPaymentBankStat>();

  // Sembrar siempre los bancos canónicos
  for (const canonical of CRM_KNOWN_PAYMENT_BANKS) {
    map.set(canonical, {
      bank: canonical,
      totalPayments: 0,
      totalAmount: 0,
      approvedCount: 0,
      approvedAmount: 0,
      inProcessCount: 0,
      inProcessAmount: 0,
    });
  }

  for (const row of rows) {
    const rawBank = row.bank;
    const normalized = normalizeReceptorBank(rawBank) || "Otro";
    let stat = map.get(normalized);
    if (!stat) {
      stat = {
        bank: normalized,
        totalPayments: 0,
        totalAmount: 0,
        approvedCount: 0,
        approvedAmount: 0,
        inProcessCount: 0,
        inProcessAmount: 0,
      };
      map.set(normalized, stat);
    }

    const amt =
      typeof row.amount === "number" && Number.isFinite(row.amount)
        ? row.amount
        : 0;

    stat.totalPayments += 1;
    stat.totalAmount = Math.round((stat.totalAmount + amt) * 100) / 100;

    const st = String(row.status || "").toUpperCase();
    if (st === "APROBADO") {
      stat.approvedCount += 1;
      stat.approvedAmount =
        Math.round((stat.approvedAmount + amt) * 100) / 100;
    } else if (st === "EN_PROCESO" || st === "RECIBIDO") {
      stat.inProcessCount += 1;
      stat.inProcessAmount =
        Math.round((stat.inProcessAmount + amt) * 100) / 100;
    }
  }

  // Bancos canónicos primero, luego otros en orden alfabético
  const canonicalSet = new Set<string>(CRM_KNOWN_PAYMENT_BANKS);
  const result: CrmPaymentBankStat[] = [];
  for (const canonical of CRM_KNOWN_PAYMENT_BANKS) {
    const s = map.get(canonical);
    if (s) result.push(s);
  }

  const others = Array.from(map.values())
    .filter((s) => !canonicalSet.has(s.bank))
    .sort((a, b) => a.bank.localeCompare(b.bank));

  return [...result, ...others];
};
