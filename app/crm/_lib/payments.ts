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

export type CrmPaymentsListResponse = {
  ok: true;
  payments: CrmPayment[];
  total: number;
  counts: CrmPaymentStatusCounts;
  banks: string[];
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
