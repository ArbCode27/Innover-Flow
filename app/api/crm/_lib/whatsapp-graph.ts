const DEFAULT_GRAPH_VERSION = "v22.0";
const GRAPH_TIMEOUT_MS = 12_000;

export class WhatsappGraphError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "WhatsappGraphError";
  }
}

export type WhatsappPhoneNumber = {
  id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  code_verification_status: string | null;
  status: string | null;
  platform_type: string | null;
};

export const getMetaGraphVersion = () =>
  process.env.META_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION;

const getGraphErrorMessage = (body: Record<string, unknown>, fallback: string) => {
  const error = body.error as { message?: string; error_user_msg?: string } | undefined;
  return error?.error_user_msg || error?.message || fallback;
};

const graphFetch = async <T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> => {
  const version = getMetaGraphVersion();
  const url = path.startsWith("https://")
    ? path
    : `https://graph.facebook.com/${version}${path}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
    cache: "no-store",
  });

  const body = ((await response.json().catch(() => ({}))) || {}) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new WhatsappGraphError(
      getGraphErrorMessage(body, "Meta rechazó la solicitud de WhatsApp"),
      response.status >= 400 && response.status < 500 ? response.status : 502,
    );
  }
  return body as T;
};

export const getEmbeddedSignupEnv = () => {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID?.trim() || "";
  const configId =
    process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID?.trim() || "";
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim() || "";
  return {
    appId,
    configId,
    appSecret,
    graphVersion: getMetaGraphVersion(),
    ready: Boolean(appId && configId && appSecret),
  };
};

const requestAccessToken = async (
  graphVersion: string,
  appId: string,
  appSecret: string,
  code: string,
  redirectUri?: string,
) => {
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    code,
  });
  if (redirectUri) params.set("redirect_uri", redirectUri);

  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/oauth/access_token?${params.toString()}`,
    {
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
      cache: "no-store",
    },
  );
  const body = ((await response.json().catch(() => ({}))) || {}) as Record<
    string,
    unknown
  >;
  return { ok: response.ok, body };
};

export const exchangeEmbeddedSignupCode = async (code: string) => {
  const { appId, appSecret, graphVersion } = getEmbeddedSignupEnv();
  if (!appId || !appSecret) {
    throw new WhatsappGraphError(
      "Embedded Signup no está configurado en el servidor",
      503,
    );
  }

  let result = await requestAccessToken(graphVersion, appId, appSecret, code);
  if (!result.ok) {
    result = await requestAccessToken(
      graphVersion,
      appId,
      appSecret,
      code,
      "https://www.facebook.com/connect/login_success.html",
    );
  }
  if (!result.ok) {
    throw new WhatsappGraphError(
      getGraphErrorMessage(
        result.body,
        "No se pudo intercambiar el código de Meta",
      ),
      401,
    );
  }

  const accessToken = String(result.body.access_token || "").trim();
  if (!accessToken) {
    throw new WhatsappGraphError("Meta no devolvió un token de acceso", 502);
  }
  return accessToken;
};

export const listWabaPhoneNumbers = async (
  accessToken: string,
  wabaId: string,
): Promise<WhatsappPhoneNumber[]> => {
  const body = await graphFetch<{ data?: WhatsappPhoneNumber[] }>(
    `/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,status,platform_type`,
    accessToken,
  );
  return (body.data || []).filter((phone) => Boolean(phone.id));
};

export const subscribeWabaToApp = async (
  accessToken: string,
  wabaId: string,
) => {
  await graphFetch<Record<string, unknown>>(
    `/${encodeURIComponent(wabaId)}/subscribed_apps`,
    accessToken,
    { method: "POST" },
  );
};

export const verifyWhatsappPhone = async (
  accessToken: string,
  wabaId: string,
  phoneNumberId: string,
) => {
  const body = await graphFetch<Record<string, unknown>>(
    `/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,status,platform_type,throughput`,
    accessToken,
  );

  return {
    waba_id: wabaId,
    phone_number_id: phoneNumberId,
    display_phone_number: body.display_phone_number || null,
    verified_name: body.verified_name || null,
    quality_rating: body.quality_rating || null,
    status: body.status || null,
    code_verification_status: body.code_verification_status || null,
    platform_type: body.platform_type || "CLOUD_API",
    coexistence_enabled: true,
    coexistence_auto_human: true,
    coexistence_sync_echoes: true,
  };
};

export const resolveSignupPhoneNumberId = (
  phones: WhatsappPhoneNumber[],
  preferredId?: string,
) => {
  if (preferredId) {
    const match = phones.find((phone) => phone.id === preferredId);
    if (!match) {
      throw new WhatsappGraphError(
        "El número elegido no pertenece a la cuenta de WhatsApp conectada",
        409,
      );
    }
    return match.id;
  }
  if (phones.length === 1) return phones[0].id;
  return null;
};
