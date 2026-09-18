/**
 * Parser tolerante para reportes técnicos generados por el bot de IA y operadores.
 */

export interface ParsedReporteField {
  rawKey: string;
  normalizedKey: string;
  value: string;
}

export interface ParseReporteResult {
  fields: Record<string, string>;
  orderedFields: ParsedReporteField[];
  title: string;
  formattedDescription: string;
}

/**
 * Normaliza una etiqueta de texto:
 * - Remueve acentos y diacríticos
 * - Convierte a minúsculas
 * - Reemplaza espacios, barras y caracteres especiales por guiones bajos
 * Ejemplo: "Zona/OPT" -> "zona_opt", "Posible causa" -> "posible_causa"
 */
export const normalizeKey = (key: string): string => {
  return key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

/**
 * Capitaliza una etiqueta para presentación legible
 */
export const formatDisplayLabel = (rawKey: string): string => {
  const trimmed = rawKey.replace(/^[*_#\s]+|[*_#\s:]+$/g, "");
  if (!trimmed) return rawKey;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

/**
 * Parsea el texto del reporte:
 * 1. Detecta líneas que empiecen con viñetas (•, -, *, etc.) o etiquetas directas.
 * 2. Tolera negritas en markdown (**Etiqueta:**), sin negritas o variaciones de dos puntos.
 * 3. Tolera texto arbitrario antes y después del bloque técnico.
 */
export const parseReporte = (rawText: string): ParseReporteResult => {
  if (!rawText || !rawText.trim()) {
    return {
      fields: {},
      orderedFields: [],
      title: "",
      formattedDescription: "",
    };
  }

  const lines = rawText.split(/\r?\n/);
  const fields: Record<string, string> = {};
  const orderedFields: ParsedReporteField[] = [];

  // Regex para capturar líneas estructuradas:
  // Viñeta opcional: [•\-*]?\s*
  // Etiqueta opcionalmente en negritas: \*{0,2}([^:*]+?)\*{0,2}
  // Separador de dos puntos: \s*:\s*
  // Valor restante de la línea: (.*)
  const linePattern = /^[•\-*]?\s*\*{0,2}([^:*]+?)\*{0,2}\s*:\s*(.+)$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Ignorar encabezados como "**REPORTE TÉCNICO:**" o "REPORTE TÉCNICO:"
    const headerPattern = /^\*{0,2}reporte(?:\s+t[eé]cnico)?\*{0,2}\s*:?$/i;
    if (headerPattern.test(trimmed)) {
      continue;
    }

    const match = trimmed.match(linePattern);
    if (match) {
      const rawKey = match[1].replace(/^\*+|\*+$/g, "").trim();
      // Limpia asteriscos de cierre si quedaron del lado del valor (ej. **Etiqueta:** valor)
      const value = match[2].replace(/^\*+|\*+$/g, "").trim();
      const normKey = normalizeKey(rawKey);

      if (normKey && value) {
        fields[normKey] = value;
        orderedFields.push({
          rawKey,
          normalizedKey: normKey,
          value,
        });
      }
    }
  }

  // 1. Título: valor del 'motivo', truncado a un máximo de 80 caracteres
  const motivoValue = fields.motivo || fields.falla || fields.problema || fields.asunto || "";
  const title = motivoValue.slice(0, 80).trim();

  // 2. Descripción formateada: texto plano legible, una línea por campo (Etiqueta: valor)
  let formattedDescription = "";
  if (orderedFields.length > 0) {
    formattedDescription = orderedFields
      .map((item) => `${formatDisplayLabel(item.rawKey)}: ${item.value}`)
      .join("\n");
  } else {
    // Si fue texto libre sin viñetas ni dos puntos, mantener el texto limpio
    formattedDescription = rawText.replace(/\*\*/g, "").trim();
  }

  return {
    fields,
    orderedFields,
    title,
    formattedDescription,
  };
};

/**
 * Sugerencia inteligente de categoría de Wispro basada en palabras clave
 * extraídas de 'motivo' y 'posible_causa'.
 */
export const suggestCategory = (
  motivo: string,
  posibleCausa: string,
  categories: Array<{ id: string; name: string }>,
): { id: string; name: string } | null => {
  if (!categories.length) return null;

  const combinedText = `${motivo} ${posibleCausa}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  // 1. Coincidencia directa de palabras clave relevantes
  const keywordMappings: Array<{ keywords: string[]; targetWords: string[] }> = [
    {
      keywords: ["wifi", "wi-fi", "senal", "inalambrico", "cobertura"],
      targetWords: ["wifi", "wi-fi", "inalambric", "conexion", "soporte"],
    },
    {
      keywords: ["fibra", "olt", "pon", "atenuacion", "los", "corte", "rotura", "opt"],
      targetWords: ["fibra", "enlace", "falla tecnica", "optico", "conexion"],
    },
    {
      keywords: ["router", "modem", "onu", "ont", "equipo", "luz roja", "reinicio"],
      targetWords: ["equipo", "router", "hardware", "cpe", "falla"],
    },
    {
      keywords: ["lento", "velocidad", "latencia", "ping", "degradado", "paquetes"],
      targetWords: ["velocidad", "lentitud", "degradacion", "ancho de banda"],
    },
    {
      keywords: ["sin conexion", "desconectado", "no navega", "offline", "caido"],
      targetWords: ["sin servicio", "falla masiva", "conexion", "soporte tecnico"],
    },
    {
      keywords: ["factura", "pago", "deuda", "cobro", "suspension", "facturacion"],
      targetWords: ["factur", "administracion", "cobranza"],
    },
    {
      keywords: ["instalacion", "nueva conexion", "alta"],
      targetWords: ["instalacion", "alta", "nueva"],
    },
    {
      keywords: ["baja", "retiro", "cancelar", "cancelacion"],
      targetWords: ["baja", "retiro"],
    },
  ];

  for (const map of keywordMappings) {
    const hasKeyword = map.keywords.some((kw) => combinedText.includes(kw));
    if (hasKeyword) {
      const matchCat = categories.find((cat) => {
        const catNorm = cat.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return map.targetWords.some((tw) => catNorm.includes(tw));
      });
      if (matchCat) return matchCat;
    }
  }

  // 2. Coincidencia por intersección léxica entre categorías y texto
  const tokens = combinedText
    .split(/[\s,.;:()]+/)
    .filter((w) => w.length >= 4);

  let bestMatch: { id: string; name: string } | null = null;
  let maxScore = 0;

  for (const cat of categories) {
    const catNorm = cat.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (catNorm.includes(token)) {
        score++;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestMatch = cat;
    }
  }

  return bestMatch;
};
