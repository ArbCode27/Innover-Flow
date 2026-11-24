import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  matchSaeCuentas,
  parseSaeCuentasBancarias,
  pickSaeContract,
  readSaePaymentSnapshot,
} from "./sae-cuentas.ts";

const catalogPayload = {
  success: true,
  data: {
    resultado: "ok",
    info: [
      {
        id_cuba: "CUBA03615DDD64E39434",
        numero_cuenta: "01020258240000276070",
        banco: "VENEZUELA",
      },
      {
        id_cuba: "CUBA0B12448F3B848754",
        numero_cuenta: "01050132601132126266",
        banco: "BANCO MERCANTIL",
      },
      {
        id_cuba: "CUBA15DA2D6051B58185",
        numero_cuenta: "01050120231120273218",
        banco: "BANCO MERCANTIL",
      },
    ],
  },
};

describe("catálogo de cuentas SAE", () => {
  it("lee id_cuba, número y banco desde data.info", () => {
    const cuentas = parseSaeCuentasBancarias(catalogPayload);
    assert.equal(cuentas.length, 3);
    assert.equal(cuentas[0].id_cuba, "CUBA03615DDD64E39434");
    assert.equal(cuentas[0].banco, "VENEZUELA");
    assert.equal(cuentas[1].numero_cuenta, "01050132601132126266");
  });

  it("elige la única cuenta cuando el banco del comprobante coincide", () => {
    const cuentas = parseSaeCuentasBancarias(catalogPayload);
    const matches = matchSaeCuentas("BDV", cuentas);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].id_cuba, "CUBA03615DDD64E39434");
  });

  it("no elige una cuenta si el banco tiene varias en SAE", () => {
    const cuentas = parseSaeCuentasBancarias(catalogPayload);
    const matches = matchSaeCuentas("Banco Mercantil", cuentas);
    assert.equal(matches.length, 2);
  });

  it("no devuelve cuentas si el banco no está en el catálogo", () => {
    const cuentas = parseSaeCuentasBancarias(catalogPayload);
    assert.deepEqual(matchSaeCuentas("Banesco", cuentas), []);
  });
});

describe("contrato SAE", () => {
  it("usa el número de contrato del único abonado activo", () => {
    const picked = pickSaeContract(
      [
        {
          abonadoId: "ABO-1",
          nroContrato: "20440",
          cedula: "V-12.345.678",
          estadoContrato: "ACTIVO",
        },
        {
          abonadoId: "ABO-2",
          nroContrato: "30001",
          cedula: "12345678",
          estadoContrato: "CORTADO",
        },
      ],
      "12345678",
    );
    assert.equal(picked?.idContrato, "20440");
    assert.equal(picked?.abonadoId, "ABO-1");
  });

  it("no adivina si hay dos contratos activos", () => {
    const picked = pickSaeContract(
      [
        {
          abonadoId: "ABO-1",
          nroContrato: "20440",
          cedula: "12345678",
          estadoContrato: "ACTIVO",
        },
        {
          abonadoId: "ABO-2",
          nroContrato: "30001",
          cedula: "12345678",
          estadoContrato: "ACTIVO",
        },
      ],
      "12345678",
    );
    assert.equal(picked, null);
  });
});

describe("etapa SAE del pago", () => {
  it("prioriza la conciliación sobre un error de registro", () => {
    const snapshot = readSaePaymentSnapshot({
      sae_stage: "error",
      sae_registro_at: "2026-11-24T12:00:00.000Z",
      sae_conciliado_at: "2026-11-24T13:00:00.000Z",
      sae_registro_error: "falló antes",
      sae_id_contrato: "20440",
      sae_id_cuba: "CUBA03615DDD64E39434",
    });
    assert.equal(snapshot.stage, "conciliada");
    assert.equal(snapshot.error, null);
    assert.equal(snapshot.idContrato, "20440");
  });

  it("conserva el pendiente de cuenta y su motivo", () => {
    const snapshot = readSaePaymentSnapshot({
      sae_stage: "pendiente_cuenta",
      sae_id_contrato: "20440",
      sae_registro_error: "Hay varias cuentas de ese banco en SAE.",
    });
    assert.equal(snapshot.stage, "pendiente_cuenta");
    assert.equal(snapshot.registroAt, null);
    assert.match(snapshot.error || "", /varias cuentas/);
  });
});
