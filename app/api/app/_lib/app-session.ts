export type AppSessionRole = "customer" | "technician" | "supervisor";

export interface AppSessionData {
  role: AppSessionRole;
  organizationId: string;
  phone: string;
  exp: number;
  /** Present for customer sessions (legacy tokens always have this). */
  clientId: number | null;
  /** Present for technician / supervisor sessions. */
  technicianId: string | null;
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
  role: AppSessionRole;
  organizationId: string;
  phone: string;
  clientId?: number | null;
  technicianId?: string | null;
}): Promise<string> => {
  const secret = getSecret();
  const encoder = new TextEncoder();
  const clientId =
    input.role === "customer" && input.clientId != null
      ? Number(input.clientId)
      : null;
  const technicianId =
    (input.role === "technician" || input.role === "supervisor") &&
    input.technicianId
      ? String(input.technicianId)
      : null;

  if (input.role === "customer" && (!clientId || clientId <= 0)) {
    throw new Error("clientId es requerido para sesión de cliente");
  }
  if (
    (input.role === "technician" || input.role === "supervisor") &&
    !technicianId
  ) {
    throw new Error("technicianId es requerido para sesión de técnico");
  }

  const payloadB64 = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        role: input.role,
        organizationId: input.organizationId,
        phone: input.phone,
        clientId,
        technicianId,
        exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
      } satisfies AppSessionData),
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
    ) as Partial<AppSessionData> & { clientId?: number | null };

    if (!parsed?.organizationId) return null;
    if (typeof parsed.exp !== "number" || Date.now() > parsed.exp) return null;

    const legacyClientId =
      typeof parsed.clientId === "number" && parsed.clientId > 0
        ? parsed.clientId
        : null;
    const technicianId =
      typeof parsed.technicianId === "string" && parsed.technicianId.trim()
        ? parsed.technicianId.trim()
        : null;

    let role = parsed.role;
    if (!role) {
      // Tokens emitidos antes del soporte multi-rol.
      if (legacyClientId) role = "customer";
      else if (technicianId) role = "technician";
      else return null;
    }

    if (role === "customer") {
      if (!legacyClientId) return null;
      return {
        role: "customer",
        organizationId: String(parsed.organizationId),
        phone: String(parsed.phone || ""),
        exp: parsed.exp,
        clientId: legacyClientId,
        technicianId: null,
      };
    }

    if (role === "technician" || role === "supervisor") {
      if (!technicianId) return null;
      return {
        role,
        organizationId: String(parsed.organizationId),
        phone: String(parsed.phone || ""),
        exp: parsed.exp,
        clientId: null,
        technicianId,
      };
    }

    return null;
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
    const error = new Error(
      "El servicio de acceso no está disponible en este momento. Intenta más tarde.",
    ) as Error & { status: number; code: string };
    error.status = 503;
    error.code = "SECRET_NOT_CONFIGURED";
    throw error;
  }
  const header = request.headers.get("x-app-secret")?.trim() || "";
  if (header !== expected) {
    const error = new Error(
      "No se pudo validar la aplicación. Contacte a soporte.",
    ) as Error & { status: number; code: string };
    error.status = 401;
    error.code = "INVALID_SECRET";
    throw error;
  }
};
