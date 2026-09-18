import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getInitials } from "@/app/crm/_lib/formatters";
import { hashPassword } from "../../_lib/password";
import {
  CRM_SESSION_COOKIE,
  createSignedSessionToken,
} from "../../_lib/crm-session";
import { getSupabaseAdmin } from "../../_lib/supabase-admin";
import {
  generateUniqueSlug,
  seedDefaultOrganizationData,
} from "../../_lib/organization-seed";
import type { Agent } from "@/app/crm/_lib/types";

const registerSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, "El nombre de la organización debe tener al menos 2 caracteres")
    .max(100, "El nombre de la organización es muy largo"),
  name: z
    .string()
    .trim()
    .min(2, "Tu nombre debe tener al menos 2 caracteres")
    .max(100, "Tu nombre es muy largo"),
  email: z
    .string()
    .trim()
    .email("Formato de correo electrónico inválido")
    .toLowerCase(),
  password: z
    .string()
    .min(6, "La contraseña debe tener al menos 6 caracteres")
    .max(100, "La contraseña es muy larga"),
});

export const POST = async (request: NextRequest) => {
  try {
    const json = await request.json();
    const payload = registerSchema.safeParse(json);

    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const { organizationName, name, email, password } = payload.data;
    const supabase = getSupabaseAdmin();

    // 1. Verificar si el correo ya está registrado en la tabla de asesores
    const { data: existingAgent } = await supabase
      .from("agents")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (existingAgent) {
      return NextResponse.json(
        {
          error:
            "Ya existe una cuenta con este correo electrónico. Por favor inicia sesión.",
        },
        { status: 409 },
      );
    }

    // 2. Generar slug único para la organización
    const slug = await generateUniqueSlug(supabase, organizationName);

    // 3. Crear la nueva organización
    const { data: organization, error: orgError } = await supabase
      .from("organizations")
      .insert({
        name: organizationName,
        slug,
        status: "active",
      })
      .select("*")
      .single();

    if (orgError || !organization) {
      console.error("[REGISTER] org_creation_failed", orgError);
      return NextResponse.json(
        { error: "No se pudo crear la organización. Intenta nuevamente." },
        { status: 500 },
      );
    }

    // 4. Crear el usuario en Supabase Auth
    let authUserId: string | null = null;
    try {
      const { data: authUser, error: authError } =
        await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            name,
            role: "admin",
            organization_id: organization.id,
            org_role: "owner",
          },
        });

      if (authError) {
        // Rollback de la organización si falló la creación de auth
        await supabase
          .from("organizations")
          .delete()
          .eq("id", organization.id);

        if (authError.message.toLowerCase().includes("already registered")) {
          return NextResponse.json(
            {
              error:
                "El correo ya está registrado en Supabase Auth. Inicia sesión con tus credenciales.",
            },
            { status: 409 },
          );
        }

        console.error("[REGISTER] auth_user_creation_failed", authError);
        return NextResponse.json(
          { error: authError.message || "Error creando usuario en autenticación" },
          { status: 400 },
        );
      }

      authUserId = authUser?.user?.id || null;
    } catch (authException) {
      await supabase.from("organizations").delete().eq("id", organization.id);
      console.error("[REGISTER] auth_exception", authException);
      return NextResponse.json(
        { error: "Error en el servicio de autenticación" },
        { status: 500 },
      );
    }

    // 5. Crear o actualizar el perfil de agente para la organización
    const hashedPassword = await hashPassword(password);
    const initials = getInitials(name);

    // Puede que el trigger `handle_new_auth_user` ya haya creado un registro inicial
    const { data: agentByEmail } = await supabase
      .from("agents")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    let createdAgent: Agent;

    if (agentByEmail) {
      const { data: updated, error: updateError } = await supabase
        .from("agents")
        .update({
          user_id: authUserId,
          organization_id: organization.id,
          name,
          password: hashedPassword,
          role: "admin",
          status: "online",
          initials,
          updated_at: new Date().toISOString(),
        })
        .eq("id", agentByEmail.id)
        .select("*")
        .single<Agent>();

      if (updateError || !updated) {
        throw updateError || new Error("No se pudo actualizar el agente");
      }
      createdAgent = updated;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("agents")
        .insert({
          user_id: authUserId,
          organization_id: organization.id,
          name,
          email,
          password: hashedPassword,
          role: "admin",
          status: "online",
          initials,
          avatar_color: "#4f8ef7",
          avatar_bg: "rgba(79,142,247,.15)",
          max_conversations: 20,
        })
        .select("*")
        .single<Agent>();

      if (insertError || !inserted) {
        throw insertError || new Error("No se pudo insertar el agente");
      }
      createdAgent = inserted;
    }

    // 6. Vincular como 'owner' en organization_members
    await supabase
      .from("organization_members")
      .upsert(
        {
          organization_id: organization.id,
          agent_id: createdAgent.id,
          role: "owner",
          status: "active",
        },
        { onConflict: "organization_id,agent_id" },
      );

    // 7. Siembra de datos semilla para la nueva empresa (ajustes, etiquetas operativas, respuestas rápidas)
    await seedDefaultOrganizationData(supabase, organization.id, createdAgent.id);

    // 8. Crear token de sesión firmado para acceso inmediato
    const sessionToken = await createSignedSessionToken(
      createdAgent.id,
      createdAgent.role,
      organization.id,
    );

    const safeAgent = { ...createdAgent, status: "online" as const };
    delete safeAgent.password;

    const response = NextResponse.json(
      {
        success: true,
        agent: safeAgent,
        organization,
      },
      { status: 201 },
    );

    // 9. Establecer cookie de sesión
    response.cookies.set(CRM_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 días
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[REGISTER] unexpected_error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo completar el registro de la organización",
      },
      { status: 500 },
    );
  }
};
