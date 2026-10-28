import type { SmartOltFullStatusInfo } from "@/types/smartolt";

export interface SmartOltOnuDetail {
  unique_external_id: string;
  sn: string;
  olt_id: string;
  board: number;
  port: number;
  onu_number: number;
  status: string;
  signal: string;
  zone: string;
  name: string;
}

/**
 * Parsea un string o número que representa potencia óptica a valor numérico en dBm.
 * Remueve sufijos como "dBm", espacios, etc.
 */
export const parseSignalValue = (val?: string | number | null): number | null => {
  if (val == null) return null;
  if (typeof val === "number") return Number.isNaN(val) ? null : val;
  const cleaned = String(val).replace(/dbm/gi, "").trim();
  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * Resuelve la URL base de SmartOLT admitiendo tanto SMARTOLT_BASE_URL como SMARTOLT_SUBDOMAIN.
 */
export const resolveSmartOltBaseUrl = (): string | null => {
  const rawBase =
    process.env.SMARTOLT_BASE_URL?.trim() ||
    process.env.SMART_OLT_BASE_URL?.trim();

  if (rawBase) {
    let clean = rawBase.replace(/\/+$/, "");
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
      clean = `https://${clean}`;
    }
    // Si viene con /api o rutas adicionales, dejamos solo el origen base
    return clean.replace(/\/api(\/.*)?$/, "");
  }

  const subdomain =
    process.env.SMARTOLT_SUBDOMAIN?.trim() ||
    process.env.SMART_OLT_SUBDOMAIN?.trim();

  if (subdomain) {
    const cleanSub = subdomain
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .split(".")[0];
    return `https://${cleanSub}.smartolt.com`;
  }

  return null;
};

/**
 * Consulta la información de una ONU en SmartOLT utilizando el Número de Serie (SN).
 * Consume el endpoint GET /api/onu/get_onus_details_by_sn/<sn>
 */
export const getOnuBySN = async (sn: string): Promise<SmartOltOnuDetail | null> => {
  const cleanSn = sn.trim().toUpperCase();
  if (!cleanSn) return null;

  const baseUrl = resolveSmartOltBaseUrl();
  const apiKey =
    process.env.SMARTOLT_API_KEY?.trim() ||
    process.env.SMART_OLT_API_KEY?.trim();

  if (!baseUrl || !apiKey) {
    console.error(
      "[SmartOLT] Faltan variables de entorno: configura SMARTOLT_BASE_URL (o SMARTOLT_SUBDOMAIN) y SMARTOLT_API_KEY",
    );
    return null;
  }

  try {
    const url = `${baseUrl}/api/onu/get_onus_details_by_sn/${encodeURIComponent(cleanSn)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Token": apiKey,
        "Content-Type": "application/json",
      },
      // Evita cachear respuestas dinámicas de la OLT
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(`[SmartOLT] Error HTTP SmartOLT: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // SmartOLT devuelve status: true si la consulta fue exitosa
    if (!data.status || !Array.isArray(data.onus) || data.onus.length === 0) {
      return null;
    }

    // Devuelve el primer coincidente
    return data.onus[0] as SmartOltOnuDetail;
  } catch (error) {
    console.error("[SmartOLT] Error al consultar ONU por SN en SmartOLT:", error);
    return null;
  }
};

/**
 * Consulta el estado y diagnóstico completo en vivo de una ONU en SmartOLT.
 * Consume el endpoint GET /api/onu/get_onu_full_status_info/<onu_external_id>
 */
export const getOnuFullStatusInfo = async (
  onuExternalId: string,
): Promise<SmartOltFullStatusInfo | null> => {
  const cleanId = onuExternalId.trim();
  if (!cleanId) return null;

  const baseUrl = resolveSmartOltBaseUrl();
  const apiKey =
    process.env.SMARTOLT_API_KEY?.trim() ||
    process.env.SMART_OLT_API_KEY?.trim();

  if (!baseUrl || !apiKey) {
    console.error(
      "[SmartOLT] Faltan variables de entorno: configura SMARTOLT_BASE_URL y SMARTOLT_API_KEY",
    );
    return null;
  }

  try {
    const url = `${baseUrl}/api/onu/get_onu_full_status_info/${encodeURIComponent(cleanId)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Token": apiKey,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(`[SmartOLT] Error HTTP al obtener diagnóstico en vivo: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!data || typeof data !== "object") return null;

    const rawSignal = data.onu_signal ?? data.signal ?? data.rx_power ?? null;
    const parsedRx = parseSignalValue(rawSignal);
    const parsedTx = parseSignalValue(data.olt_rx_signal ?? data.tx_power);

    return {
      status: Boolean(data.status ?? true),
      onu_status: data.onu_status || data.status_description || "Desconocido",
      onu_signal: rawSignal ? String(rawSignal) : null,
      onu_signal_1310: data.onu_signal_1310 ? String(data.onu_signal_1310) : null,
      onu_signal_1490: data.onu_signal_1490 ? String(data.onu_signal_1490) : null,
      olt_rx_signal: data.olt_rx_signal ? String(data.olt_rx_signal) : null,
      rx_power: parsedRx,
      tx_power: parsedTx,
      temperature: data.temperature ? String(data.temperature) : null,
      voltage: data.voltage ? String(data.voltage) : null,
      catv: data.catv ? String(data.catv) : null,
      uptime: data.uptime ? String(data.uptime) : null,
      distance: data.distance ? String(data.distance) : null,
      lan_ports: Array.isArray(data.lan_ports) ? data.lan_ports : [],
      board: data.board != null ? Number(data.board) : null,
      port: data.port != null ? Number(data.port) : null,
      onu_number: data.onu_number != null ? Number(data.onu_number) : null,
      last_online: data.last_online ? String(data.last_online) : null,
      last_offline: data.last_offline ? String(data.last_offline) : null,
      offline_reason: data.offline_reason ? String(data.offline_reason) : null,
      raw: data,
    };
  } catch (error) {
    console.error("[SmartOLT] Error al consultar diagnóstico en vivo:", error);
    return null;
  }
};
