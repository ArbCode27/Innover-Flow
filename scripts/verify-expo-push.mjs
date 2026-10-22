#!/usr/bin/env node
/**
 * Ops probe for Expo Push (Star Conectados).
 * Does NOT use app session.token. Optional EXPO_ACCESS_TOKEN from env / .env.local.
 *
 * Usage:
 *   pnpm verify:expo-push
 *   pnpm verify:expo-push -- --token "ExponentPushToken[xxxxxxxx]"
 *   pnpm verify:expo-push -- --token "…" --kind field_ticket
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";

const loadEnvFile = (fileName) => {
  const envPath = resolve(process.cwd(), fileName);
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
};

loadEnvFile(".env.local");
loadEnvFile(".env");

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] || null;
};

const token = getArg("--token");
const kind = getArg("--kind") || "chat_message";
const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim() || "";

console.log("==================================================");
console.log("  VERIFY EXPO PUSH (Innover-Flow / Star Conectados)");
console.log("==================================================");
console.log(`EXPO_ACCESS_TOKEN: ${accessToken ? "set" : "UNSET (optional unless Enhanced Security ON)"}`);
console.log(`Endpoint: ${EXPO_PUSH_SEND_URL}`);

if (!token) {
  console.log("");
  console.log("Dry run OK. No --token → no request sent (avoids DeviceNotRegistered noise).");
  console.log("");
  console.log("Next:");
  console.log('  1) Login APK → confirm row in public.app_devices');
  console.log('  2) pnpm verify:expo-push -- --token "ExponentPushToken[…]"');
  console.log("  3) Expect HTTP 200 + data.status=ok + data.id (expo ticket id)");
  console.log("  4) Or send a CRM type=out and check Vercel logs for [EXPO_PUSH] sent");
  console.log("");
  console.log("See scripts/app-push-checklist.md");
  process.exit(0);
}

const message =
  kind === "field_ticket"
    ? {
        to: token,
        title: "Visita técnica registrada",
        body: "Hay un seguimiento de visita en tu cuenta. Ábrelo en Mi ticket.",
        sound: "default",
        channelId: "star-ticket",
        priority: "high",
        collapseId: "verify-ticket",
        data: {
          kind: "field_ticket",
          ticketId: "00000000-0000-4000-8000-000000000001",
          publicId: 0,
          title: "Verificación push",
          conversationId: 0,
        },
      }
    : {
        to: token,
        title: "Star Conectados",
        body: "Prueba de notificación (Innover-Flow)",
        sound: "default",
        channelId: "star-chat",
        priority: "high",
        collapseId: "0",
        data: {
          kind: "chat_message",
          conversationId: 0,
          messageId: 0,
          direction: "out",
        },
      };

const headers = {
  "Content-Type": "application/json",
  Accept: "application/json",
};
if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

const response = await fetch(EXPO_PUSH_SEND_URL, {
  method: "POST",
  headers,
  body: JSON.stringify(message),
});

const payload = await response.json().catch(() => null);
const ticket = Array.isArray(payload?.data)
  ? payload.data[0]
  : payload?.data && typeof payload.data === "object"
    ? payload.data
    : null;

console.log(`HTTP_STATUS=${response.status}`);
console.log(`expoStatus=${ticket?.status ?? "n/a"}`);
console.log(`expoTicketId=${ticket?.id ?? "n/a"}`);
console.log("body=", JSON.stringify(payload));

if (!response.ok) {
  console.error("FAIL: Expo HTTP error. If 401/403, set EXPO_ACCESS_TOKEN in env/Vercel.");
  process.exit(1);
}

if (ticket?.status === "ok" && ticket?.id) {
  console.log("PASS: Expo accepted the push ticket. Confirm banner on the APK.");
  process.exit(0);
}

if (ticket?.details?.error === "DeviceNotRegistered") {
  console.error("FAIL: token invalid or unregistered. Re-login APK and re-register POST /api/app/devices.");
  process.exit(1);
}

console.error("FAIL: Expo did not return status=ok with id. See body above.");
process.exit(1);
