/**
 * Cliente HTTP oficial para la API de Wispro Cloud (v1).
 * Todas las llamadas se realizan exclusivamente en el servidor (Route Handlers).
 */

// ⚠️ AJUSTAR: Nombre del campo esperado para la asignación de técnico en /order/orders/{id}/schedule.
// En caso de que Wispro requiera "assignable_id" en lugar de "employee_id", cambiar solo esta constante.
export const CAMPO_TECNICO: "employee_id" | "assignable_id" = "employee_id";

const DEFAULT_BASE_URL = "https://www.cloud.wispro.co/api/v1";
const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

export interface WisproCategory {
  id: string;
  name: string;
  level: "High" | "Low" | string;
  public_for_mobile?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface WisproEmployee {
  id: string; // UUID
  public_id?: number | string;
  name: string;
  phone?: string | null;
  phone_mobile?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface WisproClient {
  id: string;
  public_id?: number;
  name?: string;
  phone?: string;
  phone_mobile?: string;
  national_identification_number?: string;
  email?: string;
  address?: string;
  [key: string]: unknown;
}

export interface WisproContract {
  id: string;
  public_id?: number;
  client_id?: string;
  plan_name?: string;
  state?: string;
  address?: string;
  lat?: number;
  long?: number;
  [key: string]: unknown;
}

export interface WisproApiResponse<T = unknown> {
  status: number;
  meta?: Record<string, unknown>;
  data: T[];
}

export interface CreateIssueInput {
  title: string;
  description: string;
  category_id: string;
  client_id?: string;
  contract_id?: string;
  assignable_id?: string;
}

export interface CreateOrderInput {
  order: {
    state: "pending" | "to_reschedule" | "finalized" | "closed";
    kind: "technical" | "installation" | "resignation" | "feasibility";
    result?: "not_set" | "success" | "failure";
    description?: string;
    ticketable_id?: string;
    ticketable_type?: "HelpDesk" | "SaleDesk";
    orderable_id?: string;
    orderable_type?: "Contract" | "Prospect";
    start_at?: string;
    end_at?: string;
  };
  gps_point_attributes?: {
    street?: string;
    number?: string;
    city?: string;
    state?: string;
    country_code?: string;
    latitude: number;
    longitude: number;
  };
}

export class WisproHttpError extends Error {
  readonly status: number;
  readonly rawBody: string;

  constructor(status: number, message: string, rawBody: string) {
    super(`Wispro HTTP ${status}: ${message}`);
    this.name = "WisproHttpError";
    this.status = status;
    this.rawBody = rawBody;
  }
}

const getCredentials = (override?: { apiKey?: string; baseUrl?: string }) => {
  const apiKey =
    override?.apiKey?.trim() ||
    process.env.WISPRO_API_KEY?.trim() ||
    process.env.WISPRO_API_TOKEN?.trim();

  if (!apiKey) {
    throw new Error("WISPRO_API_KEY no configurado en variables de entorno");
  }

  const baseUrl = (
    override?.baseUrl?.trim() ||
    process.env.WISPRO_BASE_URL?.trim() ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");

  return { apiKey, baseUrl };
};

/**
 * Realiza una petición HTTP a Wispro aplicando:
 * 1. Autenticación cruda (sin Bearer)
 * 2. Timeout de 15 segundos
 * 3. Hasta 2 reintentos con backoff exponencial sólo en errores de red o 5xx.
 * 4. NUNCA reintenta un método POST que ya devolvió un estado 2xx.
 */
export async function wisproFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  overrideCredentials?: { apiKey?: string; baseUrl?: string },
): Promise<WisproApiResponse<T>> {
  const { apiKey, baseUrl } = getCredentials(overrideCredentials);
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${cleanEndpoint}`;
  const method = (options.method || "GET").toUpperCase();

  const headers: Record<string, string> = {
    Authorization: apiKey, // Valor crudo, NUNCA 'Bearer'
    Accept: "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (options.body && typeof options.body === "string" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= MAX_RETRIES) {
    attempt++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        method,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Loguea método, ruta y status (NUNCA el header Authorization ni el body completo)
      console.log(`[WISPRO] ${method} ${cleanEndpoint} -> ${response.status}`);

      const rawText = await response.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = null;
      }

      if (!response.ok) {
        // En errores 5xx, reintentar con backoff exponencial si no hemos alcanzado el límite
        if (response.status >= 500 && attempt <= MAX_RETRIES) {
          const delayMs = Math.pow(2, attempt) * 400; // 800ms, 1600ms
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        const errorMessage =
          (parsed as { message?: string })?.message ||
          (parsed as { error?: string })?.error ||
          rawText ||
          response.statusText;

        throw new WisproHttpError(response.status, errorMessage, rawText);
      }

      // Normalizar respuesta: siempre garantizar que `data` sea un array
      if (parsed && typeof parsed === "object") {
        const root = parsed as { status?: number; meta?: Record<string, unknown>; data?: unknown };
        let normalizedData: T[] = [];
        if (Array.isArray(root.data)) {
          normalizedData = root.data as T[];
        } else if (root.data !== undefined && root.data !== null) {
          normalizedData = [root.data as T];
        }

        return {
          status: response.status,
          meta: root.meta,
          data: normalizedData,
        };
      }

      return {
        status: response.status,
        data: [],
      };
    } catch (err) {
      clearTimeout(timeout);
      lastError = err instanceof Error ? err : new Error(String(err));

      // No reintentar si es error de cliente 4xx
      if (err instanceof WisproHttpError && err.status < 500) {
        throw err;
      }

      // Reintentar sólo en errores de red o timeouts hasta MAX_RETRIES
      if (attempt <= MAX_RETRIES) {
        const delayMs = Math.pow(2, attempt) * 400;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      break;
    }
  }

  throw lastError || new Error(`Fallo de conexión con Wispro tras ${MAX_RETRIES} reintentos`);
}

/**
 * 4.1 Listar categorías de mesa de ayuda
 * GET /help_desk/categories
 */
export async function getCategories(
  override?: { apiKey?: string; baseUrl?: string },
): Promise<WisproCategory[]> {
  const response = await wisproFetch<WisproCategory>(
    "/help_desk/categories",
    { method: "GET" },
    override,
  );
  return response.data;
}

/**
 * 4.2 Listar empleados (técnicos)
 * GET /employees
 */
export async function getEmployees(
  override?: { apiKey?: string; baseUrl?: string },
): Promise<WisproEmployee[]> {
  const response = await wisproFetch<WisproEmployee>(
    "/employees",
    { method: "GET" },
    override,
  );
  return response.data;
}

/**
 * 4.3 Buscar clientes
 * GET /clients
 */
export async function getClients(
  searchQuery?: string,
  override?: { apiKey?: string; baseUrl?: string },
): Promise<WisproClient[]> {
  const params = new URLSearchParams();
  if (searchQuery?.trim()) {
    params.set("search", searchQuery.trim());
  }
  const endpoint = `/clients${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await wisproFetch<WisproClient>(endpoint, { method: "GET" }, override);
  return response.data;
}

/**
 * 4.3 Buscar contratos
 * GET /contracts
 */
export async function getContracts(
  clientId?: string,
  override?: { apiKey?: string; baseUrl?: string },
): Promise<WisproContract[]> {
  const params = new URLSearchParams();
  if (clientId) {
    params.set("client_id", clientId);
  }
  const endpoint = `/contracts${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await wisproFetch<WisproContract>(endpoint, { method: "GET" }, override);
  return response.data;
}

/**
 * 4.4 Crear ticket de mesa de ayuda
 * POST /help_desk/issues
 * 
 * ⚠️ NOTA TÉCNICA OBLIGATORIA:
 * Según la especificación oficial OpenAPI de Wispro, los parámetros de este endpoint
 * deben enviarse en la QUERY STRING y NO en el body JSON. La API no procesa el payload
 * en el body para este recurso.
 */
export async function createIssue(
  input: CreateIssueInput,
  override?: { apiKey?: string; baseUrl?: string },
): Promise<{ id: string; publicId: number }> {
  const query = new URLSearchParams();
  query.set("title", input.title);
  query.set("description", input.description);
  query.set("category_id", input.category_id);

  if (input.client_id) query.set("client_id", input.client_id);
  if (input.contract_id) query.set("contract_id", input.contract_id);
  if (input.assignable_id) query.set("assignable_id", input.assignable_id);

  const endpoint = `/help_desk/issues?${query.toString()}`;
  const response = await wisproFetch<{ id: string; public_id: number | string }>(
    endpoint,
    { method: "POST" },
    override,
  );

  const created = response.data[0];
  if (!created?.id) {
    throw new Error("Wispro no retornó el identificador del ticket creado");
  }

  return {
    id: String(created.id),
    publicId: Number(created.public_id),
  };
}

/**
 * 4.5 Crear orden de trabajo técnica
 * POST /order/orders (con body JSON)
 */
export async function createOrder(
  input: CreateOrderInput,
  override?: { apiKey?: string; baseUrl?: string },
): Promise<{ id: string; raw: unknown }> {
  const bodyPayload: Record<string, unknown> = {
    order: input.order,
  };

  // gps_point_attributes va al nivel raíz, fuera de order
  if (input.gps_point_attributes) {
    bodyPayload.gps_point_attributes = input.gps_point_attributes;
  }

  const response = await wisproFetch<{ id: string }>(
    "/order/orders",
    {
      method: "POST",
      body: JSON.stringify(bodyPayload),
    },
    override,
  );

  const created = response.data[0];
  if (!created?.id) {
    throw new Error("Wispro no retornó el identificador de la orden creada");
  }

  return {
    id: String(created.id),
    raw: created,
  };
}

/**
 * 4.6 Asignar técnico y agendar orden
 * POST /order/orders/{id}/schedule
 */
export async function asignarTecnico(
  orderId: string,
  employeeId: string,
  startAt: string,
  endAt: string,
  override?: { apiKey?: string; baseUrl?: string },
): Promise<{ ok: boolean }> {
  const bodyPayload = {
    [CAMPO_TECNICO]: employeeId,
    start_at: startAt,
    end_at: endAt,
  };

  try {
    await wisproFetch(
      `/order/orders/${encodeURIComponent(orderId)}/schedule`,
      {
        method: "POST",
        body: JSON.stringify(bodyPayload),
      },
      override,
    );
    return { ok: true };
  } catch (error) {
    // Si la respuesta es 4xx, re-lanzamos con el body crudo para depurar qué campo espera Wispro
    if (error instanceof WisproHttpError) {
      console.error(
        `[WISPRO_SCHEDULE_ERROR] status: ${error.status}, body: ${error.rawBody}`,
      );
    }
    throw error;
  }
}

// -----------------------------------------------------------------------------
// Stubs del ciclo de vida de la orden (para fases futuras)
// -----------------------------------------------------------------------------

export async function rescheduleOrder(
  orderId: string,
  body: Record<string, unknown>,
  override?: { apiKey?: string; baseUrl?: string },
) {
  return wisproFetch(
    `/order/orders/${encodeURIComponent(orderId)}/reschedule`,
    { method: "POST", body: JSON.stringify(body) },
    override,
  );
}

export async function finalizeOrder(
  orderId: string,
  body: Record<string, unknown>,
  override?: { apiKey?: string; baseUrl?: string },
) {
  return wisproFetch(
    `/order/orders/${encodeURIComponent(orderId)}/finalize`,
    { method: "POST", body: JSON.stringify(body) },
    override,
  );
}

export async function closeOrder(
  orderId: string,
  body: Record<string, unknown>,
  override?: { apiKey?: string; baseUrl?: string },
) {
  return wisproFetch(
    `/order/orders/${encodeURIComponent(orderId)}/close`,
    { method: "POST", body: JSON.stringify(body) },
    override,
  );
}

export async function getOrderFeedbacks(
  orderId: string,
  override?: { apiKey?: string; baseUrl?: string },
) {
  return wisproFetch(
    `/order/orders/${encodeURIComponent(orderId)}/feedbacks`,
    { method: "GET" },
    override,
  );
}
