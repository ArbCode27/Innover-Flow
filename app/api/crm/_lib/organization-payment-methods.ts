import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  buildPaymentInstructionFields,
  emptyPaymentMethodDraft,
  isPaymentMethodKey,
  mergePaymentMethodCatalog,
  methodHasDestinationData,
  PAYMENT_ACCOUNT_TYPES,
  PAYMENT_CURRENCIES,
  PAYMENT_METHOD_DEFAULTS,
  PAYMENT_METHOD_KEYS,
  type OrganizationPaymentMethod,
  type PaymentMethodKey,
} from "@/app/crm/_lib/payment-methods";

const nullableTrimmed = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  });

export const paymentMethodUpsertSchema = z.object({
  method_key: z.enum(PAYMENT_METHOD_KEYS),
  title: z
    .string()
    .trim()
    .min(2, "El título es demasiado corto")
    .max(80, "El título es demasiado largo"),
  description: nullableTrimmed,
  is_enabled: z.boolean(),
  sort_order: z.number().int().min(0).max(100).optional(),
  currency: z.enum(PAYMENT_CURRENCIES),
  bank_name: nullableTrimmed,
  phone: nullableTrimmed,
  document: nullableTrimmed,
  account_number: nullableTrimmed,
  account_type: z
    .union([z.enum(PAYMENT_ACCOUNT_TYPES), z.null()])
    .optional()
    .transform((value) => value ?? null),
  holder_name: nullableTrimmed,
  email: nullableTrimmed,
  link_url: nullableTrimmed,
  binance_pay_id: nullableTrimmed,
  binance_uid: nullableTrimmed,
  wallet_address: nullableTrimmed,
  crypto_network: nullableTrimmed,
  notes: nullableTrimmed,
});

export type PaymentMethodUpsertInput = z.infer<typeof paymentMethodUpsertSchema>;

const mapRow = (
  row: Record<string, unknown>,
): OrganizationPaymentMethod | null => {
  if (!isPaymentMethodKey(row.method_key)) return null;
  return {
    id: typeof row.id === "string" ? row.id : null,
    organization_id: String(row.organization_id || ""),
    method_key: row.method_key,
    title:
      typeof row.title === "string" && row.title.trim()
        ? row.title.trim()
        : PAYMENT_METHOD_DEFAULTS[row.method_key].title,
    description:
      typeof row.description === "string" ? row.description.trim() || null : null,
    is_enabled: Boolean(row.is_enabled),
    sort_order:
      typeof row.sort_order === "number" && Number.isFinite(row.sort_order)
        ? row.sort_order
        : PAYMENT_METHOD_DEFAULTS[row.method_key].sort_order,
    currency: row.currency === "USD" ? "USD" : "VES",
    bank_name:
      typeof row.bank_name === "string" ? row.bank_name.trim() || null : null,
    phone: typeof row.phone === "string" ? row.phone.trim() || null : null,
    document:
      typeof row.document === "string" ? row.document.trim() || null : null,
    account_number:
      typeof row.account_number === "string"
        ? row.account_number.trim() || null
        : null,
    account_type:
      row.account_type === "corriente" || row.account_type === "ahorro"
        ? row.account_type
        : null,
    holder_name:
      typeof row.holder_name === "string"
        ? row.holder_name.trim() || null
        : null,
    email: typeof row.email === "string" ? row.email.trim() || null : null,
    link_url:
      typeof row.link_url === "string" ? row.link_url.trim() || null : null,
    binance_pay_id:
      typeof row.binance_pay_id === "string"
        ? row.binance_pay_id.trim() || null
        : null,
    binance_uid:
      typeof row.binance_uid === "string"
        ? row.binance_uid.trim() || null
        : null,
    wallet_address:
      typeof row.wallet_address === "string"
        ? row.wallet_address.trim() || null
        : null,
    crypto_network:
      typeof row.crypto_network === "string"
        ? row.crypto_network.trim() || null
        : null,
    notes: typeof row.notes === "string" ? row.notes.trim() || null : null,
    updated_by:
      typeof row.updated_by === "number" && Number.isFinite(row.updated_by)
        ? row.updated_by
        : null,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  };
};

export const listOrganizationPaymentMethods = async (
  supabase: SupabaseClient,
  organizationId: string,
): Promise<OrganizationPaymentMethod[]> => {
  const { data, error } = await supabase
    .from("organization_payment_methods")
    .select("*")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  const rows = (data || [])
    .map((row) => mapRow(row as Record<string, unknown>))
    .filter((row): row is OrganizationPaymentMethod => Boolean(row));

  return mergePaymentMethodCatalog(organizationId, rows);
};

export const listEnabledPaymentMethodsForApp = async (
  supabase: SupabaseClient,
  organizationId: string,
): Promise<OrganizationPaymentMethod[]> => {
  const catalog = await listOrganizationPaymentMethods(supabase, organizationId);
  return catalog.filter(
    (method) => method.is_enabled && method.id && methodHasDestinationData(method),
  );
};

export const upsertOrganizationPaymentMethod = async (
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    agentId: number;
    payload: PaymentMethodUpsertInput;
  },
): Promise<OrganizationPaymentMethod> => {
  const defaults = PAYMENT_METHOD_DEFAULTS[input.payload.method_key];
  const sortOrder =
    typeof input.payload.sort_order === "number"
      ? input.payload.sort_order
      : defaults.sort_order;

  if (input.payload.is_enabled) {
    const draft = {
      ...emptyPaymentMethodDraft(input.organizationId, input.payload.method_key),
      ...input.payload,
      sort_order: sortOrder,
    };
    if (!methodHasDestinationData(draft)) {
      throw Object.assign(
        new Error(
          "Activa el método solo cuando tengas al menos un dato de destino válido para ese tipo.",
        ),
        { status: 400, code: "PAYMENT_METHOD_INCOMPLETE" },
      );
    }
  }

  const row = {
    organization_id: input.organizationId,
    method_key: input.payload.method_key,
    title: input.payload.title.trim(),
    description: input.payload.description,
    is_enabled: input.payload.is_enabled,
    sort_order: sortOrder,
    currency: input.payload.currency,
    bank_name: input.payload.bank_name,
    phone: input.payload.phone,
    document: input.payload.document,
    account_number: input.payload.account_number,
    account_type: input.payload.account_type,
    holder_name: input.payload.holder_name,
    email: input.payload.email,
    link_url: input.payload.link_url,
    binance_pay_id: input.payload.binance_pay_id,
    binance_uid: input.payload.binance_uid,
    wallet_address: input.payload.wallet_address,
    crypto_network: input.payload.crypto_network,
    notes: input.payload.notes,
    updated_by: input.agentId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("organization_payment_methods")
    .upsert(row, { onConflict: "organization_id,method_key" })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  const mapped = data ? mapRow(data as Record<string, unknown>) : null;
  if (!mapped) {
    throw new Error("No se pudo guardar el método de pago");
  }
  return mapped;
};

export const toAppPaymentMethodDto = (method: OrganizationPaymentMethod) => ({
  id: method.method_key,
  title: method.title,
  description: method.description,
  bank_name: method.bank_name,
  currency: method.currency,
  fields: buildPaymentInstructionFields(method),
  updated_at: method.updated_at,
});

export const getPaymentMethodByKey = (
  methods: OrganizationPaymentMethod[],
  methodKey: PaymentMethodKey,
) => methods.find((method) => method.method_key === methodKey) ?? null;
