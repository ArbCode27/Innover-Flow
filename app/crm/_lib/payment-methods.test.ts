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
  it("merges catalog with five known methods", () => {
    const catalog = mergePaymentMethodCatalog("org-1", []);
    assert.equal(catalog.length, 5);
    assert.deepEqual(
      catalog.map((item) => item.method_key),
      ["pago_movil", "transferencia", "zelle", "binance", "paypal"],
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

  it("builds zelle / binance / paypal fields", () => {
    const zelle = buildPaymentInstructionFields({
      ...emptyPaymentMethodDraft("org-1", "zelle"),
      email: "pay@example.com",
      holder_name: "Ana Pérez",
    });
    assert.ok(zelle.some((field) => field.label === "Correo (Zelle)"));

    const binance = buildPaymentInstructionFields({
      ...emptyPaymentMethodDraft("org-1", "binance"),
      wallet_address: "TXabc123",
      crypto_network: "TRC20",
    });
    assert.ok(binance.some((field) => field.label === "Red (Network)"));

    const paypal = buildPaymentInstructionFields({
      ...emptyPaymentMethodDraft("org-1", "paypal"),
      email: "shop@example.com",
      link_url: "https://paypal.me/shop",
    });
    assert.ok(paypal.some((field) => field.label === "PayPal.Me"));
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
    assert.equal(
      methodHasDestinationData({
        ...emptyPaymentMethodDraft("org-1", "paypal"),
        email: "a@b.com",
      }),
      true,
    );
  });

  it("maps ui status and destination summary by method type", () => {
    assert.equal(methodUsesPhone("pago_movil"), true);
    assert.equal(methodUsesPhone("transferencia"), false);
    assert.equal(methodUsesPhone("zelle"), true);

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
