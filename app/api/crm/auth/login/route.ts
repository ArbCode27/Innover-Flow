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

    // 1. Intentar autenticación mediante Supabase Auth (auth.users)
    let authUserId: string | null = null;
    try {
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (!authError && authData?.user) {
        authUserId = authData.user.id;
      }
    } catch (authErr) {
      console.warn("[AUTH_LOGIN] supabase_auth_attempt_failed", authErr);
    }

    // 2. Buscar el registro del asesor en public.agents
    const { data: agent, error } = await supabase
      .from("agents")
      .select("*")
      .eq("email", email)
      .maybeSingle<Agent>();

    // 3. Si no pasó por Supabase Auth, comprobar fallback de contraseña local
    if (!authUserId) {
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

      // Migración transparente a Supabase Auth
      try {
        const { data: createdAuth } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name: agent.name, role: agent.role },
        });
        if (createdAuth?.user) {
          authUserId = createdAuth.user.id;
          await supabase
            .from("agents")
            .update({ user_id: authUserId })
            .eq("id", agent.id);
        }
      } catch {
        // Usuario ya existe en Supabase Auth o error no crítico
      }
    } else if (agent && !agent.user_id) {
      // Si autenticó con Supabase Auth pero faltaba user_id en public.agents
      await supabase
        .from("agents")
        .update({ user_id: authUserId })
        .eq("id", agent.id);
    }

    if (!agent) {
      return NextResponse.json(
        { error: "No se encontró el perfil de asesor asociado" },
        { status: 404 },
      );
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

    const safeAgent = {
      ...agent,
      status: "online" as const,
      department: agent.department || "soporte",
    };
    delete safeAgent.password;

    // Determinar la organización activa del agente
    let activeOrgId = agent.organization_id;
    const { data: memberships } = await supabase
      .from("organization_members")
      .select("organization_id, role, status")
      .eq("agent_id", agent.id)
      .eq("status", "active");

    if (memberships && memberships.length > 0) {
      const isMemberOfCurrent =
        activeOrgId && memberships.some((m) => m.organization_id === activeOrgId);
      if (!isMemberOfCurrent) {
        activeOrgId = memberships[0].organization_id;
        await supabase
          .from("agents")
          .update({ organization_id: activeOrgId })
          .eq("id", agent.id);
      }
    }

    if (!activeOrgId) {
      return NextResponse.json(
        { error: "El agente no pertenece a ninguna organización activa" },
        { status: 403 },
      );
    }

    const sessionToken = await createSignedSessionToken(
      agent.id,
      agent.role,
      activeOrgId,
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
