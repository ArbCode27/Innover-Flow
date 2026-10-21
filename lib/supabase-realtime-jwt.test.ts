import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSupabaseRealtimeJwt } from "./supabase-realtime-jwt.ts";

const decodePayload = (token: string) => {
  const payload = token.split(".")[1];
  const padded = payload.replace(/-/g, "+").replace(/_/g, "/") + "==";
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
};

describe("supabase-realtime-jwt", () => {
  it("devuelve null si no hay JWT secret", async () => {
    const previous = process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_JWT_SECRET;
    const token = await createSupabaseRealtimeJwt({
      appRole: "client",
      organizationId: "org-1",
      subject: "client:1",
      clientId: 1,
      conversationId: 9,
    });
    assert.equal(token, null);
    if (previous) process.env.SUPABASE_JWT_SECRET = previous;
  });

  it("firma un JWT HS256 con claims de cliente", async () => {
    process.env.SUPABASE_JWT_SECRET = "test-realtime-secret-32bytes-long!!";
    const token = await createSupabaseRealtimeJwt({
      appRole: "client",
      organizationId: "ea2d865e-64c5-4c03-b8a3-9c1591976069",
      subject: "client:105",
      clientId: 105,
      conversationId: 204,
      ttlSeconds: 120,
    });
    assert.ok(token);
    assert.equal(token.accessToken.split(".").length, 3);
    const payload = decodePayload(token.accessToken);
    assert.equal(payload.role, "authenticated");
    assert.equal(payload.app_role, "client");
    assert.equal(payload.client_id, "105");
    assert.equal(payload.conversation_id, "204");
    assert.equal(payload.organization_id, "ea2d865e-64c5-4c03-b8a3-9c1591976069");
    assert.ok(payload.exp * 1000 === token.expiresAt);
  });
});
