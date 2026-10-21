import { normalizeClientPhone } from "./client-identity";
import type { ClientAccountStatus, WisproCustomer, WisproInvoicingSummary } from "./types";
import { serializeWisproLinkForDb } from "./wispro-webhook";

const digitsOnly = (value: string) => value.replace(/\D/g, "");

export const DEFAULT_CLIENT_PLAN = "Sin asignar";
export const DEFAULT_CLIENT_ZONE = "Sin asignar";

export type WisproClientFields = {
  wisproId: string;
  name: string;
  cedula: string;
  phone: string | null;
  zone: string;
  plan: string;
  account: ClientAccountStatus;
  envoicing: string;
};

export const mapWisproToClientFields = (
  customer: WisproCustomer,
  invoicing: WisproInvoicingSummary,
): WisproClientFields => {
  const name = customer.name.trim();
  const rawDocument = customer.national_identification_number.trim();
  const cedula = digitsOnly(rawDocument) || rawDocument;
  const phone = normalizeClientPhone(customer.phone_mobile) || null;
  const zone = customer.zone_name?.trim() || DEFAULT_CLIENT_ZONE;
  const plan = invoicing.pppProfile?.trim() || DEFAULT_CLIENT_PLAN;
  const account: ClientAccountStatus = invoicing.serviceSuspended
    ? "Suspendido"
    : invoicing.accountStatus;

  return {
    wisproId: customer.id.trim(),
    name,
    cedula,
    phone,
    zone,
    plan,
    account,
    envoicing: serializeWisproLinkForDb(invoicing, customer),
  };
};
