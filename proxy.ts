import { NextRequest, NextResponse } from "next/server";
import {
  CRM_SESSION_COOKIE,
  verifySignedSessionToken,
} from "./app/api/crm/_lib/crm-session";

const PUBLIC_API_PREFIXES = ["/api/crm/auth/", "/api/crm/ai/reply"];

export const proxy = async (request: NextRequest) => {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/crm/")) {
    return NextResponse.next();
  }

  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const internalSecret = request.headers.get("x-crm-internal-secret");
  const expectedSecret = process.env.CRM_INTERNAL_SECRET?.trim();
  if (expectedSecret && internalSecret === expectedSecret) {
    return NextResponse.next();
  }

  const token = request.cookies.get(CRM_SESSION_COOKIE)?.value;
  const session = await verifySignedSessionToken(token);
  if (!session) {
    return NextResponse.json(
      { error: "Sesión no válida o expirada" },
      { status: 401 },
    );
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-agent-id", String(session.agentId));
  requestHeaders.set("x-agent-role", session.role);
  requestHeaders.set("x-organization-id", session.organizationId);
  return NextResponse.next({ request: { headers: requestHeaders } });
};

export const config = {
  matcher: ["/api/crm/:path*"],
};
