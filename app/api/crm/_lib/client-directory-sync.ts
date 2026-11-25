import type { SupabaseClient } from "@supabase/supabase-js";
import { getInitials } from "@/app/crm/_lib/formatters";
import { normalizeClientPhone } from "@/app/crm/_lib/client-identity";
import { getColorByIndex } from "@/app/crm/_lib/formatters";
import {
  accountFromSaeContract,
  cedulaDigits,
  directoryPatch,
  findDirectoryMatch,
  type DirectoryClient,
  type LocalClientRef,
} from "@/app/crm/_lib/client-directory";
import {
  getOrganizationSaeConfig,
  searchSaeAbonados,
} from "@/app/api/crm/_lib/sae-api";
import {
  listWisproClientsPage,
  withOrganizationWispro,
} from "@/app/api/crm/_lib/wispro-api";

export type DirectorySyncProvider = "wispro" | "sae";

export type DirectorySyncResult = {
  created: number;
  updated: number;
  skipped: number;
  processed: number;
  page: number;
  totalPages: number | null;
  errors: string[];
  done: boolean;
  nextCursor: string | null;
};

const EMPTY: DirectorySyncResult = {
  created: 0,
  updated: 0,
  skipped: 0,
  processed: 0,
  page: 1,
  totalPages: null,
  errors: [],
  done: true,
  nextCursor: null,
};

const readText = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = String(record[key] || "").trim();
    if (value) return value;
  }
  return "";
};

const loadLocals = async (
  supabase: SupabaseClient,
  organizationId: string,
): Promise<LocalClientRef[]> => {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, cedula, wispro_id, phone, plan, zone, account")
    .eq("organization_id", organizationId);
  if (error) throw error;
  return (data || []) as LocalClientRef[];
};

const applyClient = async (
  supabase: SupabaseClient,
  organizationId: string,
  locals: LocalClientRef[],
  source: DirectoryClient,
  counts: DirectorySyncResult,
) => {
  const incoming: DirectoryClient = {
    ...source,
    name: source.name.trim(),
    phone: normalizeClientPhone(source.phone) || null,
    cedula: cedulaDigits(source.cedula) || null,
  };
  const name = incoming.name;
  if (!name) {
    counts.skipped += 1;
    return;
  }
  if (!incoming.wisproId && !cedulaDigits(incoming.cedula)) {
    counts.skipped += 1;
    counts.errors.push(`${name}: sin cédula ni identificador para guardarlo.`);
    return;
  }

  const found = findDirectoryMatch(locals, incoming);
  if (found.conflict) {
    counts.skipped += 1;
    counts.errors.push(`${name}: la cédula y Wispro apuntan a clientes distintos.`);
    return;
  }

  if (!found.match) {
    const color = getColorByIndex(locals.length);
    const cedula = cedulaDigits(incoming.cedula) || null;
    const { data, error } = await supabase
      .from("clients")
      .insert({
        organization_id: organizationId,
        name,
        phone: normalizeClientPhone(incoming.phone) || null,
        cedula,
        plan: incoming.plan || "Sin asignar",
        zone: incoming.zone || "Sin asignar",
        account: incoming.account || "Prospecto",
        wispro_id: incoming.wisproId,
        color: color.color,
        bg: color.bg,
        initials: getInitials(name),
        app_enabled: true,
      })
      .select("id, name, cedula, wispro_id, phone, plan, zone, account")
      .single<LocalClientRef>();
    if (error || !data) {
      counts.skipped += 1;
      counts.errors.push(`${name}: no se pudo crear.`);
      return;
    }
    locals.push(data);
    counts.created += 1;
    return;
  }

  const patch = directoryPatch(found.match, incoming);
  if (!Object.keys(patch).length) {
    counts.skipped += 1;
    return;
  }
  const { error } = await supabase
    .from("clients")
    .update(patch)
    .eq("id", found.match.id)
    .eq("organization_id", organizationId);
  if (error) {
    counts.skipped += 1;
    counts.errors.push(`${name}: no se pudo actualizar.`);
    return;
  }
  Object.assign(found.match, patch);
  counts.updated += 1;
};

const wisproIncoming = (record: Record<string, unknown>): DirectoryClient | null => {
  const wisproId = readText(record, ["id", "client_id"]);
  const name = readText(record, ["name", "client_name"]);
  if (!wisproId || !name) return null;
  const cedula = cedulaDigits(
    readText(record, [
      "national_identification_number",
      "national_id",
      "cedula",
      "document_number",
    ]),
  );
  const phone = readText(record, ["phone_mobile", "phone", "mobile"]);
  const zone =
    readText(record, ["zone_name", "zone"]) ||
    [readText(record, ["city"]), readText(record, ["state"])].filter(Boolean).join(", ");
  return {
    name,
    cedula: cedula || null,
    phone: phone || null,
    zone: zone || null,
    plan: null,
    account: null,
    wisproId,
  };
};

const syncWisproPage = async (
  supabase: SupabaseClient,
  organizationId: string,
  cursor: string | null,
): Promise<DirectorySyncResult> => {
  const page = Math.max(Number(cursor) || 1, 1);
  const listed = await withOrganizationWispro(organizationId, () =>
    listWisproClientsPage(page),
  );
  const counts: DirectorySyncResult = {
    ...EMPTY,
    page,
    totalPages: listed.totalPages,
    processed: listed.records.length,
    done: listed.nextPage == null,
    nextCursor: listed.nextPage ? String(listed.nextPage) : null,
    errors: [],
  };
  const locals = await loadLocals(supabase, organizationId);
  for (const record of listed.records) {
    if (!record || typeof record !== "object") {
      counts.skipped += 1;
      continue;
    }
    const incoming = wisproIncoming(record as Record<string, unknown>);
    if (!incoming) {
      counts.skipped += 1;
      continue;
    }
    await applyClient(supabase, organizationId, locals, incoming, counts);
  }
  counts.errors = counts.errors.slice(0, 8);
  return counts;
};

const syncSaePage = async (
  supabase: SupabaseClient,
  organizationId: string,
  cursor: string | null,
): Promise<DirectorySyncResult> => {
  const config = await getOrganizationSaeConfig(organizationId);
  const listed = await searchSaeAbonados(config, {
    limit: 40,
    cursor: cursor && cursor !== "start" ? cursor : null,
  });
  const next = listed.pagination?.nextPageToken?.trim() || null;
  const counts: DirectorySyncResult = {
    ...EMPTY,
    processed: (listed.data || []).length,
    done: !next,
    nextCursor: next,
    errors: [],
  };
  const locals = await loadLocals(supabase, organizationId);
  for (const abonado of listed.data || []) {
    const cedula = cedulaDigits(abonado.cedula);
    await applyClient(
      supabase,
      organizationId,
      locals,
      {
        name: abonado.nombreAbonado,
        cedula: cedula || null,
        phone: null,
        zone: abonado.direccionServicio || null,
        plan: null,
        account: accountFromSaeContract(abonado.estadoContrato),
        wisproId: null,
      },
      counts,
    );
  }
  counts.errors = counts.errors.slice(0, 8);
  return counts;
};

export const syncClientDirectoryPage = async (
  supabase: SupabaseClient,
  organizationId: string,
  provider: DirectorySyncProvider,
  cursor: string | null,
) => {
  if (provider === "wispro") {
    return syncWisproPage(supabase, organizationId, cursor);
  }
  return syncSaePage(supabase, organizationId, cursor);
};
