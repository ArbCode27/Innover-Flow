import type { Client, WisproCustomer } from "./types";
import { parseWisproCustomerFromEnvoicing } from "./wispro-webhook";

/** Upsert a client row into the in-memory CRM list. */
export const upsertClientInList = (
  clients: Client[],
  incoming: Client,
): Client[] => {
  const exists = clients.some((client) => client.id === incoming.id);
  if (!exists) {
    return [...clients, incoming];
  }

  return clients.map((client) =>
    client.id === incoming.id ? { ...client, ...incoming } : client,
  );
};

/**
 * Keep Wispro UI snapshot in sync with `clients.envoicing` / `wispro_id`
 * (Realtime agent link, billing refresh, etc.).
 */
export const syncWisproSnapshotFromClient = (
  current: Record<number, WisproCustomer>,
  client: Client,
): Record<number, WisproCustomer> => {
  const next = { ...current };
  const wisproId = String(client.wispro_id || "").trim();

  if (!wisproId) {
    delete next[client.id];
    return next;
  }

  const snapshot = parseWisproCustomerFromEnvoicing(client.envoicing);
  if (snapshot) {
    next[client.id] = snapshot;
  }

  return next;
};

export const didClientGainWisproLink = (
  previous: Client | null | undefined,
  next: Client,
): boolean => {
  const hadLink = Boolean(String(previous?.wispro_id || "").trim());
  const hasLink = Boolean(String(next.wispro_id || "").trim());
  return !hadLink && hasLink;
};
