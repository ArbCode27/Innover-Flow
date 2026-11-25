import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapSaeChatProfile, saeContractStatusLabel } from "./sae-chat-profile.ts";

describe("mapSaeChatProfile", () => {
  it("maps contract, debt, phone, address and the active service", () => {
    const profile = mapSaeChatProfile({
      abonado: {
        cedula: "16346456",
        estadoContrato: "ACTIVO",
        direccionServicio: "Urdaneta, Miranda",
        datosContacto: {
          telefono: "02121234567",
          telefonoMovil: "584161745189",
        },
      },
      saldo: { saldoActual: 12.5 },
      servicios: [
        { nombreServicio: "BASICO 100", estadoServicio: "INACTIVO" },
        { nombreServicio: "BASICO 200", estadoServicio: "ACTIVO" },
      ],
    });

    assert.equal(profile.cedula, "16346456");
    assert.equal(profile.phone, "584161745189");
    assert.equal(profile.location, "Urdaneta, Miranda");
    assert.equal(profile.status, "Activo");
    assert.equal(profile.debt, 12.5);
    assert.equal(profile.hasDebt, true);
    assert.equal(profile.plan, "BASICO 200");
  });

  it("treats a zero balance as no debt and a cut contract as suspended", () => {
    const profile = mapSaeChatProfile({
      abonado: { estadoContrato: "CORTADO" },
      saldo: { saldoActual: 0 },
      servicios: [],
    });

    assert.equal(profile.status, "Suspendido");
    assert.equal(profile.hasDebt, false);
    assert.equal(profile.plan, null);
  });
});

describe("saeContractStatusLabel", () => {
  it("keeps an unknown contract state readable", () => {
    assert.equal(saeContractStatusLabel("EN INSTALACION"), "EN INSTALACION");
    assert.equal(saeContractStatusLabel("  "), null);
  });
});
