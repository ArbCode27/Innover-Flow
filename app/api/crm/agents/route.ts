import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canManageOrganization,
  CrmAuthError,
  getCrmAuthContext,
} from "../_lib/crm-auth-context";
import { hashPassword } from "../_lib/password";
import { getSupabaseAdmin } from "../_lib/supabase-admin";

const agentSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(100),
  email: z.string().trim().email("Formato de correo inválido").max(160),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres").max(128).optional(),
  role: z.enum(["admin", "agent"]),
  department: z.enum(["cobranza", "soporte", "general"]).optional(),
  status: z.enum(["online", "busy", "offline", "inactive"]).optional(),
  initials: z.string().trim().min(1).max(4),
  maxConversations: z.number().int().min(1).max(100),
});

const deleteSchema = z.object({
  id: z.number().int().positive(),
});

export const POST = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    if (!canManageOrganization(context)) {
      return NextResponse.json(
        { error: "Solo administradores pueden gestionar asesores" },
        { status: 403 },
      );
    }

    const payload = agentSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    if (!payload.data.id && !payload.data.password) {
      return NextResponse.json(
        { error: "La contraseña es requerida para un nuevo asesor" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const values: Record<string, unknown> = {
      name: payload.data.name,
      email: payload.data.email.toLowerCase(),
      role: payload.data.role,
      department: payload.data.department || "soporte",
      initials: payload.data.initials,
      max_conversations: payload.data.maxConversations,
      updated_at: new Date().toISOString(),
      ...(payload.data.status ? { status: payload.data.status } : {}),
      ...(payload.data.password
        ? { password: await hashPassword(payload.data.password) }
        : {}),
    };

    // Caso 1: Actualizar agente existente en esta organización
    if (payload.data.id) {
      const { data: membership } = await supabase
        .from("organization_members")
        .select("agent_id")
        .eq("organization_id", context.organizationId)
        .eq("agent_id", payload.data.id)
        .maybeSingle();

      if (!membership) {
        return NextResponse.json({ error: "Asesor no encontrado en esta organización" }, { status: 404 });
      }

      let updatedAgent: { id: number; user_id: string | null; email: string } | null = null;
      const { data: updateData, error: updateError } = await supabase
        .from("agents")
        .update(values)
        .eq("id", payload.data.id)
        .select("id, user_id, email")
        .maybeSingle();

      if (updateError && updateError.message?.toLowerCase().includes("department")) {
        const { department: _d, ...valuesWithoutDept } = values;
        const retryResult = await supabase
          .from("agents")
          .update(valuesWithoutDept)
          .eq("id", payload.data.id)
          .select("id, user_id, email")
          .maybeSingle();
        if (retryResult.error) throw retryResult.error;
        updatedAgent = retryResult.data;
      } else if (updateError) {
        throw updateError;
      } else {
        updatedAgent = updateData;
      }

      if (!updatedAgent) {
        return NextResponse.json({ error: "Asesor no encontrado" }, { status: 404 });
      }

      // Sincronizar en Supabase Auth
      try {
        if (updatedAgent.user_id) {
          await supabase.auth.admin.updateUserById(updatedAgent.user_id, {
            ...(payload.data.password ? { password: payload.data.password } : {}),
            user_metadata: {
              name: payload.data.name,
              role: payload.data.role,
              department: payload.data.department || "soporte",
              organization_id: context.organizationId,
              org_role: payload.data.role === "admin" ? "admin" : "advisor",
            },
          });
        } else if (payload.data.password) {
          const { data: createdAuth } = await supabase.auth.admin.createUser({
            email: updatedAgent.email,
            password: payload.data.password,
            email_confirm: true,
            user_metadata: {
              name: payload.data.name,
              role: payload.data.role,
              department: payload.data.department || "soporte",
              organization_id: context.organizationId,
              org_role: payload.data.role === "admin" ? "admin" : "advisor",
            },
          });
          if (createdAuth?.user) {
            await supabase
              .from("agents")
              .update({ user_id: createdAuth.user.id })
              .eq("id", updatedAgent.id);
          }
        }
      } catch (authSyncErr) {
        console.warn("[CRM_AGENTS] supabase_auth_update_failed", authSyncErr);
      }

      await supabase
        .from("organization_members")
        .update({ role: payload.data.role === "admin" ? "admin" : "advisor" })
        .eq("organization_id", context.organizationId)
        .eq("agent_id", payload.data.id);

      return NextResponse.json({ success: true });
    }

    // Caso 2: Crear o vincular nuevo asesor
    const normalizedEmail = payload.data.email.toLowerCase();

    // 1. Comprobar si el agente ya existe en public.agents
    const { data: existingAgent } = await supabase
      .from("agents")
      .select("id, user_id, email, organization_id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingAgent) {
      // Comprobar si ya es miembro de esta organización
      const { data: existingMember } = await supabase
        .from("organization_members")
        .select("organization_id, agent_id, role")
        .eq("organization_id", context.organizationId)
        .eq("agent_id", existingAgent.id)
        .maybeSingle();

      if (existingMember) {
        // En vez de rechazar con 409 y bloquear el flujo, actualizamos el asesor con los datos enviados
        let updatedAgent: { id: number } | null = null;
        const { data: updateData, error: updateError } = await supabase
          .from("agents")
          .update(values)
          .eq("id", existingAgent.id)
          .select("id")
          .maybeSingle();

        if (updateError && updateError.message?.toLowerCase().includes("department")) {
          const { department: _d, ...valuesWithoutDept } = values;
          const retryResult = await supabase
            .from("agents")
            .update(valuesWithoutDept)
            .eq("id", existingAgent.id)
            .select("id")
            .maybeSingle();
          if (retryResult.error) throw retryResult.error;
          updatedAgent = retryResult.data;
        } else if (updateError) {
          throw updateError;
        } else {
          updatedAgent = updateData;
        }

        await supabase
          .from("organization_members")
          .update({
            role: payload.data.role === "admin" ? "admin" : "advisor",
            status: "active",
          })
          .eq("organization_id", context.organizationId)
          .eq("agent_id", existingAgent.id);

        if (existingAgent.user_id) {
          try {
            await supabase.auth.admin.updateUserById(existingAgent.user_id, {
              ...(payload.data.password ? { password: payload.data.password } : {}),
              user_metadata: {
                name: payload.data.name,
                role: payload.data.role,
                department: payload.data.department || "soporte",
                organization_id: context.organizationId,
                org_role: payload.data.role === "admin" ? "admin" : "advisor",
              },
            });
          } catch (authErr) {
            console.warn("[CRM_AGENTS] supabase_auth_update_failed", authErr);
          }
        }

        return NextResponse.json({ success: true, agentId: existingAgent.id });
      }

      // Si el agente existe en la base de datos pero en otra organización, vincularlo a esta
      await supabase.from("organization_members").insert({
        organization_id: context.organizationId,
        agent_id: existingAgent.id,
        role: payload.data.role === "admin" ? "admin" : "advisor",
        status: "active",
      });

      if (existingAgent.user_id) {
        try {
          await supabase.auth.admin.updateUserById(existingAgent.user_id, {
            ...(payload.data.password ? { password: payload.data.password } : {}),
            user_metadata: {
              name: payload.data.name,
              role: payload.data.role,
              department: payload.data.department || "soporte",
              organization_id: context.organizationId,
              org_role: payload.data.role === "admin" ? "admin" : "advisor",
            },
          });
        } catch {
          // No fatal
        }
      }

      return NextResponse.json({ success: true, agentId: existingAgent.id }, { status: 201 });
    }

    // 2. Crear usuario en Supabase Auth
    let authUserId: string | null = null;
    if (payload.data.password) {
      try {
        const { data: authCreated, error: authError } = await supabase.auth.admin.createUser({
          email: normalizedEmail,
          password: payload.data.password,
          email_confirm: true,
          user_metadata: {
            name: payload.data.name,
            role: payload.data.role,
            department: payload.data.department || "soporte",
            organization_id: context.organizationId,
            org_role: payload.data.role === "admin" ? "admin" : "advisor",
          },
        });

        if (authCreated?.user) {
          authUserId = authCreated.user.id;
        } else if (authError) {
          // Si ya existía en auth.users, buscarlo y reutilizar el id
          const { data: userList } = await supabase.auth.admin.listUsers();
          const found = userList?.users?.find(
            (u) => u.email?.toLowerCase() === normalizedEmail,
          );
          if (found) {
            authUserId = found.id;
            await supabase.auth.admin.updateUserById(found.id, {
              password: payload.data.password,
              user_metadata: {
                name: payload.data.name,
                role: payload.data.role,
                department: payload.data.department || "soporte",
                organization_id: context.organizationId,
                org_role: payload.data.role === "admin" ? "admin" : "advisor",
              },
            });
          }
        }
      } catch (authCreateErr) {
        console.warn("[CRM_AGENTS] supabase_auth_create_failed", authCreateErr);
      }
    }

    // 3. Comprobar si el trigger de auth.users ya insertó el agente en public.agents
    const { data: agentAfterAuth } = await supabase
      .from("agents")
      .select("id, user_id, email")
      .or(
        authUserId
          ? `user_id.eq.${authUserId},email.eq.${normalizedEmail}`
          : `email.eq.${normalizedEmail}`,
      )
      .maybeSingle();

    let createdId: number | null = null;

    if (agentAfterAuth) {
      // El trigger en auth.users ya insertó el agente; actualizamos los campos completos
      const { data: updated, error: updateErr } = await supabase
        .from("agents")
        .update({
          ...values,
          ...(authUserId ? { user_id: authUserId } : {}),
          organization_id: context.organizationId,
        })
        .eq("id", agentAfterAuth.id)
        .select("id")
        .maybeSingle();

      if (updateErr && updateErr.message?.toLowerCase().includes("department")) {
        const { department: _d, ...valuesWithoutDept } = values;
        const retryResult = await supabase
          .from("agents")
          .update({
            ...valuesWithoutDept,
            ...(authUserId ? { user_id: authUserId } : {}),
            organization_id: context.organizationId,
          })
          .eq("id", agentAfterAuth.id)
          .select("id")
          .maybeSingle();
        if (retryResult.error) throw retryResult.error;
        createdId = retryResult.data?.id || agentAfterAuth.id;
      } else if (updateErr) {
        throw updateErr;
      } else {
        createdId = updated?.id || agentAfterAuth.id;
      }
    } else {
      // El trigger no insertó el agente (o está desactivado); lo insertamos directamente
      const { data: createdData, error: createError } = await supabase
        .from("agents")
        .insert({
          ...values,
          ...(authUserId ? { user_id: authUserId } : {}),
          organization_id: context.organizationId,
          status: payload.data.status || "offline",
          avatar_color: "#4f8ef7",
          avatar_bg: "rgba(79,142,247,.15)",
        })
        .select("id")
        .single();

      if (createError && createError.message?.toLowerCase().includes("department")) {
        const { department: _d, ...valuesWithoutDept } = values;
        const retryResult = await supabase
          .from("agents")
          .insert({
            ...valuesWithoutDept,
            ...(authUserId ? { user_id: authUserId } : {}),
            organization_id: context.organizationId,
            status: payload.data.status || "offline",
            avatar_color: "#4f8ef7",
            avatar_bg: "rgba(79,142,247,.15)",
          })
          .select("id")
          .single();
        if (retryResult.error) throw retryResult.error;
        createdId = retryResult.data?.id ?? null;
      } else if (createError) {
        throw createError;
      } else {
        createdId = createdData?.id ?? null;
      }
    }

    if (!createdId) {
      throw new Error("No se pudo registrar el asesor");
    }

    // 4. Vincular o confirmar membresía activa en la organización
    await supabase
      .from("organization_members")
      .upsert(
        {
          organization_id: context.organizationId,
          agent_id: createdId,
          role: payload.data.role === "admin" ? "admin" : "advisor",
          status: "active",
        },
        { onConflict: "organization_id,agent_id" },
      );

    return NextResponse.json({ success: true, agentId: createdId }, { status: 201 });
  } catch (error) {
    console.error("[CRM_AGENTS] save_failed", error);
    const status = error instanceof CrmAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar el asesor" },
      { status },
    );
  }
};

export const DELETE = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    if (!canManageOrganization(context)) {
      return NextResponse.json(
        { error: "Solo administradores pueden eliminar o desvincular asesores" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const rawId = searchParams.get("id");
    const parsed = deleteSchema.safeParse({ id: rawId ? Number(rawId) : undefined });

    if (!parsed.success) {
      return NextResponse.json({ error: "Identificador de asesor inválido" }, { status: 400 });
    }

    const targetAgentId = parsed.data.id;

    if (targetAgentId === context.agentId) {
      return NextResponse.json(
        { error: "No puedes eliminar tu propio usuario de la organización" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    // 1. Liberar conversaciones activas del asesor en esta organización
    await supabase
      .from("conversations")
      .update({
        agent_id: null,
        agent_control: null,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", context.organizationId)
      .eq("agent_id", targetAgentId);

    // 2. Desvincular de la organización en organization_members
    const { error: deleteMemberError } = await supabase
      .from("organization_members")
      .delete()
      .eq("organization_id", context.organizationId)
      .eq("agent_id", targetAgentId);

    if (deleteMemberError) throw deleteMemberError;

    // 3. Si no pertenece a ninguna otra organización activa, marcarlo como inactive
    const { data: remainingMemberships } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("agent_id", targetAgentId);

    if (!remainingMemberships || remainingMemberships.length === 0) {
      await supabase
        .from("agents")
        .update({ status: "inactive", updated_at: new Date().toISOString() })
        .eq("id", targetAgentId);
    }

    return NextResponse.json({
      success: true,
      message: "Asesor desvinculado de la organización exitosamente",
    });
  } catch (error) {
    console.error("[CRM_AGENTS] delete_failed", error);
    const status = error instanceof CrmAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo desvincular al asesor" },
      { status },
    );
  }
};
