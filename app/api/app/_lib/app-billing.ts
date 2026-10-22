import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOfficeHoursSnapshot } from "@/app/crm/_lib/office-hours";
import { getCrmSettings } from "@/app/api/crm/_lib/crm-settings";
import {
  enrichDebtWithBcv,
} from "@/app/api/crm/_lib/dolarvzla-rate";
import {
  listPendingInvoicesForClient,
  withOptionalOrganizationWispro,
} from "@/app/api/crm/_lib/wispro-api";
import { refreshClientBillingFromWispro } from "@/app/api/crm/_lib/wispro-billing-refresh";
import {
  formatBcvRateDisplay,
  toAppClientDto,
  toAppInvoiceDto,
  type AppClientDto,
  type AppInvoiceDto,
} from "./app-client-dtos";
import { loadAppClient, type AppClientRow } from "./load-app-client";

export type AppBillingPayload = {
  client: AppClientDto;
  account_status: AppClientDto["account"];
  service_suspended: boolean;
  has_debt: boolean;
  debt: number | null;
  debt_usd_formatted: string | null;
  debt_bs_formatted: string | null;
  bcv_rate_display: string | null;
  contract_state: string | null;
  contract_state_label: string | null;
  contract_id: string | null;
  plan_name: string | null;
  ppp_profile: string | null;
  zone: string | null;
  wispro_linked: boolean;
  billing_stale: boolean;
  office_closed: boolean;
  next_open_label: string | null;
  period_label: string | null;
  due_hint: string | null;
  pending_invoices: AppInvoiceDto[];
};

const resolveDueHint = (input: {
  hasDebt: boolean;
  serviceSuspended: boolean;
  wisproLinked: boolean;
}) => {
  if (!input.wisproLinked) {
    return "Tu cuenta aún no está vinculada al servicio. Contacta a soporte.";
  }
  if (input.serviceSuspended) {
    return "Reporta tu pago para que un asesor revise la reconexión.";
  }
  if (input.hasDebt) {
    return "Paga antes de la fecha de corte y evita la suspensión del servicio.";
  }
  return null;
};

const resolvePeriodLabel = (invoices: AppInvoiceDto[]) => {
  const first = invoices[0];
  if (!first) return null;
  if (first.period_to) return first.period_to;
  if (first.first_due_date) return `Vence ${first.first_due_date}`;
  if (first.invoice_number) return `Factura ${first.invoice_number}`;
  return null;
};

export const maybeRefreshAppClientBilling = async (input: {
  supabase: SupabaseClient;
  client: AppClientRow;
  organizationId: string;
  force?: boolean;
}): Promise<{ client: AppClientRow; billingStale: boolean }> => {
  const wisproId = String(input.client.wispro_id || "").trim();
  if (!wisproId) {
    return { client: input.client, billingStale: false };
  }

  const refresh = await withOptionalOrganizationWispro(
    input.organizationId,
    () =>
      refreshClientBillingFromWispro({
        supabase: input.supabase,
        clientId: Number(input.client.id),
        wisproId,
        envoicing: input.client.envoicing,
        clientName: input.client.name,
        force: Boolean(input.force),
      }),
  );

  const billingStale =
    !refresh.ok &&
    (refresh.reason === "timeout" ||
      refresh.reason === "upstream" ||
      refresh.reason === "persist_failed");

  if (!refresh.refreshed) {
    return { client: input.client, billingStale };
  }

  const reloaded = await loadAppClient(input.supabase, {
    clientId: Number(input.client.id),
    organizationId: input.organizationId,
  });

  return { client: reloaded, billingStale };
};

export const buildAppBillingPayload = async (input: {
  supabase: SupabaseClient;
  client: AppClientRow;
  organizationId: string;
  billingStale?: boolean;
}): Promise<AppBillingPayload> => {
  const clientDto = toAppClientDto(input.client);
  const settings = await getCrmSettings(input.supabase, input.organizationId);
  const office = resolveOfficeHoursSnapshot(new Date(), settings.office_hours);

  let pendingInvoices: AppInvoiceDto[] = [];
  if (clientDto.wispro_linked && clientDto.cedula) {
    try {
      const invoices = await withOptionalOrganizationWispro(
        input.organizationId,
        () =>
          listPendingInvoicesForClient({
            wisproClientId: clientDto.wispro_id,
            cedula: clientDto.cedula,
          }),
      );
      pendingInvoices = invoices.map(toAppInvoiceDto);
    } catch (error) {
      console.warn("[APP_BILLING] pending_invoices_failed", {
        clientId: clientDto.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const debtUsd =
    typeof clientDto.debt === "number" && Number.isFinite(clientDto.debt)
      ? clientDto.debt
      : null;

  let debtUsdFormatted: string | null = null;
  let debtBsFormatted: string | null = null;
  let bcvRateDisplay: string | null = null;

  if (debtUsd != null) {
    const fx = await enrichDebtWithBcv(debtUsd);
    debtUsdFormatted = fx.debt_usd_formatted;
    debtBsFormatted = fx.debt_bs_formatted;
    if (fx.ok && typeof fx.bcv_rate === "number") {
      bcvRateDisplay = formatBcvRateDisplay(fx.bcv_rate);
    }
  } else if (!clientDto.wispro_linked) {
    debtUsdFormatted = null;
  }

  return {
    client: clientDto,
    account_status: clientDto.account,
    service_suspended: clientDto.service_suspended,
    has_debt: clientDto.has_debt,
    debt: debtUsd,
    debt_usd_formatted: debtUsdFormatted,
    debt_bs_formatted: debtBsFormatted,
    bcv_rate_display: bcvRateDisplay,
    contract_state: clientDto.contract_state,
    contract_state_label: clientDto.contract_state_label,
    contract_id: clientDto.contract_id,
    plan_name: clientDto.plan,
    ppp_profile: clientDto.ppp_profile,
    zone: clientDto.zone,
    wispro_linked: clientDto.wispro_linked,
    billing_stale: Boolean(input.billingStale),
    office_closed: Boolean(office.enabled && office.closed),
    next_open_label: office.nextOpenLabel,
    period_label: resolvePeriodLabel(pendingInvoices),
    due_hint: resolveDueHint({
      hasDebt: clientDto.has_debt,
      serviceSuspended: clientDto.service_suspended,
      wisproLinked: clientDto.wispro_linked,
    }),
    pending_invoices: pendingInvoices,
  };
};
