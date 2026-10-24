import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { transcribeAudioWithGroq } from "@/app/api/crm/ai/_lib/ai-client";
import {
  AppAuthError,
  getAppTechnicianAuthContext,
} from "../../_lib/app-auth";
import {
  APP_ERROR_CODES,
  AppApiError,
  toAppErrorResponse,
} from "../../_lib/app-errors";

const LOG_PREFIX = "[APP_TRANSCRIBE]";
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const REQUEST_ID_HEADER = "x-request-id";

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

const resolveRequestId = (request: NextRequest) => {
  const incoming = request.headers.get(REQUEST_ID_HEADER)?.trim();
  if (incoming && incoming.length <= 128) return incoming;
  return randomUUID();
};

const summarizeContentType = (contentType: string) => {
  const lower = contentType.toLowerCase();
  return {
    raw: contentType.slice(0, 120),
    isMultipart: lower.includes("multipart/form-data"),
    hasBoundary: lower.includes("boundary="),
  };
};

const formFieldSummary = (form: FormData) => {
  const keys = [...form.keys()];
  const uniqueKeys = [...new Set(keys)];
  return {
    fieldKeys: uniqueKeys,
    fileFieldCount: keys.filter((key) => key === "file").length,
    hasFileField: uniqueKeys.includes("file"),
  };
};

const fileSummary = (file: FormDataEntryValue | null) => {
  if (!(file instanceof File)) {
    return {
      isFile: false,
      valueType: file === null ? "null" : typeof file,
    };
  }
  return {
    isFile: true,
    name: file.name || null,
    type: file.type || null,
    size: file.size,
    lastModified: Number.isFinite(file.lastModified) ? file.lastModified : null,
  };
};

const withRequestId = (response: NextResponse, requestId: string) => {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
};

const errorMeta = (error: unknown) => {
  if (error instanceof AppApiError) {
    return { code: error.code, status: error.status, kind: "AppApiError" as const };
  }
  if (error instanceof AppAuthError) {
    return {
      code: APP_ERROR_CODES.SESSION_EXPIRED,
      status: error.status,
      kind: "AppAuthError" as const,
    };
  }
  return {
    code: APP_ERROR_CODES.TRANSCRIBE_FAILED,
    status: 500,
    kind: "unknown" as const,
    message: error instanceof Error ? error.message.slice(0, 160) : "unknown_error",
  };
};

export const POST = async (request: NextRequest) => {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request);
  const contentTypeHeader = request.headers.get("content-type") || "";
  const authHeader = request.headers.get("authorization") || "";

  console.log(`${LOG_PREFIX} received`, {
    requestId,
    method: request.method,
    hasAuth: authHeader.toLowerCase().startsWith("bearer "),
    authScheme: authHeader ? authHeader.split(" ")[0] : null,
    contentLength: request.headers.get("content-length"),
    contentType: summarizeContentType(contentTypeHeader),
    userAgent: (request.headers.get("user-agent") || "").slice(0, 120) || null,
  });

  try {
    const session = await getAppTechnicianAuthContext(request);

    console.log(`${LOG_PREFIX} auth_ok`, {
      requestId,
      organizationId: session.organizationId,
      technicianId: session.technicianId,
      role: session.role,
    });

    if (!contentTypeHeader.includes("multipart/form-data")) {
      throw new AppApiError(
        APP_ERROR_CODES.VALIDATION_ERROR,
        "Debes enviar el audio como multipart/form-data con el campo file.",
        400,
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch (parseError) {
      console.warn(`${LOG_PREFIX} formdata_parse_failed`, {
        requestId,
        error:
          parseError instanceof Error
            ? parseError.message.slice(0, 160)
            : "unknown_error",
      });
      throw new AppApiError(
        APP_ERROR_CODES.VALIDATION_ERROR,
        "No se pudo leer el archivo de audio. Intenta de nuevo.",
        400,
      );
    }

    const fields = formFieldSummary(form);
    const file = form.get("file");
    const incomingFile = fileSummary(file);

    console.log(`${LOG_PREFIX} file_received`, {
      requestId,
      ...fields,
      file: incomingFile,
    });

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
      console.warn(`${LOG_PREFIX} audio_invalid`, {
        requestId,
        declaredType: file.type || null,
        resolvedMime: mimeType || null,
        resolvedFileName: fileName,
        size: file.size,
      });
      throw new AppApiError(
        APP_ERROR_CODES.AUDIO_INVALID,
        "El formato de audio no es válido. Usa una nota de voz en m4a u otro formato compatible.",
        400,
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    console.log(`${LOG_PREFIX} whisper_start`, {
      requestId,
      mimeType: mimeType || "audio/m4a",
      fileName,
      size: bytes.byteLength,
    });

    const transcript = await transcribeAudioWithGroq({
      bytes,
      mimeType: mimeType || "audio/m4a",
      fileName,
      timeoutMs: 30000,
    });

    if (transcript === null) {
      console.warn(`${LOG_PREFIX} whisper_failed`, {
        requestId,
        mimeType: mimeType || "audio/m4a",
        fileName,
        size: bytes.byteLength,
        durationMs: Date.now() - startedAt,
      });
      throw new AppApiError(
        APP_ERROR_CODES.TRANSCRIBE_FAILED,
        "No se pudo transcribir el audio. Intenta de nuevo o escribe la observación.",
        503,
      );
    }

    const text = transcript.trim();
    if (!text) {
      console.warn(`${LOG_PREFIX} whisper_empty`, {
        requestId,
        mimeType: mimeType || "audio/m4a",
        fileName,
        size: bytes.byteLength,
        durationMs: Date.now() - startedAt,
      });
      throw new AppApiError(
        APP_ERROR_CODES.TRANSCRIBE_EMPTY,
        "No pudimos entender el audio. Intenta de nuevo o escribe la observación.",
        422,
      );
    }

    console.log(`${LOG_PREFIX} ok`, {
      requestId,
      organizationId: session.organizationId,
      technicianId: session.technicianId,
      mimeType: mimeType || "audio/m4a",
      fileName,
      size: bytes.byteLength,
      textLen: text.length,
      durationMs: Date.now() - startedAt,
    });

    return withRequestId(NextResponse.json({ text }), requestId);
  } catch (error) {
    const meta = errorMeta(error);
    console.warn(`${LOG_PREFIX} fail`, {
      requestId,
      ...meta,
      durationMs: Date.now() - startedAt,
    });

    return withRequestId(
      toAppErrorResponse(error, {
        code: APP_ERROR_CODES.TRANSCRIBE_FAILED,
        error:
          "No se pudo transcribir el audio. Intenta de nuevo o escribe la observación.",
      }),
      requestId,
    );
  }
};
