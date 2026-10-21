import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MESSAGE_PREVIEW_MAX_LENGTH,
  previewMessage,
  sanitizeMessageEventDetails,
} from "./message-event-log.ts";

describe("message-event-log", () => {
  it("recorta y aplana el preview del mensaje", () => {
    assert.equal(previewMessage("  hola\n\nmundo  "), "hola mundo");
    assert.equal(previewMessage(null), "");
    assert.equal(previewMessage(undefined), "");
    assert.equal(
      previewMessage("x".repeat(MESSAGE_PREVIEW_MAX_LENGTH + 20)).length,
      MESSAGE_PREVIEW_MAX_LENGTH,
    );
  });

  it("redacta campos sensibles y deja el resto intacto", () => {
    const sanitized = sanitizeMessageEventDetails({
      conversationId: 12,
      preview: "pago pendiente",
      access_token: "super-secret",
      jwt: "ey.header",
      hasToken: true,
    });

    assert.equal(sanitized.conversationId, 12);
    assert.equal(sanitized.preview, "pago pendiente");
    assert.equal(sanitized.access_token, "[redacted]");
    assert.equal(sanitized.jwt, "[redacted]");
    assert.equal(sanitized.hasToken, true);
  });
});
