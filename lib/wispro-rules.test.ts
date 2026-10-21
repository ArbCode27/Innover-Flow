import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildVeDocumentCandidates,
  canShareWisproId,
  isLegacyWisproIssueId,
  isLegacyWisproOrderId,
  isFullPayment,
  localWisproOrderId,
  matchesNameLocally,
  normalizeDocumentDigits,
  parseCommercialPlanPrice,
  resolveDebtFromCurrentAccount,
  resolveApprovePayment,
  resolveExclusiveWhatsappReleaseIds,
} from "./wispro-rules.ts";

describe("wispro debt by balance sign", () => {
  it("usa abs(balance) solo cuando el saldo es negativo", () => {
    assert.equal(resolveDebtFromCurrentAccount({ balance_amount: -30 }), 30);
    assert.equal(resolveDebtFromCurrentAccount({ balance_amount: -30.129 }), 30.13);
    assert.equal(resolveDebtFromCurrentAccount({ balance_amount: 0 }), 0);
    assert.equal(resolveDebtFromCurrentAccount({ balance_amount: 15 }), 0);
    assert.equal(resolveDebtFromCurrentAccount(null), 0);
  });
});

describe("wispro invoice match: una sola factura", () => {
  const older = {
    id: "inv-old",
    balance: 20,
    amount: 20,
    issuedAt: "2026-01-01",
    firstDueDate: "2026-01-10",
    invoiceNumber: "1",
    state: "pending",
  };
  const newer = {
    id: "inv-new",
    balance: 30,
    amount: 30,
    issuedAt: "2026-03-01",
    firstDueDate: "2026-03-10",
    invoiceNumber: "2",
    state: "pending",
  };

  it("elige la factura más reciente con balance > 0.01 e ignora el resto", () => {
    const decision = resolveApprovePayment({
      paidAmount: 30,
      invoices: [older, newer, { ...older, id: "tiny", balance: 0.005 }],
    });
    assert.equal(decision.strategy, "single_latest");
    assert.deepEqual(decision.invoiceIds, ["inv-new"]);
    assert.deepEqual(decision.ignoredInvoiceIds, ["inv-old"]);
    assert.equal(decision.kind, "exact");
    assert.equal(decision.postAmount, 30);
  });

  it("redondea shortfall ≤ 0.15 y postea expected", () => {
    const decision = resolveApprovePayment({
      paidAmount: 29.9,
      invoices: [newer],
    });
    assert.equal(decision.kind, "rounded");
    assert.equal(decision.postAmount, 30);
    assert.equal(decision.expectedAmount, 30);
    assert.equal(decision.remainingAmount, 0);
  });

  it("no redondea shortfall > 0.15: partial y postea paid", () => {
    const decision = resolveApprovePayment({
      paidAmount: 29.8,
      invoices: [newer],
    });
    assert.equal(decision.kind, "partial");
    assert.equal(decision.postAmount, 29.8);
    assert.equal(decision.remainingAmount, 0.2);
  });

  it("overpay > 0.15 es crédito a favor y postea paid", () => {
    const decision = resolveApprovePayment({
      paidAmount: 30.2,
      invoices: [newer],
    });
    assert.equal(decision.kind, "credit");
    assert.equal(decision.postAmount, 30.2);
    assert.deepEqual(decision.invoiceIds, ["inv-new"]);
  });

  it("sin factura acredita current_account y usa precio del plan como expected", () => {
    const decision = resolveApprovePayment({
      paidAmount: 30,
      invoices: [],
      planAmount: 35,
    });
    assert.equal(decision.kind, "account_credit");
    assert.equal(decision.postAmount, 30);
    assert.equal(decision.expectedAmount, 35);
    assert.deepEqual(decision.invoiceIds, []);
  });
});

describe("wispro document candidates V/E/J/G", () => {
  it("prueba dígitos primero y luego prefijos sin guiones", () => {
    assert.equal(normalizeDocumentDigits("V-12.345.678"), "12345678");
    assert.deepEqual(buildVeDocumentCandidates("12345678"), [
      "12345678",
      "V12345678",
      "E12345678",
      "J12345678",
      "G12345678",
    ]);
    assert.deepEqual(buildVeDocumentCandidates("V-12.345.678"), [
      "12345678",
      "V12345678",
      "E12345678",
      "J12345678",
      "G12345678",
    ]);
  });
});

describe("wispro associate no-único", () => {
  it("permite el mismo wispro_id en varios chats y libera whatsapp_id de stubs", () => {
    assert.equal(canShareWisproId("abc-1", "abc-1"), true);
    assert.equal(canShareWisproId("abc-1", "abc-2"), false);
    assert.deepEqual(
      resolveExclusiveWhatsappReleaseIds({
        whatsappId: "584121111111",
        keepClientId: 10,
        clients: [
          { id: 10, whatsapp_id: "584121111111" },
          { id: 11, whatsapp_id: "584121111111" },
          { id: 12, whatsapp_id: "584122222222" },
        ],
      }),
      [11],
    );
  });
});

describe("wispro helpers", () => {
  it("parsea precio comercial desde name con $", () => {
    assert.equal(parseCommercialPlanPrice({ name: "Plan 30$" }), 30);
    assert.equal(parseCommercialPlanPrice({ name: "$25.5 Plan" }), 25.5);
    assert.equal(parseCommercialPlanPrice({ name: "30 MEGAS", price: 40 }), 40);
    assert.equal(parseCommercialPlanPrice({ name: "30 MEGAS" }), null);
  });

  it("marca ids legacy y genera order local", () => {
    assert.equal(isLegacyWisproIssueId("aabbccdd"), true);
    assert.equal(isLegacyWisproIssueId("aa-bb-cc"), false);
    assert.equal(isLegacyWisproOrderId("uuid-order"), true);
    assert.equal(isLegacyWisproOrderId("ord-abc"), false);
    assert.equal(localWisproOrderId("abc"), "ord-abc");
  });

  it("filtra nombre local y tolerancia de promesa ±0.50", () => {
    assert.equal(matchesNameLocally("María Pérez", "maria"), true);
    assert.equal(matchesNameLocally("José", "ana"), false);
    assert.equal(isFullPayment(29.6, 30), true);
    assert.equal(isFullPayment(29.4, 30), false);
  });
});
