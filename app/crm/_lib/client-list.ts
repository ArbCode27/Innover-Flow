import { formatClientDocument } from "./client-profile-utils.ts";
import type { Client, ClientAccountStatus, Ticket } from "./types.ts";

export const CLIENT_PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_CLIENT_PAGE_SIZE = 25;
export const CLIENT_PLAN_NONE = "__none__";

export const CLIENT_ACCOUNT_FILTERS = [
  "Al día",
  "Con deuda",
  "Suspendido",
  "Prospecto",
] as const satisfies readonly ClientAccountStatus[];

export type ClientAccountFilter = "all" | "none" | ClientAccountStatus;
export type ClientAppFilter = "all" | "enabled" | "disabled";
export type ClientTicketFilter = "all" | "open" | "clear";

export type ClientListQuery = {
  search: string;
  account: ClientAccountFilter;
  app: ClientAppFilter;
  tickets: ClientTicketFilter;
  plan: string;
};

export const EMPTY_CLIENT_LIST_QUERY: ClientListQuery = {
  search: "",
  account: "all",
  app: "all",
  tickets: "all",
  plan: "all",
};

export type ClientPage = {
  items: Client[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  from: number;
  to: number;
};

const fold = (value: string) =>
  value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const digitsOf = (value: string) => value.replace(/\D/g, "");

const compact = (value: string) => value.replace(/[^a-z0-9]/g, "");

export const hasActiveClientFilters = (query: ClientListQuery) =>
  Boolean(query.search.trim()) ||
  query.account !== "all" ||
  query.app !== "all" ||
  query.tickets !== "all" ||
  query.plan !== "all";

export const listClientPlans = (clients: Client[]) => {
  const plans = new Set<string>();
  for (const client of clients) {
    const plan = client.plan?.trim();
    if (plan) plans.add(plan);
  }
  return [...plans].sort((left, right) => left.localeCompare(right, "es"));
};

const openTicketClientIds = (tickets: Ticket[]) => {
  const ids = new Set<number>();
  for (const ticket of tickets) {
    if (ticket.status !== "Resuelto") ids.add(ticket.client_id);
  }
  return ids;
};

const matchesSearch = (client: Client, search: string) => {
  const normalized = fold(search.trim());
  if (!normalized) return true;

  const document = formatClientDocument(client.cedula);
  const text = fold(
    [client.name, client.cedula, document, client.phone, client.plan, client.zone]
      .filter(Boolean)
      .join(" "),
  );
  if (text.includes(normalized)) return true;

  const compactQuery = compact(normalized);
  if (compactQuery.length >= 3 && compact(text).includes(compactQuery)) return true;

  const queryDigits = digitsOf(normalized);
  if (queryDigits.length < 4) return false;
  const haystackDigits = digitsOf(`${client.cedula ?? ""}${client.phone ?? ""}`);
  return haystackDigits.includes(queryDigits);
};

const matchesQuery = (
  client: Client,
  query: ClientListQuery,
  openClientIds: Set<number>,
) => {
  if (!matchesSearch(client, query.search)) return false;

  if (query.account === "none" && client.account) return false;
  if (
    query.account !== "all" &&
    query.account !== "none" &&
    client.account !== query.account
  ) {
    return false;
  }

  const appEnabled = client.app_enabled !== false;
  if (query.app === "enabled" && !appEnabled) return false;
  if (query.app === "disabled" && appEnabled) return false;

  const hasOpenTickets = openClientIds.has(client.id);
  if (query.tickets === "open" && !hasOpenTickets) return false;
  if (query.tickets === "clear" && hasOpenTickets) return false;

  const plan = client.plan?.trim() || "";
  if (query.plan === CLIENT_PLAN_NONE && plan) return false;
  if (
    query.plan !== "all" &&
    query.plan !== CLIENT_PLAN_NONE &&
    plan !== query.plan
  ) {
    return false;
  }

  return true;
};

export const filterClients = (
  clients: Client[],
  tickets: Ticket[],
  query: ClientListQuery,
) => {
  const openClientIds = openTicketClientIds(tickets);
  return clients.filter((client) => matchesQuery(client, query, openClientIds));
};

export const sliceClientPage = (
  clients: Client[],
  page: number,
  pageSize: number,
): ClientPage => {
  const size = Math.max(1, pageSize);
  const total = clients.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages);
  const start = (current - 1) * size;

  return {
    items: clients.slice(start, start + size),
    page: current,
    pageSize: size,
    total,
    totalPages,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + size, total),
  };
};
