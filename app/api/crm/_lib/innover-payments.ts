const LOG_PREFIX = "[INNOVER_PAYMENTS]";
const DEFAULT_PAYMENTS_URL =
  "https://backend-innover.vercel.app/api/v1/payments";
const REQUEST_TIMEOUT_MS = 20_000;

/** API Innover expects amount and transaction_code as strings. */
export type InnoverPaymentPayload = {
  client_id: string;
  amount: string;
  transaction_code: string;
  bank: string;
  name: string;
  cedula: string;
  phone_id: string;
};

export class InnoverPaymentsError extends Error {
  readonly status: number;
  readonly body: string | null;

  constructor(message: string, status: number, body: string | null = null) {
    super(message);
    this.name = "InnoverPaymentsError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Normalizes VE-style amounts ("6.687,00" / "6687,5" / 6687) to an API string.
 */
export const normalizeAmountToApiString = (value: string | number): string | null => {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    const fixed = Number.isInteger(value)
      ? String(value)
      : value.toFixed(2).replace(/\.?0+$/, "");
    return fixed || null;
  }

  let raw = value.trim();
  if (!raw) return null;

  if (raw.includes(",") && raw.includes(".")) {
    // 6.687,00 → 6687.00
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (raw.includes(",")) {
    raw = raw.replace(",", ".");
  }

  raw = raw.replace(/[^\d.]/g, "");
  if (!raw) return null;

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return Number.isInteger(parsed)
    ? String(parsed)
    : parsed.toFixed(2).replace(/\.?0+$/, "");
};

export const normalizeTransactionCodeToApiString = (
  value: string | number,
): string | null => {
  const digits =
    typeof value === "number"
      ? String(Math.trunc(value)).replace(/\D/g, "")
      : value.replace(/\D/g, "");

  if (!digits || digits.length < 1 || digits.length > 24) return null;
  return digits;
};

const getPaymentsUrl = () =>
  process.env.INNOVER_PAYMENTS_API_URL?.trim() || DEFAULT_PAYMENTS_URL;

export const submitInnoverPayment = async (
  payload: InnoverPaymentPayload,
): Promise<{ status: number; body: unknown }> => {
  const url = getPaymentsUrl();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const apiKey = process.env.INNOVER_PAYMENTS_API_KEY?.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  console.log(`${LOG_PREFIX} submit_started`, {
    url,
    clientId: payload.client_id,
    amount: payload.amount,
    transactionCode: payload.transaction_code,
    bank: payload.bank,
    cedula: payload.cedula,
    phoneId: payload.phone_id,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} request_failed`, {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    throw new InnoverPaymentsError(
      "No se pudo conectar con el API de pagos Innover",
      502,
    );
  }

  const rawBody = await response.text();
  let parsed: unknown = null;
  if (rawBody) {
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      parsed = rawBody;
    }
  }

  if (!response.ok) {
    console.error(`${LOG_PREFIX} submit_rejected`, {
      status: response.status,
      body: rawBody.slice(0, 500),
    });
    throw new InnoverPaymentsError(
      "El API de pagos rechazó el comprobante",
      response.status,
      rawBody || null,
    );
  }

  console.log(`${LOG_PREFIX} submit_ok`, {
    status: response.status,
  });

  return { status: response.status, body: parsed };
};
