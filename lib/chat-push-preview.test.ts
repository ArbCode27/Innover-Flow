import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_PUSH_MEDIA_PREVIEW,
  CHAT_PUSH_PREVIEW_MAX_LENGTH,
  buildChatPushPreview,
} from "./chat-push-preview.ts";
import {
  buildExpoChatPushMessage,
  buildExpoTicketPushMessage,
  collectUnregisteredExpoTokens,
  normalizeExpoTickets,
  sendExpoPushMessages,
} from "./expo-push.ts";

describe("buildChatPushPreview", () => {
  it("usa copys fijos para media y ubicación", () => {
    assert.equal(buildChatPushPreview({ mediaType: "image" }), "Te enviaron una imagen");
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
  it("arma el payload de chat que lee Star Conectados", () => {
    const message = buildExpoChatPushMessage({
      token: "ExponentPushToken[abc]",
      conversationId: 44,
      messageId: 90,
      body: "Tu factura está lista",
    });

    assert.equal(message.title, "Star Conectados");
    assert.equal(message.channelId, "star-chat");
    assert.equal(message.collapseId, "44");
    assert.equal(message.priority, "high");
    assert.deepEqual(message.data, {
      kind: "chat_message",
      conversationId: 44,
      messageId: 90,
      direction: "out",
    });
  });

  it("arma el payload de ticket de campo que lee Star Conectados", () => {
    const message = buildExpoTicketPushMessage({
      token: "ExponentPushToken[abc]",
      ticketId: "2f1c0a10-9c3a-4b11-8d2e-1a2b3c4d5e6f",
      publicId: 2046,
      title: "Caída de fibra",
      conversationId: 44,
    });

    assert.equal(message.title, "Visita técnica registrada");
    assert.equal(
      message.body,
      "Hay un seguimiento de visita en tu cuenta. Ábrelo en Mi ticket.",
    );
    assert.doesNotMatch(message.body, /[0-9a-f-]{36}/i);
    assert.equal(message.channelId, "star-ticket");
    assert.equal(message.collapseId, "2f1c0a10-9c3a-4b11-8d2e-1a2b3c4d5e6f");
    assert.deepEqual(message.data, {
      kind: "field_ticket",
      ticketId: "2f1c0a10-9c3a-4b11-8d2e-1a2b3c4d5e6f",
      publicId: 2046,
      title: "Caída de fibra",
      conversationId: 44,
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

  it("envía un request por token a Expo Push", async () => {
    const calls: unknown[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
      calls.push(JSON.parse(String(init?.body || "{}")));
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { status: "ok", id: `expo-${calls.length}` } }),
      };
    }) as typeof fetch;

    try {
      const { tickets } = await sendExpoPushMessages([
        buildExpoChatPushMessage({
          token: "ExponentPushToken[one]",
          conversationId: 1,
          messageId: 2,
          body: "Hola",
        }),
        buildExpoTicketPushMessage({
          token: "ExponentPushToken[two]",
          ticketId: "ticket-1",
          publicId: 9,
          title: "Visita",
          conversationId: 1,
        }),
      ]);
      assert.equal(calls.length, 2);
      assert.equal((calls[0] as { to: string }).to, "ExponentPushToken[one]");
      assert.equal((calls[1] as { to: string }).to, "ExponentPushToken[two]");
      assert.deepEqual(
        tickets.map((ticket) => ticket.id),
        ["expo-1", "expo-2"],
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
