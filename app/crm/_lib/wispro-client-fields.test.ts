import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WisproCustomer, WisproInvoicingSummary } from "./types.ts";
import { mapWisproToClientFields } from "./wispro-client-fields.ts";

const customer: WisproCustomer = {
  id: "wispro-1",
  name: "Carlos Pérez",
  national_identification_number: "V-28.123.456",
  phone_mobile: "+58 412 1234567",
  zone_name: "Nodo 4",
};

const invoicing: WisproInvoicingSummary = {
  debt: 12.5,
  hasDebt: true,
  accountStatus: "Con deuda",
  serviceSuspended: false,
  contractState: "enabled",
  contractId: "contract-1",
  planName: "Internet 30 Mbps",
  pppProfile: "BASICO 30",
  snapshot: null,
};

describe("mapWisproToClientFields", () => {
  it("hidrata ficha comercial desde Wispro y guarda PPP en plan", () => {
    const fields = mapWisproToClientFields(customer, invoicing);

    assert.equal(fields.wisproId, "wispro-1");
    assert.equal(fields.name, "Carlos Pérez");
    assert.equal(fields.cedula, "28123456");
    assert.equal(fields.phone, "584121234567");
    assert.equal(fields.zone, "Nodo 4");
    assert.equal(fields.plan, "BASICO 30");
    assert.equal(fields.account, "Con deuda");
    assert.match(fields.envoicing, /"wisproCustomer"/);
  });

  it("marca Suspendido cuando el contrato está cortado", () => {
    const fields = mapWisproToClientFields(customer, {
      ...invoicing,
      serviceSuspended: true,
      accountStatus: "Con deuda",
    });

    assert.equal(fields.account, "Suspendido");
  });

  it("usa fallbacks si Wispro no trae teléfono, zona o PPP", () => {
    const fields = mapWisproToClientFields(
      {
        ...customer,
        phone_mobile: null,
        zone_name: null,
      },
      { ...invoicing, pppProfile: null },
    );

    assert.equal(fields.phone, null);
    assert.equal(fields.zone, "Sin asignar");
    assert.equal(fields.plan, "Sin asignar");
  });
});
