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
