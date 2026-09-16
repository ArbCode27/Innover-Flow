import type { ClientAccountStatus } from "./types";
import type { CrmBadgeTone } from "./crm-theme";

export const formatClientPlan = (plan: string | null) => {
  if (!plan || plan === "Sin asignar" || plan === "—") {
    return "Sin plan activo";
  }

  return plan;
};

/**
 * Active plan in CRM chat = Wispro PPP profile (contract "Perfil PPP").
 * Falls back to commercial plan name / clients.plan only if PPP is missing.
 */
export const resolveActivePlanLabel = (input: {
  pppProfile?: string | null;
  planName?: string | null;
  clientPlan?: string | null;
}) => {
  const ppp = input.pppProfile?.trim() || "";
  if (ppp) return ppp;

  const planName = input.planName?.trim() || "";
  if (planName && planName !== "Sin asignar" && planName !== "—") {
    return planName;
  }

  return formatClientPlan(input.clientPlan ?? null);
};

export interface ClientEnvoicingData {
  debt: number;
  hasDebt: boolean;
  calculatedAt?: string;
  cedula?: string;
  serviceSuspended?: boolean;
  contractState?: string | null;
  contractId?: string | null;
  planName?: string | null;
  pppProfile?: string | null;
}

export const parseClientEnvoicing = (
  envoicing: string | null | undefined,
): ClientEnvoicingData | null => {
  if (!envoicing?.trim()) return null;

  try {
    const parsed = JSON.parse(envoicing) as ClientEnvoicingData & {
      cedula?: string;
      serviceSuspended?: boolean;
      contractState?: string | null;
      contractId?: string | null;
      planName?: string | null;
      pppProfile?: string | null;
      wisproCustomer?: { national_identification_number?: string };
    };

    if (typeof parsed.debt !== "number") return null;

    const nestedCedula = parsed.wisproCustomer?.national_identification_number?.trim() || "";

    return {
      debt: parsed.debt,
      hasDebt: Boolean(parsed.hasDebt),
      calculatedAt:
        typeof parsed.calculatedAt === "string" ? parsed.calculatedAt : undefined,
      cedula:
        (typeof parsed.cedula === "string" ? parsed.cedula.trim() : "") ||
        nestedCedula ||
        undefined,
      serviceSuspended:
        typeof parsed.serviceSuspended === "boolean"
          ? parsed.serviceSuspended
          : undefined,
      contractState:
        typeof parsed.contractState === "string" ? parsed.contractState : null,
      contractId:
        typeof parsed.contractId === "string" ? parsed.contractId : null,
      planName: typeof parsed.planName === "string" ? parsed.planName : null,
      pppProfile:
        typeof parsed.pppProfile === "string" ? parsed.pppProfile : null,
    };
  } catch {
    return null;
  }
};

/** Match Wispro UI label: `BASICO 200 (Plan: BASICO 200)`. */
export const formatPppProfileLabel = (
  pppProfile: string | null | undefined,
  planName?: string | null,
) => {
  const profile = pppProfile?.trim() || "";
  if (!profile) return null;
  const plan = planName?.trim() || "";
  if (
    !plan ||
    plan === "Sin asignar" ||
    plan === "—" ||
    plan === "Sin plan activo"
  ) {
    return profile;
  }
  return `${profile} (Plan: ${plan})`;
};

const digitsOnly = (value: unknown) => String(value || "").replace(/\D/g, "") || null;

export type LinkedClientIdentity = {
  linked: boolean;
  wisproId: string | null;
  cedula: string | null;
  name: string | null;
};

const readLinkedSnapshot = (envoicing: string | null | undefined) => {
  if (!envoicing?.trim()) {
    return { cedula: null as string | null, name: null as string | null };
  }

  try {
    const parsed = JSON.parse(envoicing) as {
      cedula?: unknown;
      wisproCustomer?: {
        name?: unknown;
        national_identification_number?: unknown;
      } | null;
    };
    const nested = parsed.wisproCustomer;
    const cedula =
      digitsOnly(nested?.national_identification_number) || digitsOnly(parsed.cedula);
    const name =
      typeof nested?.name === "string" ? nested.name.trim() || null : null;
    return { cedula, name };
  } catch {
    return { cedula: null, name: null };
  }
};

export const resolveLinkedClientIdentity = (
  client: {
    wispro_id?: string | null;
    name?: string | null;
    envoicing?: string | null;
  } | null | undefined,
): LinkedClientIdentity => {
  const wisproId = String(client?.wispro_id || "").trim() || null;
  if (!wisproId) {
    return { linked: false, wisproId: null, cedula: null, name: null };
  }

  const snapshot = readLinkedSnapshot(client?.envoicing);
  return {
    linked: true,
    wisproId,
    cedula: snapshot.cedula,
    name: snapshot.name || client?.name?.trim() || null,
  };
};

export const getManualPaymentBlockReason = (
  client: Parameters<typeof resolveLinkedClientIdentity>[0],
) => {
  const identity = resolveLinkedClientIdentity(client);
  if (!identity.linked) {
    return "Vincula el cliente a Wispro antes de registrar el pago";
  }
  if (!identity.cedula) {
    return "El cliente vinculado no tiene cédula en la base de datos";
  }
  return null;
};

export const formatClientDebt = (debt: number) =>
  new Intl.NumberFormat("es-VE", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(debt);

export const getAccountTone = (
  account: ClientAccountStatus | null | undefined,
): CrmBadgeTone => {
  switch (account) {
    case "Al día":
      return "emerald";
    case "Con deuda":
      return "red";
    case "Suspendido":
      return "amber";
    case "Prospecto":
      return "blue";
    default:
      return "neutral";
  }
};

export const getAccountTextClass = (
  account: ClientAccountStatus | null | undefined,
) => {
  switch (account) {
    case "Al día":
      return "text-emerald-700 dark:text-emerald-300";
    case "Con deuda":
      return "text-red-700 dark:text-red-300";
    case "Suspendido":
      return "text-amber-700 dark:text-amber-300";
    case "Prospecto":
      return "text-blue-700 dark:text-blue-300";
    default:
      return "";
  }
};
