const COORD_RE = /(-?\d{1,2}\.\d+)\s*[,/ ]\s*(-?\d{1,3}\.\d+)/;

export const parseMapsUrlCoords = (url: string | null | undefined) => {
  const value = String(url || "").trim();
  if (!value) return null;

  const atMatch = value.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
  if (atMatch) {
    return toCoordPair(atMatch[1], atMatch[2]);
  }

  const queryMatch = value.match(/[?&](?:q|query|ll|destination)=([^&]+)/i);
  if (queryMatch) {
    const decoded = decodeURIComponent(queryMatch[1].replace(/\+/g, " "));
    const pair = decoded.match(COORD_RE);
    if (pair) return toCoordPair(pair[1], pair[2]);
  }

  const fallback = value.match(COORD_RE);
  if (fallback) return toCoordPair(fallback[1], fallback[2]);
  return null;
};

const toCoordPair = (latRaw: string, lngRaw: string) => {
  const latitude = Number(latRaw);
  const longitude = Number(lngRaw);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
};

export const buildMapsUrl = (input: {
  mapsUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) => {
  const existing = String(input.mapsUrl || "").trim();
  if (existing) return existing;
  if (
    input.latitude != null &&
    input.longitude != null &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude)
  ) {
    return `https://maps.google.com/?q=${input.latitude},${input.longitude}`;
  }
  return null;
};
