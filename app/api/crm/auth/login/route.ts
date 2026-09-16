import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "../../_lib/supabase-admin";
import {
  CRM_SESSION_COOKIE,
  createSignedSessionToken,
} from "../../_lib/crm-session";
import type { Agent } from "@/app/crm/_lib/types";
import { hashPassword, verifyPassword } from "../../_lib/password";

const loginSchema = z.object({
  email: z.string().trim().email("Formato de correo inválido"),
  password: z.string().min(1, "La contraseña es requerida"),
});

export async function POST(req: NextRequest) {
  try {
    const payload = loginSchema.safeParse(await req.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const { email, password } = payload.data;
    const supabase = getSupabaseAdmin();

    const { data: agent, error } = await supabase
      .from("agents")
      .select("*")
      .eq("email", email)
      .maybeSingle<Agent>();

    const passwordResult =
      agent?.password && !error
        ? await verifyPassword(password, agent.password)
        : { valid: false, needsRehash: false };
    if (error || !agent || !passwordResult.valid) {
      return NextResponse.json(
        { error: "Correo o contraseña incorrectos" },
        { status: 401 },
      );
    }

    if (passwordResult.needsRehash) {
      await supabase
        .from("agents")
        .update({ password: await hashPassword(password) })
        .eq("id", agent.id);
    }

    if (agent.status === "inactive") {
      return NextResponse.json(
        { error: "Tu cuenta está inactiva. Contacta al administrador." },
        { status: 403 },
      );
    }

    // Actualizar estado a online
    await supabase
      .from("agents")
      .update({ status: "online", updated_at: new Date().toISOString() })
      .eq("id", agent.id);

    const safeAgent = { ...agent, status: "online" as const };
    delete safeAgent.password;

    if (!agent.organization_id) {
      return NextResponse.json(
        { error: "El agente no pertenece a una organización" },
        { status: 403 },
      );
    }

    const sessionToken = await createSignedSessionToken(
      agent.id,
      agent.role,
      agent.organization_id,
    );

    const response = NextResponse.json({
      success: true,
      agent: safeAgent,
    });

    response.cookies.set(CRM_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 días
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[AUTH_LOGIN] error", error);
    return NextResponse.json(
      { error: "Error en el servidor al iniciar sesión" },
      { status: 500 },
    );
  }
}
