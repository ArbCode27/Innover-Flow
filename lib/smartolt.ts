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
 * Consulta la información de una ONU en SmartOLT utilizando el Número de Serie (SN).
 * Consume el endpoint GET /api/onu/get_onus_details_by_sn/<sn>
 */
export const getOnuBySN = async (sn: string): Promise<SmartOltOnuDetail | null> => {
  const cleanSn = sn.trim().toUpperCase();
  if (!cleanSn) return null;

  const subdomain =
    process.env.SMARTOLT_SUBDOMAIN?.trim() ||
    process.env.SMART_OLT_SUBDOMAIN?.trim();
  const apiKey =
    process.env.SMARTOLT_API_KEY?.trim() ||
    process.env.SMART_OLT_API_KEY?.trim();

  if (!subdomain || !apiKey) {
    console.error(
      "[SmartOLT] Faltan variables de entorno SMARTOLT_SUBDOMAIN o SMARTOLT_API_KEY",
    );
    return null;
  }

  try {
    const response = await fetch(
      `https://${subdomain}.smartolt.com/api/onu/get_onus_details_by_sn/${encodeURIComponent(cleanSn)}`,
      {
        method: "GET",
        headers: {
          "X-Token": apiKey,
          "Content-Type": "application/json",
        },
        // Evita cachear respuestas dinámicas de la OLT
        cache: "no-store",
      },
    );

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
