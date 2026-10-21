import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_PUSH_MEDIA_PREVIEW,
  CHAT_PUSH_PREVIEW_MAX_LENGTH,
  buildChatPushPreview,
} from "./chat-push-preview.ts";
import {
  buildExpoChatPushMessage,
  collectUnregisteredExpoTokens,
  normalizeExpoTickets,
} from "./expo-push.ts";

describe("buildChatPushPreview", () => {
  it("usa copys fijos para media y ubicación", () => {
    assert.equal(buildChatPushPreview({ mediaType: "image" }), CHAT_PUSH_MEDIA_PREVIEW.image);
    assert.equal(buildChatPushPreview({ mediaType: "audio" }), CHAT_PUSH_MEDIA_PREVIEW.audio);
    assert.equal(buildChatPushPreview({ mediaType: "video" }), CHAT_PUSH_MEDIA_PREVIEW.video);
    assert.equal(
      buildChatPushPreview({ mediaType: "document" }),
      CHAT_PUSH_MEDIA_PREVIEW.document,
    );
    assert.equal(
      buildChatPushPreview({ latitude: 10.48, longitude: -66.9 }),
      CHAT_PUSH_MEDIA_PREVIEW.location,
    );
  });

  it("recorta texto humano y oculta JSON, markdown de tools e IDs", () => {
    assert.equal(buildChatPushPreview({ content: "  Hola\ncliente  " }), "Hola cliente");
    assert.equal(
      buildChatPushPreview({ content: '{"tool":"lookup_wispro"}' }),
      "Nuevo mensaje",
    );
    assert.equal(
      buildChatPushPreview({
        content: "Listo ```json {\"id\":1}``` para ti",
      }),
      "Listo para ti",
    );
    assert.equal(
      buildChatPushPreview({
        content: "Caso 2f1c0a10-9c3a-4b11-8d2e-1a2b3c4d5e6f listo",
      }),
      "Caso listo",
    );
    assert.equal(
      buildChatPushPreview({ content: "x".repeat(CHAT_PUSH_PREVIEW_MAX_LENGTH + 12) }).length,
      CHAT_PUSH_PREVIEW_MAX_LENGTH,
    );
  });

  it("no usa copys inventados de pago o asesor", () => {
    const preview = buildChatPushPreview({ content: "   " });
    assert.equal(preview, "Nuevo mensaje");
    assert.doesNotMatch(preview, /pago aprobado/i);
    assert.doesNotMatch(preview, /asesor te atiende/i);
  });
});

describe("expo push tickets", () => {
  it("arma el payload que lee Star Conectados", () => {
    const message = buildExpoChatPushMessage({
      token: "ExponentPushToken[abc]",
      conversationId: 44,
      messageId: 90,
      body: "Tu factura está lista",
    });

    assert.equal(message.title, "Star Conectados");
    assert.equal(message.channelId, "star-chat");
    assert.equal(message.collapseId, "chat-44");
    assert.equal(message.priority, "high");
    assert.deepEqual(message.data, {
      kind: "chat_message",
      conversationId: "44",
      messageId: "90",
      direction: "out",
    });
  });

  it("borra solo tokens DeviceNotRegistered", () => {
    const tokens = ["token-a", "token-b", "token-c"];
    const tickets = normalizeExpoTickets({
      data: [
        { status: "ok", id: "1" },
        { status: "error", details: { error: "DeviceNotRegistered" } },
        { status: "error", details: { error: "MessageTooBig" } },
      ],
    });

    assert.deepEqual(collectUnregisteredExpoTokens(tokens, tickets), ["token-b"]);
  });
});
