import { parseSaeCuentasBancarias, type SaeCuentaBancaria } from "./sae-cuentas.ts";

export class SaeApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.name = "SaeApiError";
    this.status = status;
    this.code = code;
  }
}

export interface SaeCredentials {
  apiToken: string;
  apiConnect: string;
}

export interface SaeConfig {
  baseUrl: string;
  apiToken: string;
  apiConnect: string;
  testContractId?: string | null;
}

export interface SaePagination {
  limit: number;
  nextPageToken?: string | null;
}

export interface SaeAbonadoListItem {
  abonadoId: string;
  nroContrato: string;
  nroCuentaPago?: string;
  cedula: string;
  nombreAbonado: string;
  estadoContrato: string;
  direccionServicio?: string;
  franquiciaNombre?: string;
}

export interface SaeAbonadoDetalle {
  abonadoId: string;
  nroContrato: string;
  nroCuentaPago?: string;
  cedula: string;
  nombreAbonado: string;
  estadoContrato: string;
  direccionServicio?: string;
  fechaAlta?: string;
  franquicia?: { id?: string; nombre?: string };
  contrato?: Record<string, unknown>;
  datosContacto?: {
    email?: string | null;
    telefono?: string | null;
    telefonoMovil?: string | null;
  };
  clasificacion?: Record<string, unknown>;
  facturacion?: Record<string, unknown>;
}

export interface SaeAbonadoSaldo {
  abonadoId: string;
  saldoActual: number;
  suscripcion: number;
  montoPendienteConciliar: number;
  fechaCorte?: string | null;
  ultimoPago?: {
    fecha?: string | null;
    monto?: number | null;
    referencia?: string | null;
  } | null;
}

export interface SaeAbonadoResumen {
  abonadoId: string;
  nroContrato: string;
  estadoContrato: string;
  saldoActual: number;
  suscripcion: number;
  montoPendienteConciliar: number;
  ultimoPago?: Record<string, unknown> | null;
  cantidadPagosValidos?: number;
  suscripcionPorCategoria?: Record<string, number>;
  suscripcionPorEstado?: Record<string, number>;
  deudaPorCategoria?: Record<string, number>;
  ultimaFactura?: Record<string, unknown> | null;
}

export interface SaeServicioItem {
  contratoServicioId: string;
  servicioId: string;
  nombreServicio: string;
  categoriaServicio?: string;
  estadoServicio: string;
  cantidad: number;
  costo: number;
  iva: number;
  fechaAlta?: string;
}

export interface SaeMovimientoEstadoCuenta {
  movimientoId: string;
  fecha: string;
  tipoDocumento: string;
  numeroDocumento?: string;
  descripcion?: string;
  cargo: number;
  abono: number;
  saldo: number;
  estadoPago?: string;
  observacion?: string | null;
  anulado: boolean;
}

export interface SaeFacturaItem {
  documentoId: string;
  numeroDocumento: string;
  tipoDocumento: string;
  fechaDocumento: string;
  periodo?: string;
  monto: number;
  estadoDocumento: string;
  observacion?: string | null;
}

export interface SaePagoAplicadoItem {
  pagoId: string;
  fechaPago: string;
  monto: number;
  estadoPago: string;
  numeroDocumento?: string;
  referencia: string;
  fechaDeposito?: string;
  periodoAplicado?: string;
  observacion?: string | null;
  anulado: boolean;
}

export interface SaePaymentReportPayload {
  id_contrato: string;
  id_cuba: string;
  monto: number;
  referencia: string;
  fecha: string;
  observacion?: string | null;
  cambio?: string | null;
  telefono?: string | null;
}

export interface SaePaymentConciliatedPayload {
  id_contrato: string;
  id_cuba: string;
  monto: number;
  referencia: string;
  fecha: string;
  observacion?: string | null;
  cambio?: string | null;
}

export interface SaePaymentResponse {
  success: boolean;
  data: {
    resultado: string;
    info?: string | null;
  };
}

export const parseSaeSecret = (secretRaw: string): SaeCredentials => {
  try {
    const parsed = JSON.parse(secretRaw);
    if (parsed && typeof parsed === "object") {
      return {
        apiToken: String(parsed.apiToken || "").trim(),
        apiConnect: String(parsed.apiConnect || "").trim(),
      };
    }
  } catch {
    // Si no es JSON, se asume que solo era apiToken
  }
  return {
    apiToken: secretRaw.trim(),
    apiConnect: "",
  };
};

export const serializeSaeSecret = (credentials: SaeCredentials): string =>
  JSON.stringify({
    apiToken: credentials.apiToken.trim(),
    apiConnect: credentials.apiConnect.trim(),
  });

export const saeRequest = async <T>(
  config: SaeConfig,
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  const normalizedBaseUrl = config.baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${normalizedBaseUrl}${normalizedPath}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Api-Token": config.apiToken,
    "Api-Connect": config.apiConnect,
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg =
      payload && typeof payload === "object" && "error" in payload
        ? String(payload.error)
        : `SAE Plus respondió con estado HTTP ${response.status}`;
    throw new SaeApiError(errorMsg, response.status);
  }

  return payload as T;
};

export const verifySae = async (
  apiToken: string,
  apiConnect: string,
  rawBaseUrl: string,
): Promise<{ base_url: string; status: "connected" }> => {
  const baseUrl = (rawBaseUrl || "https://apiservice.saeplus.com").replace(
    /\/+$/,
    "",
  );

  const response = await fetch(`${baseUrl}/v1/abonados?limit=1`, {
    headers: {
      Accept: "application/json",
      "Api-Token": apiToken.trim(),
      "Api-Connect": apiConnect.trim(),
    },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    throw new SaeApiError(
      "SAE Plus rechazó las credenciales (Api-Token o Api-Connect inválidos)",
      response.status,
    );
  }

  if (!response.ok && response.status !== 404) {
    const errorPayload = await response.json().catch(() => null);
    const detail =
      errorPayload && typeof errorPayload === "object" && "error" in errorPayload
        ? String(errorPayload.error)
        : `HTTP ${response.status}`;
    throw new SaeApiError(
      `No se pudo validar la conexión con SAE Plus: ${detail}`,
      response.status,
    );
  }

  return {
    base_url: baseUrl,
    status: "connected",
  };
};

export const searchSaeAbonados = async (
  config: SaeConfig,
  params: {
    cedula?: string | null;
    nombre?: string | null;
    nroContrato?: string | null;
    nroCuentaPago?: string | null;
    estado?: string | null;
    franquiciaNombre?: string | null;
    limit?: number;
    cursor?: string | null;
  },
): Promise<{ data: SaeAbonadoListItem[]; pagination?: SaePagination }> => {
  const query = new URLSearchParams();
  if (params.cedula) query.set("cedula", params.cedula.replace(/\D/g, ""));
  if (params.nombre) query.set("nombre", params.nombre.trim());
  if (params.nroContrato) query.set("nroContrato", params.nroContrato.trim());
  if (params.nroCuentaPago) query.set("nroCuentaPago", params.nroCuentaPago.trim());
  if (params.estado) query.set("estado", params.estado.trim());
  if (params.franquiciaNombre) query.set("franquiciaNombre", params.franquiciaNombre.trim());
  if (params.limit) query.set("limit", String(params.limit));
  if (params.cursor) query.set("cursor", params.cursor.trim());

  const queryString = query.toString();
  const path = `/v1/abonados${queryString ? `?${queryString}` : ""}`;
  return saeRequest<{ data: SaeAbonadoListItem[]; pagination?: SaePagination }>(
    config,
    path,
  );
};

export const getSaeAbonado = async (
  config: SaeConfig,
  abonadoId: string,
): Promise<{ data: SaeAbonadoDetalle }> => {
  return saeRequest<{ data: SaeAbonadoDetalle }>(
    config,
    `/v1/abonados/${encodeURIComponent(abonadoId)}`,
  );
};

export const getSaeAbonadoSaldo = async (
  config: SaeConfig,
  abonadoId: string,
): Promise<{ data: SaeAbonadoSaldo }> => {
  return saeRequest<{ data: SaeAbonadoSaldo }>(
    config,
    `/v1/abonados/${encodeURIComponent(abonadoId)}/saldo`,
  );
};

export const getSaeAbonadoResumen = async (
  config: SaeConfig,
  abonadoId: string,
): Promise<{ data: SaeAbonadoResumen }> => {
  return saeRequest<{ data: SaeAbonadoResumen }>(
    config,
    `/v1/abonados/${encodeURIComponent(abonadoId)}/resumen`,
  );
};

export const getSaeAbonadoServicios = async (
  config: SaeConfig,
  abonadoId: string,
  params?: { estadoServicio?: string | null },
): Promise<{ data: SaeServicioItem[]; resumen?: Record<string, unknown> }> => {
  const query = new URLSearchParams();
  if (params?.estadoServicio) query.set("estadoServicio", params.estadoServicio.trim());
  const queryString = query.toString();
  return saeRequest<{ data: SaeServicioItem[]; resumen?: Record<string, unknown> }>(
    config,
    `/v1/abonados/${encodeURIComponent(abonadoId)}/servicios${queryString ? `?${queryString}` : ""}`,
  );
};

export const getSaeAbonadoEstadoCuenta = async (
  config: SaeConfig,
  abonadoId: string,
  params?: {
    fechaDesde?: string | null;
    fechaHasta?: string | null;
    limit?: number;
    cursor?: string | null;
  },
): Promise<{ data: SaeMovimientoEstadoCuenta[]; pagination?: SaePagination }> => {
  const query = new URLSearchParams();
  if (params?.fechaDesde) query.set("fechaDesde", params.fechaDesde.trim());
  if (params?.fechaHasta) query.set("fechaHasta", params.fechaHasta.trim());
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.cursor) query.set("cursor", params.cursor.trim());
  const queryString = query.toString();

  return saeRequest<{
    data: SaeMovimientoEstadoCuenta[];
    pagination?: SaePagination;
  }>(
    config,
    `/v1/abonados/${encodeURIComponent(abonadoId)}/estado-cuenta${queryString ? `?${queryString}` : ""}`,
  );
};

export const getSaeAbonadoFacturas = async (
  config: SaeConfig,
  abonadoId: string,
  params?: {
    tipoDocumento?: string | null;
    desde?: string | null;
    hasta?: string | null;
    limit?: number;
    cursor?: string | null;
  },
): Promise<{ data: SaeFacturaItem[]; pagination?: SaePagination }> => {
  const query = new URLSearchParams();
  if (params?.tipoDocumento) query.set("tipoDocumento", params.tipoDocumento.trim());
  if (params?.desde) query.set("desde", params.desde.trim());
  if (params?.hasta) query.set("hasta", params.hasta.trim());
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.cursor) query.set("cursor", params.cursor.trim());
  const queryString = query.toString();

  return saeRequest<{ data: SaeFacturaItem[]; pagination?: SaePagination }>(
    config,
    `/v1/abonados/${encodeURIComponent(abonadoId)}/facturas${queryString ? `?${queryString}` : ""}`,
  );
};

export const getSaeAbonadoPagos = async (
  config: SaeConfig,
  abonadoId: string,
  params?: {
    fechaDesde?: string | null;
    fechaHasta?: string | null;
    incluirAnulados?: boolean;
    limit?: number;
    cursor?: string | null;
  },
): Promise<{ data: SaePagoAplicadoItem[]; pagination?: SaePagination }> => {
  const query = new URLSearchParams();
  if (params?.fechaDesde) query.set("fechaDesde", params.fechaDesde.trim());
  if (params?.fechaHasta) query.set("fechaHasta", params.fechaHasta.trim());
  if (typeof params?.incluirAnulados === "boolean") {
    query.set("incluirAnulados", String(params.incluirAnulados));
  }
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.cursor) query.set("cursor", params.cursor.trim());
  const queryString = query.toString();

  return saeRequest<{ data: SaePagoAplicadoItem[]; pagination?: SaePagination }>(
    config,
    `/v1/abonados/${encodeURIComponent(abonadoId)}/pagos${queryString ? `?${queryString}` : ""}`,
  );
};

export const getSaeCuentasBancarias = async (
  config: SaeConfig,
): Promise<SaeCuentaBancaria[]> => {
  const payload = await saeRequest<unknown>(
    config,
    "/v1/catalogos/cuentas-bancarias",
  );
  if (
    payload &&
    typeof payload === "object" &&
    "success" in payload &&
    (payload as { success?: unknown }).success === false
  ) {
    throw new SaeApiError("SAE Plus no devolvió las cuentas bancarias", 502);
  }
  return parseSaeCuentasBancarias(payload);
};

export const postSaePagoReporte = async (
  config: SaeConfig,
  payload: SaePaymentReportPayload,
): Promise<SaePaymentResponse> => {
  return saeRequest<SaePaymentResponse>(config, "/v1/pagos/reportes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const postSaePagoConciliado = async (
  config: SaeConfig,
  payload: SaePaymentConciliatedPayload,
): Promise<SaePaymentResponse> => {
  return saeRequest<SaePaymentResponse>(config, "/v1/pagos/conciliados", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};
