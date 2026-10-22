import {
  formatPppProfileLabel,
  parseClientEnvoicing,
  resolveActivePlanLabel,
} from "@/app/crm/_lib/client-profile-utils";
import type { ClientAccountStatus } from "@/app/crm/_lib/types";
import type { WisproContract, WisproInvoice } from "@/app/api/crm/_lib/wispro-api";
import { formatUsd } from "@/app/api/crm/_lib/dolarvzla-rate";
import {
  normalizeAppAccountStatus,
  type AppClientRow,
} from "./load-app-client";

const CONTRACT_STATE_LABELS: Record<string, string> = {
  enabled: "Activo",
  alerted: "En alerta",
  degraded: "Degradado",
  disabled: "Suspendido",
};

export const formatContractStateLabel = (
  state: string | null | undefined,
): string | null => {
  const normalized = String(state || "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  return CONTRACT_STATE_LABELS[normalized] || state!.trim();
};

export const formatCedulaDisplay = (cedula: string | null | undefined) => {
  const raw = String(cedula || "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  const prefixMatch = raw.match(/^[A-Za-z]/);
  const prefix = prefixMatch?.[0]?.toUpperCase() || "V";
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${prefix}-${grouped}`;
};

export const formatBcvRateDisplay = (rate: number) => {
  const fixed = rate.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withThousands},${decPart} Bs/$`;
};

export type AppClientDto = {
  id: number;
  name: string;
  phone: string | null;
  cedula: string | null;
  app_enabled: boolean;
  zone: string | null;
  wispro_linked: boolean;
  wispro_id: string | null;
  account: ClientAccountStatus;
  plan: string | null;
  debt: number | null;
  has_debt: boolean;
  service_suspended: boolean;
  contract_state: string | null;
  contract_state_label: string | null;
  contract_id: string | null;
  plan_name: string | null;
  ppp_profile: string | null;
  calculated_at: string | null;
};

export const toAppClientDto = (client: AppClientRow): AppClientDto => {
  const wisproId = String(client.wispro_id || "").trim() || null;
  const snapshot = parseClientEnvoicing(client.envoicing);
  const account = normalizeAppAccountStatus(
    (client.account as ClientAccountStatus | null) ||
      (wisproId ? null : "Prospecto"),
  );
  const planName = snapshot?.planName ?? null;
  const pppProfile = snapshot?.pppProfile ?? null;
  const plan = resolveActivePlanLabel({
    pppProfile,
    planName,
    clientPlan: client.plan,
  });
  const contractState = snapshot?.contractState ?? null;

  return {
    id: Number(client.id),
    name: client.name,
    phone: client.phone ?? null,
    cedula: client.cedula ?? null,
    app_enabled: client.app_enabled !== false,
    zone: client.zone?.trim() || null,
    wispro_linked: Boolean(wisproId),
    wispro_id: wisproId,
    account,
    plan: plan === "Sin plan activo" ? null : plan,
    debt: typeof snapshot?.debt === "number" ? snapshot.debt : null,
    has_debt: Boolean(snapshot?.hasDebt),
    service_suspended: Boolean(snapshot?.serviceSuspended),
    contract_state: contractState,
    contract_state_label: formatContractStateLabel(contractState),
    contract_id: snapshot?.contractId ?? null,
    plan_name: planName,
    ppp_profile: pppProfile,
    calculated_at: snapshot?.calculatedAt ?? null,
  };
};

/** Lean client payload for login/register (same fields as /me client). */
export const toSessionClientDto = (client: AppClientRow) => {
  const dto = toAppClientDto(client);
  return {
    id: dto.id,
    name: dto.name,
    phone: dto.phone,
    cedula: dto.cedula,
    app_enabled: dto.app_enabled,
    zone: dto.zone,
    wispro_linked: dto.wispro_linked,
    wispro_id: dto.wispro_id,
    account: dto.account,
    plan: dto.plan,
    debt: dto.debt,
    has_debt: dto.has_debt,
    service_suspended: dto.service_suspended,
    contract_state: dto.contract_state,
    contract_state_label: dto.contract_state_label,
    contract_id: dto.contract_id,
    plan_name: dto.plan_name,
    ppp_profile: dto.ppp_profile,
    calculated_at: dto.calculated_at,
  };
};

export type AppContractDto = {
  id: string;
  state: string | null;
  state_label: string | null;
  plan_name: string | null;
  ppp_profile: string | null;
  plan_label: string | null;
  pppoe_username: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_primary: boolean;
};

export const toAppContractDto = (
  contract: WisproContract,
  isPrimary: boolean,
): AppContractDto => {
  const planName = contract.plan_name?.trim() || null;
  const pppProfile = contract.ppp_profile_name?.trim() || null;
  const planLabel =
    formatPppProfileLabel(pppProfile, planName) ||
    resolveActivePlanLabel({
      pppProfile,
      planName,
      clientPlan: null,
    });

  return {
    id: contract.id,
    state: contract.state,
    state_label: formatContractStateLabel(contract.state),
    plan_name: planName,
    ppp_profile: pppProfile,
    plan_label:
      planLabel === "Sin plan activo" ? null : planLabel,
    pppoe_username: contract.pppoe_username,
    created_at: contract.created_at,
    updated_at: contract.updated_at,
    is_primary: isPrimary,
  };
};

export type AppInvoiceDto = {
  id: string;
  invoice_number: string | null;
  state: string | null;
  balance_usd_formatted: string;
  amount_usd_formatted: string;
  first_due_date: string | null;
  period_to: string | null;
  concept: string | null;
};

export const toAppInvoiceDto = (invoice: WisproInvoice): AppInvoiceDto => ({
  id: invoice.id,
  invoice_number: invoice.invoice_number,
  state: invoice.state,
  balance_usd_formatted: formatUsd(invoice.balance),
  amount_usd_formatted: formatUsd(invoice.amount),
  first_due_date: invoice.first_due_date,
  period_to: invoice.period_to,
  concept: invoice.concept,
});

export type AppPaymentDto = {
  id: string;
  status: string;
  amount_formatted: string | null;
  bank: string | null;
  payment_date: string | null;
  transaction_code: string | null;
  created_at: string | null;
  receipt_media_url: string | null;
};

export const toAppPaymentDto = (row: {
  id: string;
  status: string;
  amount: number | string | null;
  bank: string | null;
  payment_date: string | null;
  transaction_code: string | null;
  created_at: string | null;
  receipt_media_url: string | null;
}): AppPaymentDto => {
  const amount =
    typeof row.amount === "number"
      ? row.amount
      : row.amount != null
        ? Number(row.amount)
        : null;

  return {
    id: row.id,
    status: row.status,
    amount_formatted:
      typeof amount === "number" && Number.isFinite(amount)
        ? formatUsd(amount)
        : null,
    bank: row.bank,
    payment_date: row.payment_date,
    transaction_code: row.transaction_code,
    created_at: row.created_at,
    receipt_media_url: row.receipt_media_url,
  };
};
