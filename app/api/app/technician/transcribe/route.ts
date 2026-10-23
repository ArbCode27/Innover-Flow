import { NextRequest, NextResponse } from "next/server";
import { transcribeAudioWithGroq } from "@/app/api/crm/ai/_lib/ai-client";
import { getAppTechnicianAuthContext } from "../../_lib/app-auth";
import {
  APP_ERROR_CODES,
  AppApiError,
  toAppErrorResponse,
} from "../../_lib/app-errors";

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

const ALLOWED_AUDIO_MIME = new Set([
  "audio/m4a",
  "audio/x-m4a",
  "audio/mp4",
  "audio/aac",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/opus",
  "audio/flac",
]);

const normalizeMime = (mimeType: string | null | undefined) =>
  (mimeType || "").toLowerCase().split(";")[0]?.trim() || "";

const extensionFromName = (fileName: string) => {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
};

const resolveMimeType = (file: File) => {
  const mime = normalizeMime(file.type);
  if (mime && mime !== "application/octet-stream") return mime;

  const ext = extensionFromName(file.name || "");
  if (ext === "m4a") return "audio/m4a";
  if (ext === "mp4") return "audio/mp4";
  if (ext === "aac") return "audio/aac";
  if (ext === "mp3" || ext === "mpeg") return "audio/mpeg";
  if (ext === "wav") return "audio/wav";
  if (ext === "webm") return "audio/webm";
  if (ext === "ogg" || ext === "opus") return "audio/ogg";
  if (ext === "flac") return "audio/flac";
  return mime;
};

const resolveFileName = (file: File, mimeType: string) => {
  const name = String(file.name || "").trim();
  if (name && /\.[a-z0-9]+$/i.test(name)) return name;

  const subtype = mimeType.split("/")[1] || "m4a";
  const ext =
    subtype === "x-m4a" || subtype === "mp4"
      ? "m4a"
      : subtype === "mpeg" || subtype === "mp3"
        ? "mp3"
        : subtype === "x-wav"
          ? "wav"
          : subtype === "opus"
            ? "ogg"
            : subtype;
  return `recording.${ext}`;
};

const isAllowedAudio = (mimeType: string, fileName: string) => {
  if (ALLOWED_AUDIO_MIME.has(mimeType)) return true;
  const ext = extensionFromName(fileName);
  return ["m4a", "mp4", "aac", "mp3", "wav", "webm", "ogg", "opus", "flac"].includes(
    ext,
  );
};

export const POST = async (request: NextRequest) => {
  try {
    await getAppTechnicianAuthContext(request);

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      throw new AppApiError(
        APP_ERROR_CODES.VALIDATION_ERROR,
        "Debes enviar el audio como multipart/form-data con el campo file.",
        400,
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AppApiError(
        APP_ERROR_CODES.VALIDATION_ERROR,
        "No se pudo leer el archivo de audio. Intenta de nuevo.",
        400,
      );
    }

    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) {
      throw new AppApiError(
        APP_ERROR_CODES.AUDIO_REQUIRED,
        "Debes adjuntar un archivo de audio en el campo file.",
        400,
      );
    }

    if (file.size > MAX_AUDIO_BYTES) {
      throw new AppApiError(
        APP_ERROR_CODES.AUDIO_TOO_LARGE,
        "El audio es demasiado grande. Graba una nota más corta (máximo 12 MB).",
        400,
      );
    }

    const mimeType = resolveMimeType(file);
    const fileName = resolveFileName(file, mimeType || "audio/m4a");
    if (!isAllowedAudio(mimeType, fileName)) {
      throw new AppApiError(
        APP_ERROR_CODES.AUDIO_INVALID,
        "El formato de audio no es válido. Usa una nota de voz en m4a u otro formato compatible.",
        400,
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const transcript = await transcribeAudioWithGroq({
      bytes,
      mimeType: mimeType || "audio/m4a",
      fileName,
      timeoutMs: 30000,
    });

    if (transcript === null) {
      throw new AppApiError(
        APP_ERROR_CODES.TRANSCRIBE_FAILED,
        "No se pudo transcribir el audio. Intenta de nuevo o escribe la observación.",
        503,
      );
    }

    const text = transcript.trim();
    if (!text) {
      throw new AppApiError(
        APP_ERROR_CODES.TRANSCRIBE_EMPTY,
        "No pudimos entender el audio. Intenta de nuevo o escribe la observación.",
        422,
      );
    }

    return NextResponse.json({ text });
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.TRANSCRIBE_FAILED,
      error: "No se pudo transcribir el audio. Intenta de nuevo o escribe la observación.",
    });
  }
};
