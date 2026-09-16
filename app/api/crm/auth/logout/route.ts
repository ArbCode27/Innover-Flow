import { NextResponse } from "next/server";
import { CRM_SESSION_COOKIE } from "../../_lib/crm-session";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(CRM_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
