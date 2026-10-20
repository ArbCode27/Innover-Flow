const CLOSE_WITHOUT_DETAIL_RE =
  /(listo|ya\s+termin[eé]|ya\s+acab[eé]|cierra(?:lo)?|cerrarlo|finaliza(?:r)?|finalic[eé]|termin[eé]|acab[eé]|\bdone\b)/i;

const DETAIL_REQUEST_RE =
  /\b(ficha|detalle|detalles|foto(?:s)?(?:\s+de)?(?:\s+la)?\s*fachada|fachada|ubicaci[oó]n|direcci[oó]n|mapa)\b/i;

const LIST_REQUEST_RE =
  /\b(mis\s+(tickets|casos|visitas)|pendientes|qu[eé]\s+tengo|listado|cola)\b/i;

export const looksLikeCloseIntent = (text: string | null | undefined) =>
  CLOSE_WITHOUT_DETAIL_RE.test(String(text || "").trim());

export const looksLikeDetailRequest = (text: string | null | undefined) => {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (/\bcompleto\b/i.test(raw) && !DETAIL_REQUEST_RE.test(raw)) return false;
  return DETAIL_REQUEST_RE.test(raw);
};

export const looksLikeListRequest = (text: string | null | undefined) =>
  LIST_REQUEST_RE.test(String(text || "").trim());

export const observationLooksSufficient = (value: string | null | undefined) =>
  String(value || "").trim().length >= 3;

export const extractObservationAfterCloseCue = (text: string | null | undefined) => {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const stripped = raw
    .replace(CLOSE_WITHOUT_DETAIL_RE, " ")
    .replace(/\b(con\s+la\s+observaci[oó]n|observaci[oó]n|reporte)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped;
};

export const shouldSkipDetailFastPath = (input: {
  awaitingCloseObservation: boolean;
  inboundIsAudio: boolean;
  text: string | null | undefined;
}) => {
  if (input.awaitingCloseObservation) return true;
  if (input.inboundIsAudio) return true;
  if (/\bcompleto\b/i.test(String(input.text || ""))) return true;
  return false;
};

export const ASK_CLOSE_OBSERVATION =
  "Para cerrarlo necesito la observación de la visita en una frase (texto o nota de voz).";

export const formatFinalizeConfirmation = (publicId: number, clientName: string | null) => {
  const name = clientName?.trim();
  return name
    ? `Listo. Cerré #${publicId} (${name}) con la observación registrada.`
    : `Listo. Cerré #${publicId} con la observación registrada.`;
};
