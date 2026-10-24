import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPaymentInstructionFields,
  emptyPaymentMethodDraft,
  getPaymentMethodUiStatus,
  mergePaymentMethodCatalog,
  methodHasDestinationData,
  methodUsesPhone,
  paymentMethodDestinationSummary,
} from "./payment-methods.ts";

describe("payment-methods", () => {
  it("merges catalog with four known methods", () => {
    const catalog = mergePaymentMethodCatalog("org-1", []);
    assert.equal(catalog.length, 4);
    assert.deepEqual(
      catalog.map((item) => item.method_key),
      ["pago_movil", "transferencia", "deposito", "deposito_usd"],
    );
  });

  it("builds pago movil fields", () => {
    const fields = buildPaymentInstructionFields({
      ...emptyPaymentMethodDraft("org-1", "pago_movil"),
      bank_name: "Banplus",
      phone: "04121234567",
      document: "J-123",
    });
    assert.ok(fields.some((field) => field.label === "Teléfono"));
    assert.equal(
      fields.find((field) => field.label === "Banco")?.value,
      "Banplus",
    );
  });

  it("requires destination data before enabling", () => {
    assert.equal(
      methodHasDestinationData(emptyPaymentMethodDraft("org-1", "transferencia")),
      false,
    );
    assert.equal(
      methodHasDestinationData({
        ...emptyPaymentMethodDraft("org-1", "transferencia"),
        account_number: "0102",
      }),
      true,
    );
  });

  it("maps ui status and destination summary by method type", () => {
    assert.equal(methodUsesPhone("pago_movil"), true);
    assert.equal(methodUsesPhone("transferencia"), false);

    const empty = emptyPaymentMethodDraft("org-1", "pago_movil");
    assert.equal(getPaymentMethodUiStatus(empty), "hidden");
    assert.equal(
      getPaymentMethodUiStatus({ ...empty, is_enabled: true }),
      "incomplete",
    );
    assert.equal(
      getPaymentMethodUiStatus({
        ...empty,
        is_enabled: true,
        phone: "04121234567",
      }),
      "active",
    );

    assert.match(
      paymentMethodDestinationSummary({
        ...empty,
        bank_name: "Banplus",
        phone: "04121234567",
      }),
      /Banplus/,
    );
  });
});
