import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_PUSH_MEDIA_PREVIEW,
  CHAT_PUSH_PREVIEW_MAX_LENGTH,
  buildChatPushPreview,
} from "./chat-push-preview.ts";
import {
  buildExpoChatPushMessage,
  buildExpoIncidentPushMessage,
  buildExpoNetworkAlertPushMessage,
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

  it("envía el lote de mensajes a Expo Push", async () => {
    const calls: unknown[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
      calls.push(JSON.parse(String(init?.body || "[]")));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { status: "ok", id: "expo-1" },
            { status: "ok", id: "expo-2" },
          ],
        }),
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
      assert.equal(calls.length, 1);
      const batch = calls[0] as Array<{ to: string }>;
      assert.equal(batch.length, 2);
      assert.equal(batch[0].to, "ExponentPushToken[one]");
      assert.equal(batch[1].to, "ExponentPushToken[two]");
      assert.deepEqual(
        tickets.map((ticket) => ticket.id),
        ["expo-1", "expo-2"],
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("genera colores hexadecimales en minúsculas válidos para Expo Push API", () => {
    const criticalAlert = buildExpoNetworkAlertPushMessage({
      token: "ExponentPushToken[alert-crit]",
      clients: [{ name: "Cliente Uno", board: 1, port: 1, incidentType: "LOS" }],
    });
    assert.equal(criticalAlert.color, "#ef4444");
    assert.match(criticalAlert.color ?? "", /^#[0-9a-f]{6}$/);

    const warningAlert = buildExpoNetworkAlertPushMessage({
      token: "ExponentPushToken[alert-warn]",
      clients: [{ name: "Cliente Dos", board: 1, port: 1, incidentType: "Potencia alterada" }],
    });
    assert.equal(warningAlert.color, "#f59e0b");
    assert.match(warningAlert.color ?? "", /^#[0-9a-f]{6}$/);

    const restoredAlert = buildExpoNetworkAlertPushMessage({
      token: "ExponentPushToken[alert-restored]",
      clients: [],
      forcedSeverity: "normal",
    });
    assert.equal(restoredAlert.color, "#10b981");
    assert.match(restoredAlert.color ?? "", /^#[0-9a-f]{6}$/);

    const resolvedIncident = buildExpoIncidentPushMessage({
      token: "ExponentPushToken[inc-res]",
      title: "Resuelto",
      body: "Normal",
      board: 1,
      port: 1,
      incidentType: "resolved",
      affectedCount: 0,
      losCount: 0,
      alteredCount: 0,
    });
    assert.equal(resolvedIncident.color, "#10b981");
    assert.match(resolvedIncident.color ?? "", /^#[0-9a-f]{6}$/);

    const alteredIncident = buildExpoIncidentPushMessage({
      token: "ExponentPushToken[inc-alt]",
      title: "Alarma",
      body: "Potencia",
      board: 1,
      port: 1,
      incidentType: "altered_power",
      affectedCount: 2,
      losCount: 0,
      alteredCount: 2,
    });
    assert.equal(alteredIncident.color, "#f59e0b");
    assert.match(alteredIncident.color ?? "", /^#[0-9a-f]{6}$/);

    const outageIncident = buildExpoIncidentPushMessage({
      token: "ExponentPushToken[inc-outage]",
      title: "Corte",
      body: "LOS",
      board: 1,
      port: 1,
      incidentType: "massive_outage",
      affectedCount: 5,
      losCount: 5,
      alteredCount: 0,
    });
    assert.equal(outageIncident.color, "#ef4444");
    assert.match(outageIncident.color ?? "", /^#[0-9a-f]{6}$/);
  });

  it("sanitiza defensivamente el campo color antes de enviar a Expo", async () => {
    let capturedPayload: unknown = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
      capturedPayload = JSON.parse(String(init?.body || "[]"));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ status: "ok", id: "expo-sanitized-1" }, { status: "ok", id: "expo-sanitized-2" }],
        }),
      };
    }) as typeof fetch;

    try {
      await sendExpoPushMessages([
        {
          to: "ExponentPushToken[upper]",
          title: "Upper Color",
          body: "Prueba",
          color: " #EF4444 ",
        },
        {
          to: "ExponentPushToken[invalid]",
          title: "Invalid Color",
          body: "Prueba",
          color: "invalid-color",
        },
      ]);

      const batch = capturedPayload as Array<{ to: string; color?: string }>;
      assert.equal(batch[0].color, "#ef4444");
      assert.match(batch[0].color ?? "", /^#[0-9a-f]{6}$/);
      // undefined color in object becomes omitted in JSON.stringify
      assert.equal(batch[1].color, undefined);
      assert.equal("color" in batch[1], false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
