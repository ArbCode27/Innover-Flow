import { NextRequest } from "next/server";
import {
  verifyAppSessionToken,
  type AppSessionData,
  type AppSessionRole,
} from "./app-session";

export class AppAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export type AppCustomerSession = AppSessionData & {
  role: "customer";
  clientId: number;
};

export type AppTechnicianSession = AppSessionData & {
  role: "technician" | "supervisor";
  technicianId: string;
};

export const getAppAuthContext = async (
  request: NextRequest,
): Promise<AppSessionData> => {
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const session = await verifyAppSessionToken(bearer);
  if (!session) {
    throw new AppAuthError("Tu sesión expiró. Inicia sesión de nuevo.", 401);
  }
  return session;
};

export const getAppCustomerAuthContext = async (
  request: NextRequest,
): Promise<AppCustomerSession> => {
  const session = await getAppAuthContext(request);
  if (session.role !== "customer" || !session.clientId) {
    throw new AppAuthError(
      "Esta función solo está disponible para clientes.",
      403,
    );
  }
  return session as AppCustomerSession;
};

export const getAppTechnicianAuthContext = async (
  request: NextRequest,
  options?: { allowSupervisor?: boolean },
): Promise<AppTechnicianSession> => {
  const session = await getAppAuthContext(request);
  const allowSupervisor = options?.allowSupervisor !== false;
  const okRoles: AppSessionRole[] = allowSupervisor
    ? ["technician", "supervisor"]
    : ["technician"];
  if (!okRoles.includes(session.role) || !session.technicianId) {
    throw new AppAuthError(
      "Esta función solo está disponible para técnicos.",
      403,
    );
  }
  return session as AppTechnicianSession;
};
