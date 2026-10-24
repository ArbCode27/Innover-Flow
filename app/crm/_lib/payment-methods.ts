export const PAYMENT_METHOD_KEYS = [
  "pago_movil",
  "transferencia",
  "deposito",
  "deposito_usd",
] as const;

export type PaymentMethodKey = (typeof PAYMENT_METHOD_KEYS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodKey, string> = {
  pago_movil: "Pago Móvil",
  transferencia: "Transferencia",
  deposito: "Depósito",
  deposito_usd: "Depósito USD",
};

export type PaymentMethodUiStatus = "active" | "incomplete" | "hidden";

export const PAYMENT_METHOD_UI_STATUS_LABELS: Record<
  PaymentMethodUiStatus,
  string
> = {
  active: "Activo",
  incomplete: "Incompleto",
  hidden: "Oculto",
};

/** Pago móvil uses phone; bank transfer / deposit use account number. */
export const methodUsesPhone = (methodKey: PaymentMethodKey) =>
  methodKey === "pago_movil";

export const methodUsesAccount = (methodKey: PaymentMethodKey) =>
  !methodUsesPhone(methodKey);

export const PAYMENT_CURRENCIES = ["VES", "USD"] as const;
export type PaymentCurrency = (typeof PAYMENT_CURRENCIES)[number];

export const PAYMENT_ACCOUNT_TYPES = ["corriente", "ahorro"] as const;
export type PaymentAccountType = (typeof PAYMENT_ACCOUNT_TYPES)[number];

export type OrganizationPaymentMethod = {
  id: string | null;
  organization_id: string;
  method_key: PaymentMethodKey;
  title: string;
  description: string | null;
  is_enabled: boolean;
  sort_order: number;
  currency: PaymentCurrency;
  bank_name: string | null;
  phone: string | null;
  document: string | null;
  account_number: string | null;
  account_type: PaymentAccountType | null;
  holder_name: string | null;
  notes: string | null;
  updated_by: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PaymentCopyField = {
  label: string;
  value: string;
};

export const PAYMENT_METHOD_DEFAULTS: Record<
  PaymentMethodKey,
  {
    title: string;
    description: string | null;
    currency: PaymentCurrency;
    sort_order: number;
  }
> = {
  pago_movil: {
    title: "Pago Móvil",
    description: null,
    currency: "VES",
    sort_order: 0,
  },
  transferencia: {
    title: "Transferencia",
    description: "Puede demorar más de 48 hrs",
    currency: "VES",
    sort_order: 1,
  },
  deposito: {
    title: "Depósito",
    description: null,
    currency: "VES",
    sort_order: 2,
  },
  deposito_usd: {
    title: "Depósito USD",
    description: null,
    currency: "USD",
    sort_order: 3,
  },
};

export const isPaymentMethodKey = (value: unknown): value is PaymentMethodKey =>
  typeof value === "string" &&
  (PAYMENT_METHOD_KEYS as readonly string[]).includes(value);

export const emptyPaymentMethodDraft = (
  organizationId: string,
  methodKey: PaymentMethodKey,
): OrganizationPaymentMethod => {
  const defaults = PAYMENT_METHOD_DEFAULTS[methodKey];
  return {
    id: null,
    organization_id: organizationId,
    method_key: methodKey,
    title: defaults.title,
    description: defaults.description,
    is_enabled: false,
    sort_order: defaults.sort_order,
    currency: defaults.currency,
    bank_name: null,
    phone: null,
    document: null,
    account_number: null,
    account_type: null,
    holder_name: null,
    notes: null,
    updated_by: null,
    created_at: null,
    updated_at: null,
  };
};

/** Merge DB rows with the 4 known keys so the CRM always shows a full catalog. */
export const mergePaymentMethodCatalog = (
  organizationId: string,
  rows: OrganizationPaymentMethod[],
): OrganizationPaymentMethod[] => {
  const byKey = new Map(rows.map((row) => [row.method_key, row]));
  return PAYMENT_METHOD_KEYS.map(
    (key) => byKey.get(key) ?? emptyPaymentMethodDraft(organizationId, key),
  ).sort((a, b) => a.sort_order - b.sort_order || a.method_key.localeCompare(b.method_key));
};

export const buildPaymentInstructionFields = (
  method: Pick<
    OrganizationPaymentMethod,
    | "method_key"
    | "bank_name"
    | "phone"
    | "document"
    | "account_number"
    | "account_type"
    | "holder_name"
    | "notes"
    | "currency"
  >,
): PaymentCopyField[] => {
  const fields: PaymentCopyField[] = [];
  const push = (label: string, value: string | null | undefined) => {
    const trimmed = String(value || "").trim();
    if (trimmed) fields.push({ label, value: trimmed });
  };

  push("Banco", method.bank_name);
  if (method.method_key === "pago_movil") {
    push("Teléfono", method.phone);
    push("Cédula / RIF", method.document);
    push("Titular", method.holder_name);
  } else {
    push("Titular", method.holder_name);
    push("Cédula / RIF", method.document);
    push("Número de cuenta", method.account_number);
    if (method.account_type) {
      push(
        "Tipo de cuenta",
        method.account_type === "ahorro" ? "Ahorro" : "Corriente",
      );
    }
  }
  push("Moneda", method.currency === "USD" ? "USD" : "Bs (VES)");
  push("Notas", method.notes);
  return fields;
};

export const methodHasDestinationData = (
  method: Pick<
    OrganizationPaymentMethod,
    "bank_name" | "phone" | "document" | "account_number" | "holder_name"
  >,
) =>
  Boolean(
    String(method.bank_name || "").trim() ||
      String(method.phone || "").trim() ||
      String(method.document || "").trim() ||
      String(method.account_number || "").trim() ||
      String(method.holder_name || "").trim(),
  );

export const getPaymentMethodUiStatus = (
  method: Pick<
    OrganizationPaymentMethod,
    | "is_enabled"
    | "bank_name"
    | "phone"
    | "document"
    | "account_number"
    | "holder_name"
  >,
): PaymentMethodUiStatus => {
  if (!method.is_enabled) return "hidden";
  if (!methodHasDestinationData(method)) return "incomplete";
  return "active";
};

/** Short destination line for table cells. */
export const paymentMethodDestinationSummary = (
  method: Pick<
    OrganizationPaymentMethod,
    "method_key" | "bank_name" | "phone" | "account_number" | "holder_name"
  >,
) => {
  const parts: string[] = [];
  const bank = String(method.bank_name || "").trim();
  const holder = String(method.holder_name || "").trim();
  if (bank) parts.push(bank);
  if (methodUsesPhone(method.method_key)) {
    const phone = String(method.phone || "").trim();
    if (phone) parts.push(phone);
  } else {
    const account = String(method.account_number || "").trim();
    if (account) {
      parts.push(
        account.length > 8 ? `…${account.slice(-6)}` : account,
      );
    }
  }
  if (!parts.length && holder) parts.push(holder);
  return parts.length ? parts.join(" · ") : "Sin datos de destino";
};
