import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeReceptorBank } from "@/app/crm/_lib/payments";
import type { SaeCuentaBancaria } from "@/lib/sae-cuentas";
import { getSaeCuentasBancarias, type SaeConfig } from "@/lib/sae";

export type OrganizationSaeAccount = {
  id: string;
  organization_id: string;
  id_cuba: string;
  banco: string;
  numero_cuenta: string;
  receptor_bank: string;
  is_active: boolean;
  sort_order: number;
  synced_at: string;
};

export type SaeAccountSyncResult = {
  accounts: OrganizationSaeAccount[];
  error: string | null;
};

const isMissingTable = (error: unknown) => {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: string }).code || "")
      : "";
  return code === "PGRST205" || code === "42P01";
};

const mapRow = (row: Record<string, unknown>): OrganizationSaeAccount | null => {
  const idCuba = String(row.id_cuba || "").trim();
  const banco = String(row.banco || "").trim();
  if (!idCuba || !banco) return null;
  return {
    id: String(row.id || ""),
    organization_id: String(row.organization_id || ""),
    id_cuba: idCuba,
    banco,
    numero_cuenta: String(row.numero_cuenta || "").trim(),
    receptor_bank: String(row.receptor_bank || banco).trim() || banco,
    is_active: row.is_active !== false,
    sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    synced_at: String(row.synced_at || ""),
  };
};

export const receptorBankForSaeAccount = (banco: string) =>
  normalizeReceptorBank(banco) || banco.trim();

export const uniqueReceptorBanks = (
  accounts: Array<Pick<OrganizationSaeAccount, "receptor_bank" | "banco" | "sort_order">>,
) => {
  const ordered = [...accounts].sort((a, b) => a.sort_order - b.sort_order);
  const seen = new Set<string>();
  const banks: string[] = [];
  for (const account of ordered) {
    const bank = account.receptor_bank.trim() || receptorBankForSaeAccount(account.banco);
    if (!bank || seen.has(bank)) continue;
    seen.add(bank);
    banks.push(bank);
  }
  return banks;
};

export const listOrganizationSaeAccounts = async (
  supabase: SupabaseClient,
  organizationId: string,
  options?: { activeOnly?: boolean },
): Promise<OrganizationSaeAccount[]> => {
  let query = supabase
    .from("organization_sae_accounts")
    .select(
      "id, organization_id, id_cuba, banco, numero_cuenta, receptor_bank, is_active, sort_order, synced_at",
    )
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true });

  if (options?.activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }

  return (data || [])
    .map((row) => mapRow(row as Record<string, unknown>))
    .filter((row): row is OrganizationSaeAccount => Boolean(row));
};

const accountRows = (
  organizationId: string,
  cuentas: SaeCuentaBancaria[],
  syncedAt: string,
) => {
  const seen = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  cuentas.forEach((cuenta, index) => {
    const idCuba = cuenta.id_cuba.trim();
    const banco = cuenta.banco.trim();
    if (!idCuba || !banco || seen.has(idCuba)) return;
    seen.add(idCuba);
    rows.push({
      organization_id: organizationId,
      id_cuba: idCuba,
      banco,
      numero_cuenta: cuenta.numero_cuenta.trim(),
      receptor_bank: receptorBankForSaeAccount(banco),
      is_active: true,
      sort_order: index,
      synced_at: syncedAt,
      updated_at: syncedAt,
    });
  });
  return rows;
};

/**
 * Reemplaza el catálogo local con las cuentas que SAE tiene registradas.
 * Si el catálogo falla, las credenciales ya guardadas se conservan.
 */
export const syncOrganizationSaeAccounts = async (
  supabase: SupabaseClient,
  organizationId: string,
  config: SaeConfig,
): Promise<SaeAccountSyncResult> => {
  let cuentas: SaeCuentaBancaria[];
  try {
    cuentas = await getSaeCuentasBancarias(config);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudieron cargar las cuentas de SAE";
    return {
      accounts: await listOrganizationSaeAccounts(supabase, organizationId, {
        activeOnly: true,
      }),
      error: message,
    };
  }

  const syncedAt = new Date().toISOString();
  const rows = accountRows(organizationId, cuentas, syncedAt);
  const activeIds = new Set(rows.map((row) => String(row.id_cuba)));

  if (rows.length) {
    const { error } = await supabase
      .from("organization_sae_accounts")
      .upsert(rows, { onConflict: "organization_id,id_cuba" });
    if (error) {
      if (isMissingTable(error)) {
        return {
          accounts: [],
          error: "Falta aplicar la migración de cuentas SAE en Supabase.",
        };
      }
      throw error;
    }
  }

  const existing = await listOrganizationSaeAccounts(supabase, organizationId);
  const staleIds = existing
    .map((account) => account.id_cuba)
    .filter((idCuba) => !activeIds.has(idCuba));

  if (staleIds.length) {
    const { error } = await supabase
      .from("organization_sae_accounts")
      .update({ is_active: false, synced_at: syncedAt, updated_at: syncedAt })
      .eq("organization_id", organizationId)
      .in("id_cuba", staleIds);
    if (error && !isMissingTable(error)) throw error;
  }

  return {
    accounts: await listOrganizationSaeAccounts(supabase, organizationId, {
      activeOnly: true,
    }),
    error: null,
  };
};

export const deactivateOrganizationSaeAccounts = async (
  supabase: SupabaseClient,
  organizationId: string,
) => {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("organization_sae_accounts")
    .update({ is_active: false, updated_at: now })
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  if (error && !isMissingTable(error)) throw error;
};
