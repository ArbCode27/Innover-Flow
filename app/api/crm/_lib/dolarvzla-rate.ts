const LOG_PREFIX = "[DOLARVZLA_BCV]";
/** Official BCV rates feed from dolarvzla. */
const DEFAULT_URL = "https://rates.dolarvzla.com/bcv/current.json";
const REQUEST_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type BcvRateSnapshot = {
  /** Primary USD→Bs rate from current.usd */
  rate: number;
  usd: number;
  eur: number | null;
  asOf: string;
  previousUsd: number | null;
  changePercentageUsd: number | null;
  source: "dolarvzla_bcv";
  cached: boolean;
};

export class DolarVzlaError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "DolarVzlaError";
    this.status = status;
  }
}

type CacheEntry = {
  expiresAt: number;
  snapshot: BcvRateSnapshot;
};

let cache: CacheEntry | null = null;

const getApiUrl = () =>
  process.env.DOLARVZLA_API_URL?.trim() ||
  process.env.DOLARVZLA_BCV_URL?.trim() ||
  DEFAULT_URL;

const parsePositiveNumber = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};

const parseFiniteNumber = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
};

export const roundMoney = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** Formats Bs with VE style: thousands ".", decimals ",". */
export const formatBolivares = (value: number) => {
  const fixed = roundMoney(value, 2).toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `Bs. ${withThousands},${decPart}`;
};

export const formatUsd = (value: number) => {
  const fixed = roundMoney(value, 2).toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$${withThousands},${decPart}`;
};

export const convertUsdToBs = (usd: number, rate: number) =>
  roundMoney(usd * rate, 2);

const parseBcvPayload = (parsed: unknown): BcvRateSnapshot | null => {
  if (!parsed || typeof parsed !== "object") return null;
  const root = parsed as Record<string, unknown>;
  const current =
    root.current && typeof root.current === "object"
      ? (root.current as Record<string, unknown>)
      : null;
  if (!current) return null;

  const usd = parsePositiveNumber(current.usd);
  const date =
    typeof current.date === "string" && current.date.trim()
      ? current.date.trim()
      : null;
  if (!usd || !date) return null;

  const previous =
    root.previous && typeof root.previous === "object"
      ? (root.previous as Record<string, unknown>)
      : null;
  const change =
    root.changePercentage && typeof root.changePercentage === "object"
      ? (root.changePercentage as Record<string, unknown>)
      : null;

  return {
    rate: usd,
    usd,
    eur: parsePositiveNumber(current.eur),
    asOf: date,
    previousUsd: previous ? parsePositiveNumber(previous.usd) : null,
    changePercentageUsd: change ? parseFiniteNumber(change.usd) : null,
    source: "dolarvzla_bcv",
    cached: false,
  };
};

const fetchFreshRate = async (): Promise<BcvRateSnapshot> => {
  const url = getApiUrl();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} request_failed`, {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    throw new DolarVzlaError("No se pudo conectar con la tasa BCV", 502);
  }

  const rawBody = await response.text();
  let parsed: unknown = null;
  if (rawBody) {
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    console.error(`${LOG_PREFIX} rejected`, {
      status: response.status,
      body: rawBody.slice(0, 300),
    });
    throw new DolarVzlaError(
      "No se pudo obtener la tasa BCV",
      response.status,
    );
  }

  const snapshot = parseBcvPayload(parsed);
  if (!snapshot) {
    console.error(`${LOG_PREFIX} invalid_payload`, {
      body: rawBody.slice(0, 300),
    });
    throw new DolarVzlaError("Respuesta de tasa BCV inválida", 502);
  }

  cache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    snapshot: { ...snapshot, cached: true },
  };

  console.log(`${LOG_PREFIX} rate_ok`, {
    rate: snapshot.rate,
    asOf: snapshot.asOf,
  });

  return snapshot;
};

/** Returns current BCV USD rate. Uses a short in-memory cache. */
export const getBcvRate = async (): Promise<BcvRateSnapshot> => {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.snapshot;
  }

  return fetchFreshRate();
};

export const enrichDebtWithBcv = async (debtUsd: number) => {
  try {
    const rate = await getBcvRate();
    const debtBs = convertUsdToBs(debtUsd, rate.rate);
    return {
      ok: true as const,
      debt_usd: roundMoney(debtUsd, 2),
      debt_bs: debtBs,
      debt_usd_formatted: formatUsd(debtUsd),
      debt_bs_formatted: formatBolivares(debtBs),
      bcv_rate: rate.rate,
      bcv_usd: rate.usd,
      bcv_eur: rate.eur,
      bcv_as_of: rate.asOf,
      bcv_source: rate.source,
      bcv_cached: rate.cached,
      bcv_change_percentage_usd: rate.changePercentageUsd,
    };
  } catch (error) {
    const message =
      error instanceof DolarVzlaError
        ? error.message
        : error instanceof Error
          ? error.message
          : "No se pudo obtener la tasa BCV";

    console.warn(`${LOG_PREFIX} enrich_failed`, { message });
    return {
      ok: false as const,
      debt_usd: roundMoney(debtUsd, 2),
      debt_usd_formatted: formatUsd(debtUsd),
      debt_bs: null,
      debt_bs_formatted: null,
      bcv_rate: null,
      bcv_error: message,
      hint: "Informa solo el saldo en USD. No inventes tasa ni bolívares.",
    };
  }
};
