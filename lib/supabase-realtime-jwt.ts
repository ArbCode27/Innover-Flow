const REALTIME_TTL_SECONDS = 60 * 60;

export type RealtimeAppRole = "client" | "agent";

export type RealtimeJwtInput = {
  appRole: RealtimeAppRole;
  organizationId: string;
  subject: string;
  clientId?: number;
  conversationId?: number;
  ttlSeconds?: number;
};

export type RealtimeJwtResult = {
  accessToken: string;
  expiresAt: number;
};

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const getSupabaseJwtSecret = () =>
  process.env.SUPABASE_JWT_SECRET?.trim() || "";

export const isRealtimeJwtConfigured = () => Boolean(getSupabaseJwtSecret());

export const getRealtimePublicConfig = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "";
  if (!url || !anonKey) return null;
  return { url, anonKey };
};

export const createSupabaseRealtimeJwt = async (
  input: RealtimeJwtInput,
): Promise<RealtimeJwtResult | null> => {
  const secret = getSupabaseJwtSecret();
  if (!secret) return null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttl = input.ttlSeconds || REALTIME_TTL_SECONDS;
  const expiresAt = nowSeconds + ttl;
  const encoder = new TextEncoder();
  const header = bytesToBase64Url(
    encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const payload = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        aud: "authenticated",
        role: "authenticated",
        iss: "innover-crm",
        sub: input.subject,
        iat: nowSeconds,
        exp: expiresAt,
        app_role: input.appRole,
        organization_id: input.organizationId,
        ...(input.clientId ? { client_id: String(input.clientId) } : {}),
        ...(input.conversationId
          ? { conversation_id: String(input.conversationId) }
          : {}),
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signingInput),
  );

  return {
    accessToken: `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`,
    expiresAt: expiresAt * 1000,
  };
};

export const buildRealtimeClientPayload = async (input: {
  appRole: RealtimeAppRole;
  organizationId: string;
  subject: string;
  clientId?: number;
  conversationId?: number;
}) => {
  const publicConfig = getRealtimePublicConfig();
  const jwt = await createSupabaseRealtimeJwt(input);
  if (!publicConfig || !jwt) return null;
  return {
    url: publicConfig.url,
    anon_key: publicConfig.anonKey,
    access_token: jwt.accessToken,
    expires_at: jwt.expiresAt,
    conversation_id: input.conversationId ?? null,
  };
};
