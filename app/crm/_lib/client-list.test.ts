import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLIENT_PLAN_NONE,
  EMPTY_CLIENT_LIST_QUERY,
  filterClients,
  sliceClientPage,
} from "./client-list.ts";
import type { Client, Ticket } from "./types.ts";

const client = (
  partial: Partial<Client> & Pick<Client, "id" | "name">,
): Client => ({
  phone: null,
  cedula: null,
  plan: null,
  zone: null,
  account: null,
  app_enabled: true,
  color: null,
  bg: null,
  initials: null,
  created_at: null,
  ...partial,
});

const ticket = (
  partial: Partial<Ticket> & Pick<Ticket, "id" | "client_id" | "status">,
): Ticket => ({
  type: "soporte",
  agent: "Ana",
  description: null,
  created_at: null,
  ...partial,
});

const directory = [
  client({
    id: 1,
    name: "José Núñez",
    cedula: "16346456",
    phone: "04141234567",
    plan: "100 Mbps",
    zone: "Guamare",
    account: "Al día",
  }),
  client({
    id: 2,
    name: "María López",
    cedula: "V-99887766",
    phone: "0424-1112233",
    plan: "50 Mbps",
    zone: "Cariaco",
    account: "Con deuda",
    app_enabled: false,
  }),
  client({
    id: 3,
    name: "Pedro Álvarez",
    phone: "0412-0001122",
    account: "Prospecto",
  }),
];

const tickets = [
  ticket({ id: "t1", client_id: 2, status: "Abierto" }),
  ticket({ id: "t2", client_id: 1, status: "Resuelto" }),
];

describe("filterClients", () => {
  it("matches name without accents and cédula digits", () => {
    const byName = filterClients(directory, tickets, {
      ...EMPTY_CLIENT_LIST_QUERY,
      search: "jose nunez",
    });
    assert.deepEqual(byName.map((item) => item.id), [1]);

    const byDocument = filterClients(directory, tickets, {
      ...EMPTY_CLIENT_LIST_QUERY,
      search: "99887766",
    });
    assert.deepEqual(byDocument.map((item) => item.id), [2]);
  });

  it("matches a phone typed with separators", () => {
    const result = filterClients(directory, tickets, {
      ...EMPTY_CLIENT_LIST_QUERY,
      search: "0414-123",
    });
    assert.deepEqual(result.map((item) => item.id), [1]);
  });

  it("filters by account, app, open tickets and plan", () => {
    assert.deepEqual(
      filterClients(directory, tickets, {
        ...EMPTY_CLIENT_LIST_QUERY,
        account: "Con deuda",
      }).map((item) => item.id),
      [2],
    );
    assert.deepEqual(
      filterClients(directory, tickets, {
        ...EMPTY_CLIENT_LIST_QUERY,
        app: "disabled",
      }).map((item) => item.id),
      [2],
    );
    assert.deepEqual(
      filterClients(directory, tickets, {
        ...EMPTY_CLIENT_LIST_QUERY,
        tickets: "open",
      }).map((item) => item.id),
      [2],
    );
    assert.deepEqual(
      filterClients(directory, tickets, {
        ...EMPTY_CLIENT_LIST_QUERY,
        plan: CLIENT_PLAN_NONE,
      }).map((item) => item.id),
      [3],
    );
    assert.deepEqual(
      filterClients(directory, tickets, {
        ...EMPTY_CLIENT_LIST_QUERY,
        search: "cariaco",
        account: "Con deuda",
      }).map((item) => item.id),
      [2],
    );
  });
});

describe("sliceClientPage", () => {
  it("returns the requested page and clamps past the end", () => {
    const clients = [1, 2, 3, 4, 5].map((id) => client({ id, name: `C${id}` }));
    const page = sliceClientPage(clients, 2, 2);
    assert.deepEqual(page.items.map((item) => item.id), [3, 4]);
    assert.equal(page.totalPages, 3);
    assert.equal(page.from, 3);
    assert.equal(page.to, 4);

    const last = sliceClientPage(clients, 9, 2);
    assert.equal(last.page, 3);
    assert.deepEqual(last.items.map((item) => item.id), [5]);
  });
});
