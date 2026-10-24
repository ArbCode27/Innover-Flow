export const PAYMENT_METHOD_KEYS = [
  "pago_movil",
  "transferencia",
  "zelle",
  "binance",
  "paypal",
] as const;

export type PaymentMethodKey = (typeof PAYMENT_METHOD_KEYS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodKey, string> = {
  pago_movil: "Pago Móvil",
  transferencia: "Transferencia bancaria",
  zelle: "Zelle",
  binance: "Binance",
  paypal: "PayPal",
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
  email: string | null;
  link_url: string | null;
  binance_pay_id: string | null;
  binance_uid: string | null;
  wallet_address: string | null;
  crypto_network: string | null;
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
    title: "Transferencia bancaria",
    description: "Puede demorar más de 48 hrs",
    currency: "VES",
    sort_order: 1,
  },
  zelle: {
    title: "Zelle",
    description: "Usa el teléfono o correo registrado en Zelle (banco EE. UU.)",
    currency: "USD",
    sort_order: 2,
  },
  binance: {
    title: "Binance",
    description:
      "Indica Pay ID / UID o wallet + red. Nunca pidas ni compartas contraseñas u OTP.",
    currency: "USD",
    sort_order: 3,
  },
  paypal: {
    title: "PayPal",
    description: "Correo de PayPal o enlace PayPal.Me",
    currency: "USD",
    sort_order: 4,
  },
};

export const methodUsesPhone = (methodKey: PaymentMethodKey) =>
  methodKey === "pago_movil" ||
  methodKey === "zelle" ||
  methodKey === "binance";

export const methodUsesBankAccount = (methodKey: PaymentMethodKey) =>
  methodKey === "transferencia";

export const methodUsesVeDocument = (methodKey: PaymentMethodKey) =>
  methodKey === "pago_movil" || methodKey === "transferencia";

export const methodUsesEmail = (methodKey: PaymentMethodKey) =>
  methodKey === "zelle" ||
  methodKey === "binance" ||
  methodKey === "paypal";

export const methodUsesPaypalLink = (methodKey: PaymentMethodKey) =>
  methodKey === "paypal";

export const methodUsesBinanceIds = (methodKey: PaymentMethodKey) =>
  methodKey === "binance";

export const methodUsesCryptoWallet = (methodKey: PaymentMethodKey) =>
  methodKey === "binance";

export const methodUsesHolderName = (methodKey: PaymentMethodKey) =>
  methodKey === "pago_movil" ||
  methodKey === "transferencia" ||
  methodKey === "zelle" ||
  methodKey === "paypal";

/** @deprecated Use methodUsesBankAccount */
export const methodUsesAccount = methodUsesBankAccount;

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
    email: null,
    link_url: null,
    binance_pay_id: null,
    binance_uid: null,
    wallet_address: null,
    crypto_network: null,
    notes: null,
    updated_by: null,
    created_at: null,
    updated_at: null,
  };
};

/** Merge DB rows with the known keys so the CRM always shows a full catalog. */
export const mergePaymentMethodCatalog = (
  organizationId: string,
  rows: OrganizationPaymentMethod[],
): OrganizationPaymentMethod[] => {
  const byKey = new Map(rows.map((row) => [row.method_key, row]));
  return PAYMENT_METHOD_KEYS.map(
    (key) => byKey.get(key) ?? emptyPaymentMethodDraft(organizationId, key),
  ).sort(
    (a, b) =>
      a.sort_order - b.sort_order || a.method_key.localeCompare(b.method_key),
  );
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
    | "email"
    | "link_url"
    | "binance_pay_id"
    | "binance_uid"
    | "wallet_address"
    | "crypto_network"
    | "notes"
    | "currency"
  >,
): PaymentCopyField[] => {
  const fields: PaymentCopyField[] = [];
  const push = (label: string, value: string | null | undefined) => {
    const trimmed = String(value || "").trim();
    if (trimmed) fields.push({ label, value: trimmed });
  };

  switch (method.method_key) {
    case "pago_movil":
      push("Banco", method.bank_name);
      push("Teléfono", method.phone);
      push("Cédula / RIF", method.document);
      push("Titular", method.holder_name);
      break;
    case "transferencia":
      push("Banco", method.bank_name);
      push("Titular", method.holder_name);
      push("Cédula / RIF", method.document);
      push("Número de cuenta", method.account_number);
      if (method.account_type) {
        push(
          "Tipo de cuenta",
          method.account_type === "ahorro" ? "Ahorro" : "Corriente",
        );
      }
      break;
    case "zelle":
      push("Teléfono (Zelle)", method.phone);
      push("Correo (Zelle)", method.email);
      push("Nombre completo", method.holder_name);
      break;
    case "binance":
      push("Pay ID (Binance Pay)", method.binance_pay_id);
      push("User ID (UID)", method.binance_uid);
      push("Correo Binance", method.email);
      push("Teléfono Binance", method.phone);
      push("Wallet address", method.wallet_address);
      push("Red (Network)", method.crypto_network);
      break;
    case "paypal":
      push("Correo PayPal", method.email);
      push("PayPal.Me", method.link_url);
      push("Nombre completo", method.holder_name);
      break;
  }

  push(
    "Moneda",
    method.currency === "USD"
      ? "USD"
      : method.currency === "VES"
        ? "Bs (VES)"
        : method.currency,
  );
  push("Notas", method.notes);
  return fields;
};

export const methodHasDestinationData = (
  method: Pick<
    OrganizationPaymentMethod,
    | "method_key"
    | "bank_name"
    | "phone"
    | "document"
    | "account_number"
    | "holder_name"
    | "email"
    | "link_url"
    | "binance_pay_id"
    | "binance_uid"
    | "wallet_address"
  >,
) => {
  const has = (...values: Array<string | null | undefined>) =>
    values.some((value) => Boolean(String(value || "").trim()));

  switch (method.method_key) {
    case "pago_movil":
      return has(method.phone, method.bank_name, method.document, method.holder_name);
    case "transferencia":
      return has(
        method.account_number,
        method.bank_name,
        method.document,
        method.holder_name,
      );
    case "zelle":
      return has(method.phone, method.email);
    case "binance":
      return has(
        method.binance_pay_id,
        method.binance_uid,
        method.email,
        method.phone,
        method.wallet_address,
      );
    case "paypal":
      return has(method.email, method.link_url);
    default:
      return false;
  }
};

export const getPaymentMethodUiStatus = (
  method: Pick<
    OrganizationPaymentMethod,
    | "method_key"
    | "is_enabled"
    | "bank_name"
    | "phone"
    | "document"
    | "account_number"
    | "holder_name"
    | "email"
    | "link_url"
    | "binance_pay_id"
    | "binance_uid"
    | "wallet_address"
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
    | "method_key"
    | "bank_name"
    | "phone"
    | "account_number"
    | "holder_name"
    | "email"
    | "link_url"
    | "binance_pay_id"
    | "binance_uid"
    | "wallet_address"
    | "crypto_network"
  >,
) => {
  const parts: string[] = [];
  const push = (value: string | null | undefined) => {
    const trimmed = String(value || "").trim();
    if (trimmed) parts.push(trimmed);
  };
  const shorten = (value: string, keep = 6) =>
    value.length > keep + 2 ? `…${value.slice(-keep)}` : value;

  switch (method.method_key) {
    case "pago_movil":
      push(method.bank_name);
      push(method.phone);
      break;
    case "transferencia":
      push(method.bank_name);
      if (method.account_number) push(shorten(method.account_number.trim()));
      break;
    case "zelle":
      push(method.email || method.phone);
      push(method.holder_name);
      break;
    case "binance":
      push(method.binance_pay_id || method.binance_uid || method.email);
      if (method.wallet_address) {
        push(shorten(method.wallet_address.trim(), 8));
      }
      push(method.crypto_network);
      break;
    case "paypal":
      push(method.email || method.link_url);
      push(method.holder_name);
      break;
  }

  return parts.length ? parts.join(" · ") : "Sin datos de destino";
};
