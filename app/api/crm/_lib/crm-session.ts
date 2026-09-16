export const CRM_SESSION_COOKIE = "crm_session";

export interface CrmSessionData {
  agentId: number;
  role: string;
  organizationId: string;
  exp: number;
}

const getSecret = () => {
  const secret = process.env.CRM_INTERNAL_SECRET?.trim();
  if (!secret) {
    throw new Error("CRM_INTERNAL_SECRET is not configured");
  }
  return secret;
};

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const base64UrlToBytes = (base64url: string): Uint8Array => {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (base64.length % 4)) % 4;
  const binary = atob(base64 + "=".repeat(pad));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export async function createSignedSessionToken(
  agentId: number,
  role: string,
  organizationId: string,
): Promise<string> {
  const secret = getSecret();
  const encoder = new TextEncoder();
  const payloadStr = JSON.stringify({
    agentId,
    role,
    organizationId,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  const payloadB64 = bytesToBase64Url(encoder.encode(payloadStr));

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payloadB64),
  );

  const signatureB64 = bytesToBase64Url(new Uint8Array(signatureBuffer));
  return `${payloadB64}.${signatureB64}`;
}

export async function verifySignedSessionToken(
  token: string | null | undefined,
): Promise<CrmSessionData | null> {
  if (!token) return null;
  try {
    const [payloadB64, signatureB64] = token.split(".");
    if (!payloadB64 || !signatureB64) return null;

    const secret = getSecret();
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const signatureBytes = base64UrlToBytes(signatureB64);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes.slice().buffer,
      encoder.encode(payloadB64),
    );

    if (!isValid) return null;

    const payloadBytes = base64UrlToBytes(payloadB64);
    const decoder = new TextDecoder();
    const parsed = JSON.parse(decoder.decode(payloadBytes)) as CrmSessionData;

    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.organizationId) return null;
    if (Date.now() > parsed.exp) return null;

    return parsed;
  } catch {
    return null;
  }
}
