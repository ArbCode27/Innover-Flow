/**
 * Pure Wispro CRM rules. No I/O — unit-tested without the Wispro HTTP client.
 */

export const PAYMENT_ROUNDING_TOLERANCE_USD = 0.15;
export const INVOICE_MIN_BALANCE_USD = 0.01;
export const DEFAULT_FULL_PAYMENT_TOLERANCE_USD = 0.5;
export const VE_DOCUMENT_PREFIXES = ["V", "E", "J", "G"] as const;

export const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export const parseAmount = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim().replace(",", "."));
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

/** Digits only (cédula/RIF without letter). */
export const normalizeDocumentDigits = (raw: string): string =>
  String(raw || "").replace(/\D/g, "");

/**
 * Exact Wispro `_eq` candidates for a numeric document.
 * Order: bare digits first, then V/E/J/G + digits (no hyphens).
 */
export const buildVeDocumentCandidates = (digits: string): string[] => {
  const normalized = normalizeDocumentDigits(digits);
  if (!normalized) return [];

  return [
    ...new Set([
      normalized,
      ...VE_DOCUMENT_PREFIXES.map((prefix) => `${prefix}${normalized}`),
    ]),
  ];
};

/**
 * Live debt from current_account.balance_amount.
 * Negative balance = subscriber owes money. Positive = credit (do not collect).
 */
export const resolveDebtFromCurrentAccount = (account: {
  balance_amount?: number | null;
} | null): number => {
  const balanceAmount = account?.balance_amount ?? 0;
  if (balanceAmount < 0) {
    return roundMoney(Math.abs(balanceAmount));
  }
  return 0;
};

export const isFullPayment = (
  amountUsd: number,
  debtUsd: number,
  toleranceUsd = DEFAULT_FULL_PAYMENT_TOLERANCE_USD,
): boolean => {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return false;
  const debt = Number.isFinite(debtUsd) ? Math.max(0, debtUsd) : 0;
  const tolerance =
    Number.isFinite(toleranceUsd) && toleranceUsd >= 0
      ? toleranceUsd
      : DEFAULT_FULL_PAYMENT_TOLERANCE_USD;
  return roundMoney(amountUsd) + roundMoney(tolerance) >= roundMoney(debt);
};

/** Commercial plan price: numeric field first, then "$" in the name (e.g. "Plan 30$"). */
export const parseCommercialPlanPrice = (input: {
  name?: string | null;
  price?: unknown;
}): number | null => {
  const fromField = parseAmount(input.price);
  if (fromField > 0) return roundMoney(fromField);

  const name = String(input.name || "");
  const withDollar = name.match(
    /(?:\$\s*(\d+(?:[.,]\d{1,2})?))|(?:(\d+(?:[.,]\d{1,2})?)\s*\$)/,
  );
  if (!withDollar) return null;
  const raw = withDollar[1] || withDollar[2] || "";
  const parsed = parseAmount(raw.replace(",", "."));
  return parsed > 0 ? roundMoney(parsed) : null;
};

export const unaccentLower = (value: string): string =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export const matchesNameLocally = (name: string, query: string): boolean => {
  const needle = unaccentLower(query);
  if (!needle) return false;
  return unaccentLower(name).includes(needle);
};

/** Issue without dashes = legacy Wispro help_desk id. */
export const isLegacyWisproIssueId = (id: string | null | undefined): boolean => {
  const trimmed = String(id || "").trim();
  return Boolean(trimmed) && !trimmed.includes("-");
};

/** Order that does not start with "ord-" = legacy Wispro order. */
export const isLegacyWisproOrderId = (id: string | null | undefined): boolean => {
  const trimmed = String(id || "").trim();
  return Boolean(trimmed) && !trimmed.startsWith("ord-");
};

export const localWisproOrderId = (ticketId: string): string =>
  `ord-${String(ticketId || "").trim()}`;

export const parseSupervisorEmployeeIds = (
  raw: string | null | undefined = process.env.WISPRO_SUPERVISOR_EMPLOYEE_IDS,
): string[] =>
  String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/** Two CRM rows point to the same Wispro customer. */
export const canShareWisproId = (
  leftWisproId: string | null | undefined,
  rightWisproId: string | null | undefined,
): boolean => {
  const left = String(leftWisproId || "").trim();
  const right = String(rightWisproId || "").trim();
  return Boolean(left) && left === right;
};

export type WisproInvoiceBalance = {
  id: string;
  balance: number;
  amount: number;
  issuedAt: string | null;
  firstDueDate: string | null;
  periodTo?: string | null;
  invoiceNumber: string | null;
  state: string | null;
};

export type ApprovePaymentKind =
  | "rounded"
  | "partial"
  | "credit"
  | "exact"
  | "account_credit";

export type ApprovePaymentDecision = {
  kind: ApprovePaymentKind;
  strategy: "single_latest" | "none";
  postAmount: number;
  paidAmount: number;
  expectedAmount: number;
  remainingAmount: number;
  planAmount: number | null;
  invoiceIds: string[];
  ignoredInvoiceIds: string[];
  invoice: {
    id: string;
    balance: number;
    invoiceNumber: string | null;
    issuedAt: string | null;
  } | null;
  comment: string;
};

const invoiceRecencyMs = (invoice: WisproInvoiceBalance) =>
  Date.parse(invoice.issuedAt || invoice.periodTo || invoice.firstDueDate || "") ||
  0;

export const pickLatestOpenInvoice = (
  invoices: WisproInvoiceBalance[],
): WisproInvoiceBalance | null => {
  const open = invoices.filter(
    (invoice) =>
      Boolean(invoice.id) &&
      Number.isFinite(invoice.balance) &&
      invoice.balance > INVOICE_MIN_BALANCE_USD,
  );
  if (!open.length) return null;

  return [...open].sort((left, right) => {
    const leftMs = invoiceRecencyMs(left);
    const rightMs = invoiceRecencyMs(right);
    if (leftMs !== rightMs) return rightMs - leftMs;
    return right.id.localeCompare(left.id);
  })[0];
};

const describeApproveDecision = (input: {
  kind: ApprovePaymentKind;
  paid: number;
  expected: number;
  remaining: number;
  invoiceId: string | null;
  planAmount: number | null;
}): string => {
  const parts: string[] = [];

  if (input.kind === "rounded") {
    parts.push(
      `Redondeo $${PAYMENT_ROUNDING_TOLERANCE_USD.toFixed(2)}: se posteó ${input.expected.toFixed(2)} (pagó ${input.paid.toFixed(2)})`,
    );
  } else if (input.kind === "partial") {
    parts.push(
      `Pago parcial: se posteó ${input.paid.toFixed(2)}; restante ${input.remaining.toFixed(2)}`,
    );
  } else if (input.kind === "credit") {
    parts.push(
      `Saldo a favor: se posteó ${input.paid.toFixed(2)} (expected ${input.expected.toFixed(2)})`,
    );
  } else if (input.kind === "exact") {
    parts.push(`Pago exacto ${input.paid.toFixed(2)}`);
  } else {
    parts.push("Sin facturas vinculadas (crédito a current_account)");
    if (input.planAmount && input.planAmount > 0) {
      parts.push(`Precio plan ${input.planAmount.toFixed(2)}`);
    }
  }

  if (input.invoiceId) {
    parts.push(`Factura: ${input.invoiceId}`);
  }

  return parts.join(" | ");
};

export const resolveApprovePayment = (input: {
  paidAmount: number;
  invoices: WisproInvoiceBalance[];
  planAmount?: number | null;
}): ApprovePaymentDecision => {
  const paidAmount = roundMoney(input.paidAmount);
  const planAmount =
    typeof input.planAmount === "number" && input.planAmount > 0
      ? roundMoney(input.planAmount)
      : null;
  const invoice = pickLatestOpenInvoice(input.invoices);
  const ignoredInvoiceIds = input.invoices
    .filter(
      (item) =>
        item.id &&
        item.id !== invoice?.id &&
        Number.isFinite(item.balance) &&
        item.balance > INVOICE_MIN_BALANCE_USD,
    )
    .map((item) => item.id);

  if (!invoice) {
    const expectedAmount = planAmount ?? paidAmount;
    return {
      kind: "account_credit",
      strategy: "none",
      postAmount: paidAmount,
      paidAmount,
      expectedAmount,
      remainingAmount: 0,
      planAmount,
      invoiceIds: [],
      ignoredInvoiceIds,
      invoice: null,
      comment: describeApproveDecision({
        kind: "account_credit",
        paid: paidAmount,
        expected: expectedAmount,
        remaining: 0,
        invoiceId: null,
        planAmount,
      }),
    };
  }

  const expectedAmount = roundMoney(invoice.balance);
  const shortfall = roundMoney(expectedAmount - paidAmount);
  const overpay = roundMoney(paidAmount - expectedAmount);

  let kind: ApprovePaymentKind = "exact";
  let postAmount = paidAmount;
  let remainingAmount = 0;

  if (shortfall > 0 && shortfall <= PAYMENT_ROUNDING_TOLERANCE_USD) {
    kind = "rounded";
    postAmount = expectedAmount;
  } else if (shortfall > PAYMENT_ROUNDING_TOLERANCE_USD) {
    kind = "partial";
    remainingAmount = shortfall;
  } else if (overpay > PAYMENT_ROUNDING_TOLERANCE_USD) {
    kind = "credit";
  }

  return {
    kind,
    strategy: "single_latest",
    postAmount,
    paidAmount,
    expectedAmount,
    remainingAmount,
    planAmount,
    invoiceIds: [invoice.id],
    ignoredInvoiceIds,
    invoice: {
      id: invoice.id,
      balance: invoice.balance,
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: invoice.issuedAt,
    },
    comment: describeApproveDecision({
      kind,
      paid: paidAmount,
      expected: expectedAmount,
      remaining: remainingAmount,
      invoiceId: invoice.id,
      planAmount,
    }),
  };
};
