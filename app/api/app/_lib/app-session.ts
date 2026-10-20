export interface AppSessionData {
  clientId: number;
  organizationId: string;
  phone: string;
  exp: number;
}

const getSecret = () => {
  const secret =
    process.env.APP_CHANNEL_SECRET?.trim() ||
    process.env.CRM_INTERNAL_SECRET?.trim();
  if (!secret) {
    throw new Error("APP_CHANNEL_SECRET o CRM_INTERNAL_SECRET no está configurado");
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

export const createAppSessionToken = async (input: {
  clientId: number;
  organizationId: string;
  phone: string;
}): Promise<string> => {
  const secret = getSecret();
  const encoder = new TextEncoder();
  const payloadB64 = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        clientId: input.clientId,
        organizationId: input.organizationId,
        phone: input.phone,
        exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
      }),
    ),
  );
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
  return `${payloadB64}.${bytesToBase64Url(new Uint8Array(signatureBuffer))}`;
};

export const verifyAppSessionToken = async (
  token: string | null | undefined,
): Promise<AppSessionData | null> => {
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
    const parsed = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(payloadB64)),
    ) as AppSessionData;
    if (!parsed?.organizationId || !parsed.clientId) return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const assertAppChannelSecret = (request: Request) => {
  const expected =
    process.env.APP_CHANNEL_SECRET?.trim() ||
    process.env.CRM_INTERNAL_SECRET?.trim() ||
    "";
  if (!expected) {
    throw new Error("APP_CHANNEL_SECRET no está configurado");
  }
  const header = request.headers.get("x-app-secret")?.trim() || "";
  if (header !== expected) {
    const error = new Error("Secret de app inválido") as Error & { status: number };
    error.status = 401;
    throw error;
  }
};
