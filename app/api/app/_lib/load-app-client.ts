import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client, ClientAccountStatus } from "@/app/crm/_lib/types";
import { APP_ERROR_CODES, AppApiError } from "./app-errors";

const ACCOUNT_STATUSES = new Set<ClientAccountStatus>([
  "Al día",
  "Con deuda",
  "Suspendido",
  "Prospecto",
]);

export type AppClientRow = Pick<
  Client,
  | "id"
  | "organization_id"
  | "name"
  | "phone"
  | "cedula"
  | "app_enabled"
  | "plan"
  | "zone"
  | "account"
  | "wispro_id"
  | "envoicing"
>;

export const normalizeAppAccountStatus = (
  value: string | null | undefined,
): ClientAccountStatus => {
  if (value && ACCOUNT_STATUSES.has(value as ClientAccountStatus)) {
    return value as ClientAccountStatus;
  }
  return "Prospecto";
};

export const loadAppClient = async (
  supabase: SupabaseClient,
  input: { clientId: number; organizationId: string },
): Promise<AppClientRow> => {
  const { data, error } = await supabase
    .from("clients")
    .select(
      "id, organization_id, name, phone, cedula, app_enabled, plan, zone, account, wispro_id, envoicing",
    )
    .eq("id", input.clientId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new AppApiError(
      APP_ERROR_CODES.CLIENT_NOT_FOUND,
      "No encontramos tu cuenta. Inicia sesión de nuevo o contacta a soporte.",
      404,
    );
  }

  if (data.app_enabled === false) {
    throw new AppApiError(
      APP_ERROR_CODES.APP_DISABLED,
      "El acceso a la app está deshabilitado para esta cuenta. Contacte a soporte.",
      403,
    );
  }

  return data as AppClientRow;
};
