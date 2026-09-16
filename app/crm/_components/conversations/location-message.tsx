import { ExternalLink, MapPin } from "lucide-react";
import type { Message } from "../../_lib/types";
import { CRM_SURFACES } from "../../_lib/crm-theme";

interface LocationMessageProps {
  message: Message;
  isOutgoing: boolean;
}

const DEFAULT_LOCATION_PREVIEW_IMAGE = "/location_pin_on_map.jpg";

const hasValidCoordinates = (latitude: number, longitude: number) =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180;

const parseCoordinatesFromContent = (content: string) => {
  const match = content.match(/(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!match) return null;

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);

  if (!hasValidCoordinates(latitude, longitude)) return null;
  return { latitude, longitude };
};

const formatCoordinate = (value: number) => value.toFixed(6);

export const LocationMessage = ({ message, isOutgoing }: LocationMessageProps) => {
  const parsed = parseCoordinatesFromContent(message.content || "");
  const latitude = message.latitude ?? parsed?.latitude ?? null;
  const longitude = message.longitude ?? parsed?.longitude ?? null;
  const hasCoordinates =
    latitude !== null &&
    longitude !== null &&
    hasValidCoordinates(latitude, longitude);

  const mapPreviewUrl =
    message.media_url?.trim() || DEFAULT_LOCATION_PREVIEW_IMAGE;
  const mapsUrl = hasCoordinates
    ? `https://www.google.com/maps?q=${latitude},${longitude}`
    : "https://maps.google.com";
  const locationName = message.location_name?.trim() || "Ubicación compartida";
  const locationAddress = message.location_address?.trim() || null;
  const coordinateLabel =
    hasCoordinates && latitude !== null && longitude !== null
      ? `${formatCoordinate(latitude)}, ${formatCoordinate(longitude)}`
      : null;

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`block w-[min(20rem,78vw)] overflow-hidden rounded-2xl border transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-accent ${CRM_SURFACES.border} ${CRM_SURFACES.card}`}
      aria-label="Abrir ubicación en Google Maps">
      <div className="relative h-40 w-full overflow-hidden">
        {mapPreviewUrl ? (
          <img
            src={mapPreviewUrl}
            alt="Vista previa de ubicación"
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-200/70 dark:bg-slate-800/70">
            <MapPin className="size-10 text-rose-500" aria-hidden="true" />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/15 to-transparent" />
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] font-medium text-white">
          <MapPin className="size-3.5" aria-hidden="true" />
          Ubicación
        </span>
      </div>

      <div className="space-y-1.5 p-3">
        <div className="flex items-start justify-between gap-3">
          <p className={`line-clamp-1 text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
            {locationName}
          </p>
          <ExternalLink className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
        </div>

        {locationAddress ? (
          <p className={`line-clamp-2 text-xs leading-relaxed ${CRM_SURFACES.textSecondary}`}>
            {locationAddress}
          </p>
        ) : null}

        {coordinateLabel ? (
          <p
            className={`font-mono text-[11px] ${isOutgoing ? "text-crm-accent" : CRM_SURFACES.textMuted}`}>
            {coordinateLabel}
          </p>
        ) : null}
      </div>
    </a>
  );
};
