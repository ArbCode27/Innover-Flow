import { NextRequest } from "next/server";
import { verifyAppSessionToken, type AppSessionData } from "./app-session";

export class AppAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export const getAppAuthContext = async (
  request: NextRequest,
): Promise<AppSessionData> => {
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const session = await verifyAppSessionToken(bearer);
  if (!session) {
    throw new AppAuthError("Sesión de app inválida o expirada");
  }
  return session;
};
