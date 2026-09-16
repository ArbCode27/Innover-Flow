import type {
  WisproCustomer,
  WisproInvoicingSummary,
  WisproSearchResult,
} from "./types";

export interface WisproWebhookSection {
  data?: unknown[];
  meta?: { object?: string; [key: string]: unknown };
  status?: number;
}

/** Webhook Make/Wispro: `{ client, envoicing }` o legacy `{ data: [...] }`. */
export interface WisproWebhookResponse {
  client?: WisproWebhookSection;
  envoicing?: WisproWebhookSection;
  data?: unknown[];
}

const readString = (
  record: Record<string, unknown>,
  keys: string[],
): string | null => {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }

    if (typeof value === "number" && !Number.isNaN(value)) {
      return String(value);
    }
  }

  return null;
};

const parseAmount = (value: unknown): number => {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim());
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
};

const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const extractSectionRecords = (
  section: WisproWebhookSection | undefined,
  sectionName: string,
): unknown[] => {
  if (section == null) return [];

  const { status, data } = section;

  if (status != null && status !== 200) {
    console.warn(`[Wispro webhook] ${sectionName}.status no exitoso:`, status);
    return [];
  }

  return Array.isArray(data) ? data : [];
};

export const extractClientRecords = (proxyData: unknown): unknown[] => {
  if (!proxyData || typeof proxyData !== "object") return [];

  const root = proxyData as WisproWebhookResponse;

  if (root.client != null) {
    return extractSectionRecords(root.client, "client");
  }

  if (Array.isArray(root.data)) return root.data;

  return [];
};

export const extractInvoicingRecords = (proxyData: unknown): unknown[] => {
  if (!proxyData || typeof proxyData !== "object") return [];

  const root = proxyData as WisproWebhookResponse;
  return extractSectionRecords(root.envoicing, "envoicing");
};

export const normalizeWisproCustomer = (
  raw: unknown,
  fallbackCedula?: string,
): WisproCustomer | null => {
  if (!raw || typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;
  const id = readString(record, ["id", "client_id", "wispro_id", "contract_id"]);
  const name = readString(record, ["name", "client_name"]);
  const nationalId =
    readString(record, [
      "national_identification_number",
      "client_national_identification_number",
      "national_id",
      "cedula",
      "document_number",
    ]) ?? fallbackCedula?.trim() ?? "";

  if (!id || !name || !nationalId) {
    console.warn("[Wispro webhook] registro de cliente incompleto:", raw);
    return null;
  }

  return {
    id,
    name,
    national_identification_number: nationalId,
    phone_mobile: readString(record, [
      "phone_mobile",
      "client_phone",
      "phone",
      "mobile",
    ]),
    zone_name: readString(record, ["zone_name", "zone"]),
    city: readString(record, ["city"]),
    state: readString(record, ["state"]),
  };
};

const emptyInvoicingSummary = (
  overrides?: Partial<WisproInvoicingSummary>,
): WisproInvoicingSummary => ({
  debt: 0,
  hasDebt: false,
  accountStatus: "Al día",
  serviceSuspended: false,
  contractState: null,
  contractId: null,
  planName: null,
  pppProfile: null,
  snapshot: null,
  ...overrides,
});

export const parseInvoicingDebt = (
  proxyData: unknown,
): WisproInvoicingSummary => {
  const invoices = extractInvoicingRecords(proxyData);

  if (!invoices.length) {
    return emptyInvoicingSummary();
  }

  const invoice = invoices[0];

  if (!invoice || typeof invoice !== "object") {
    return emptyInvoicingSummary();
  }

  const invoiceRecord = invoice as Record<string, unknown>;
  const items = Array.isArray(invoiceRecord.items) ? invoiceRecord.items : [];

  if (!items.length) {
    console.warn("[Wispro webhook] factura sin items en envoicing.data[0]");
    return emptyInvoicingSummary();
  }

  const item = items[0];

  if (!item || typeof item !== "object") {
    return emptyInvoicingSummary();
  }

  const itemRecord = item as Record<string, unknown>;
  const grossAmount = parseAmount(itemRecord.gross_amount);
  const amount = parseAmount(itemRecord.amount);
  const debt = roundMoney(grossAmount + amount);
  const hasDebt = debt > 0;

  return emptyInvoicingSummary({
    debt,
    hasDebt,
    accountStatus: hasDebt ? "Con deuda" : "Al día",
    snapshot: {
      invoiceIndex: 0,
      itemIndex: 0,
      gross_amount: grossAmount,
      amount,
    },
  });
};

export const serializeInvoicingForDb = (
  invoicing: WisproInvoicingSummary,
): string | null => {
  if (!invoicing.hasDebt && invoicing.debt <= 0) {
    return null;
  }

  return JSON.stringify({
    debt: invoicing.debt,
    hasDebt: invoicing.hasDebt,
    serviceSuspended: Boolean(invoicing.serviceSuspended),
    contractState: invoicing.contractState ?? null,
    contractId: invoicing.contractId ?? null,
    planName: invoicing.planName ?? null,
    pppProfile: invoicing.pppProfile ?? null,
    calculatedAt: new Date().toISOString(),
    source: invoicing.snapshot,
  });
};

/** Always persist Wispro link metadata (incl. cedula) so UI survives reload. */
export const serializeWisproLinkForDb = (
  invoicing: WisproInvoicingSummary,
  customer: WisproCustomer,
): string => {
  return JSON.stringify({
    debt: invoicing.debt,
    hasDebt: invoicing.hasDebt,
    serviceSuspended: Boolean(invoicing.serviceSuspended),
    contractState: invoicing.contractState ?? null,
    contractId: invoicing.contractId ?? null,
    planName: invoicing.planName ?? null,
    pppProfile: invoicing.pppProfile ?? null,
    calculatedAt: new Date().toISOString(),
    source: invoicing.snapshot,
    cedula: customer.national_identification_number,
    wisproCustomer: {
      id: customer.id,
      name: customer.name,
      national_identification_number: customer.national_identification_number,
      phone_mobile: customer.phone_mobile ?? null,
      zone_name: customer.zone_name ?? null,
      city: customer.city ?? null,
      state: customer.state ?? null,
    },
  });
};

export const parseWisproCustomerFromEnvoicing = (
  envoicing: string | null | undefined,
): WisproCustomer | null => {
  if (!envoicing?.trim()) return null;

  try {
    const parsed = JSON.parse(envoicing) as {
      wisproCustomer?: Partial<WisproCustomer> | null;
      cedula?: string | null;
    };

    const snapshot = parsed.wisproCustomer;
    const id = String(snapshot?.id || "").trim();
    const name = String(snapshot?.name || "").trim();
    const cedula = String(
      snapshot?.national_identification_number || parsed.cedula || "",
    ).trim();

    if (!id || !name || !cedula) return null;

    return {
      id,
      name,
      national_identification_number: cedula,
      phone_mobile: snapshot?.phone_mobile ?? null,
      zone_name: snapshot?.zone_name ?? null,
      city: snapshot?.city ?? null,
      state: snapshot?.state ?? null,
    };
  } catch {
    return null;
  }
};

export const parseWisproCustomers = (
  proxyData: unknown,
  options?: { fallbackCedula?: string },
): WisproCustomer[] => {
  return extractClientRecords(proxyData)
    .map((record) =>
      normalizeWisproCustomer(record, options?.fallbackCedula),
    )
    .filter((customer): customer is WisproCustomer => customer !== null);
};

export const parseWisproSearchResults = (
  proxyData: unknown,
  options?: { fallbackCedula?: string },
): WisproSearchResult[] => {
  const invoicing = parseInvoicingDebt(proxyData);
  let customers = parseWisproCustomers(proxyData, options);

  if (!customers.length) {
    customers = extractInvoicingRecords(proxyData)
      .map((record) =>
        normalizeWisproCustomer(record, options?.fallbackCedula),
      )
      .filter((customer): customer is WisproCustomer => customer !== null);
  }

  return customers.map((customer) => ({
    customer,
    invoicing,
  }));
};
