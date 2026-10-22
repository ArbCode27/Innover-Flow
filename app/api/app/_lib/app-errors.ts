import { NextResponse } from "next/server";
import type { ZodError, ZodType } from "zod";
import { AppAuthError } from "./app-auth";

export const APP_ERROR_CODES = {
  INVALID_SECRET: "INVALID_SECRET",
  SECRET_NOT_CONFIGURED: "SECRET_NOT_CONFIGURED",
  INVALID_JSON: "INVALID_JSON",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  CEDULA_REQUIRED: "CEDULA_REQUIRED",
  PASSWORD_REQUIRED: "PASSWORD_REQUIRED",
  CEDULA_INVALID: "CEDULA_INVALID",
  CLIENT_NOT_FOUND: "CLIENT_NOT_FOUND",
  WRONG_PASSWORD: "WRONG_PASSWORD",
  APP_DISABLED: "APP_DISABLED",
  ORGANIZATION_INACTIVE: "ORGANIZATION_INACTIVE",
  ORGANIZATION_NOT_FOUND: "ORGANIZATION_NOT_FOUND",
  NAME_REQUIRED: "NAME_REQUIRED",
  PHONE_REQUIRED: "PHONE_REQUIRED",
  DUPLICATE_CLIENT: "DUPLICATE_CLIENT",
  SESSION_FAILED: "SESSION_FAILED",
  MESSAGE_EMPTY: "MESSAGE_EMPTY",
  MESSAGE_TOO_LONG: "MESSAGE_TOO_LONG",
  MESSAGE_LOAD_FAILED: "MESSAGE_LOAD_FAILED",
  MESSAGE_SEND_FAILED: "MESSAGE_SEND_FAILED",
  MEDIA_UPLOAD_FAILED: "MEDIA_UPLOAD_FAILED",
  TICKETS_LOAD_FAILED: "TICKETS_LOAD_FAILED",
  TICKET_NOT_FOUND: "TICKET_NOT_FOUND",
  TICKET_LOAD_FAILED: "TICKET_LOAD_FAILED",
  DEVICE_INVALID: "DEVICE_INVALID",
  DEVICE_REGISTER_FAILED: "DEVICE_REGISTER_FAILED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  PROFILE_LOAD_FAILED: "PROFILE_LOAD_FAILED",
  BILLING_LOAD_FAILED: "BILLING_LOAD_FAILED",
  CONTRACTS_LOAD_FAILED: "CONTRACTS_LOAD_FAILED",
  PAYMENTS_LOAD_FAILED: "PAYMENTS_LOAD_FAILED",
} as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[keyof typeof APP_ERROR_CODES];

export class AppApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "AppApiError";
    this.code = code;
    this.status = status;
  }
}

export const isMissingTableError = (error: unknown) => {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: string }).code || "")
      : "";
  return code === "PGRST205" || code === "42P01";
};

export const appErrorResponse = (input: {
  code: string;
  error: string;
  status: number;
}) =>
  NextResponse.json(
    { error: input.error, code: input.code },
    { status: input.status },
  );

export const parseAppJsonBody = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    throw new AppApiError(
      APP_ERROR_CODES.INVALID_JSON,
      "El formato de la petición no es válido. Intenta de nuevo.",
      400,
    );
  }
};

export const firstZodMessage = (error: ZodError, fallback: string) =>
  error.issues[0]?.message?.trim() || fallback;

export const parseAppSchema = <T>(
  schema: ZodType<T>,
  data: unknown,
  fallback = "Revisa los datos e intenta de nuevo.",
): T => {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new AppApiError(
      APP_ERROR_CODES.VALIDATION_ERROR,
      firstZodMessage(parsed.error, fallback),
      400,
    );
  }
  return parsed.data;
};

export const toAppErrorResponse = (
  error: unknown,
  fallback: { code: string; error: string },
) => {
  if (error instanceof AppApiError) {
    return appErrorResponse({
      code: error.code,
      error: error.message,
      status: error.status,
    });
  }

  if (error instanceof AppAuthError) {
    return appErrorResponse({
      code: APP_ERROR_CODES.SESSION_EXPIRED,
      error: error.message,
      status: error.status,
    });
  }

  if (
    error instanceof Error &&
    error.name === "FieldTicketError" &&
    "code" in error &&
    "status" in error
  ) {
    const ticketError = error as Error & { code: string; status: number };
    const isNotFound = ticketError.code === "not_found";
    return appErrorResponse({
      code: isNotFound ? APP_ERROR_CODES.TICKET_NOT_FOUND : ticketError.code,
      error: isNotFound ? "No encontramos este ticket." : ticketError.message,
      status: ticketError.status,
    });
  }

  if (isMissingTableError(error)) {
    return appErrorResponse({
      code: APP_ERROR_CODES.SERVICE_UNAVAILABLE,
      error: "El servicio no está disponible en este momento. Intenta más tarde.",
      status: 503,
    });
  }

  const pgCode =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: string }).code || "")
      : "";
  if (pgCode === "23505") {
    return appErrorResponse({
      code: APP_ERROR_CODES.DUPLICATE_CLIENT,
      error: "Ya existe un cliente registrado con estos datos.",
      status: 409,
    });
  }

  const status =
    typeof error === "object" &&
    error &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 500;
  const explicitCode =
    typeof error === "object" &&
    error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    !/^\d+$/.test(String((error as { code: string }).code)) &&
    !String((error as { code: string }).code).startsWith("PGRST")
      ? String((error as { code: string }).code)
      : null;

  if (
    status >= 400 &&
    status < 600 &&
    status !== 500 &&
    error instanceof Error &&
    error.message
  ) {
    return appErrorResponse({
      code: explicitCode || APP_ERROR_CODES.VALIDATION_ERROR,
      error: error.message,
      status,
    });
  }

  console.error("[APP_API]", error);
  return appErrorResponse({
    code: fallback.code,
    error: fallback.error,
    status: 500,
  });
};
