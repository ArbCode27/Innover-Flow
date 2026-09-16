/**
 * Deterministic invoice ↔ payment amount matching for Wispro approval.
 * Keep this pure (no I/O) so it can be unit-tested without API calls.
 */

export type WisproInvoiceBalance = {
  id: string;
  balance: number;
  amount: number;
  issuedAt: string | null;
  firstDueDate: string | null;
  invoiceNumber: string | null;
  state: string | null;
};

export type InvoiceMatchStrategy =
  | "exact_one"
  | "fifo_exact_sum"
  | "fifo_cover"
  | "none";

export type InvoiceMatchResult = {
  invoiceIds: string[];
  strategy: InvoiceMatchStrategy;
  matchedAmount: number;
  unmatchedAmount: number;
  invoices: Array<{
    id: string;
    balance: number;
    invoiceNumber: string | null;
  }>;
};

const MONEY_EPS = 0.015;

const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const nearlyEqual = (left: number, right: number) =>
  Math.abs(left - right) <= MONEY_EPS;

const invoiceRecencyKey = (invoice: WisproInvoiceBalance) =>
  Date.parse(invoice.firstDueDate || invoice.issuedAt || "") || 0;

/** Open invoices sorted oldest-first (FIFO by due/issue date). */
export const sortInvoicesFifo = (
  invoices: WisproInvoiceBalance[],
): WisproInvoiceBalance[] =>
  [...invoices].sort((left, right) => {
    const leftKey = invoiceRecencyKey(left);
    const rightKey = invoiceRecencyKey(right);
    if (leftKey !== rightKey) return leftKey - rightKey;
    return left.id.localeCompare(right.id);
  });

/**
 * Pick invoice UUIDs to send as `invoice_ids` on POST /invoicing/payments.
 * Prefer exact single match, then exact FIFO sum, then FIFO cover of the payment.
 */
export const matchInvoicesToPaymentAmount = (
  invoices: WisproInvoiceBalance[],
  paymentAmount: number,
): InvoiceMatchResult => {
  const amount = roundMoney(paymentAmount);
  const open = sortInvoicesFifo(
    invoices.filter(
      (invoice) =>
        invoice.id &&
        Number.isFinite(invoice.balance) &&
        invoice.balance > MONEY_EPS,
    ),
  );

  const empty = (): InvoiceMatchResult => ({
    invoiceIds: [],
    strategy: "none",
    matchedAmount: 0,
    unmatchedAmount: amount,
    invoices: [],
  });

  if (!Number.isFinite(amount) || amount <= 0 || !open.length) {
    return empty();
  }

  const exactOne = open.find((invoice) => nearlyEqual(invoice.balance, amount));
  if (exactOne) {
    return {
      invoiceIds: [exactOne.id],
      strategy: "exact_one",
      matchedAmount: roundMoney(exactOne.balance),
      unmatchedAmount: 0,
      invoices: [
        {
          id: exactOne.id,
          balance: exactOne.balance,
          invoiceNumber: exactOne.invoiceNumber,
        },
      ],
    };
  }

  const selected: WisproInvoiceBalance[] = [];
  let running = 0;

  for (const invoice of open) {
    selected.push(invoice);
    running = roundMoney(running + invoice.balance);
    if (nearlyEqual(running, amount)) {
      return {
        invoiceIds: selected.map((item) => item.id),
        strategy: "fifo_exact_sum",
        matchedAmount: running,
        unmatchedAmount: 0,
        invoices: selected.map((item) => ({
          id: item.id,
          balance: item.balance,
          invoiceNumber: item.invoiceNumber,
        })),
      };
    }
    if (running > amount + MONEY_EPS) {
      // Last invoice overshoots: still attach all selected so Wispro allocates.
      return {
        invoiceIds: selected.map((item) => item.id),
        strategy: "fifo_cover",
        matchedAmount: amount,
        unmatchedAmount: 0,
        invoices: selected.map((item) => ({
          id: item.id,
          balance: item.balance,
          invoiceNumber: item.invoiceNumber,
        })),
      };
    }
  }

  if (selected.length && running + MONEY_EPS < amount) {
    return {
      invoiceIds: selected.map((item) => item.id),
      strategy: "fifo_cover",
      matchedAmount: running,
      unmatchedAmount: roundMoney(amount - running),
      invoices: selected.map((item) => ({
        id: item.id,
        balance: item.balance,
        invoiceNumber: item.invoiceNumber,
      })),
    };
  }

  return empty();
};
