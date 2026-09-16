import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canManageOrganization,
  getCrmAuthContext,
} from "../_lib/crm-auth-context";
import { hashPassword } from "../_lib/password";
import { getSupabaseAdmin } from "../_lib/supabase-admin";

const agentSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(128).optional(),
  role: z.enum(["admin", "agent"]),
  initials: z.string().trim().min(1).max(4),
  maxConversations: z.number().int().min(1).max(100),
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
    const values = {
      name: payload.data.name,
      email: payload.data.email.toLowerCase(),
      role: payload.data.role,
      initials: payload.data.initials,
      max_conversations: payload.data.maxConversations,
      updated_at: new Date().toISOString(),
      ...(payload.data.password
        ? { password: await hashPassword(payload.data.password) }
        : {}),
    };

    if (payload.data.id) {
      const { data: membership } = await supabase
        .from("organization_members")
        .select("agent_id")
        .eq("organization_id", context.organizationId)
        .eq("agent_id", payload.data.id)
        .maybeSingle();
      if (!membership) {
        return NextResponse.json({ error: "Asesor no encontrado" }, { status: 404 });
      }
      const { data, error } = await supabase
        .from("agents")
        .update(values)
        .eq("id", payload.data.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return NextResponse.json({ error: "Asesor no encontrado" }, { status: 404 });
      }
      await supabase
        .from("organization_members")
        .update({ role: payload.data.role === "admin" ? "admin" : "advisor" })
        .eq("organization_id", context.organizationId)
        .eq("agent_id", payload.data.id);
      return NextResponse.json({ success: true });
    }

    const { data: created, error: createError } = await supabase
      .from("agents")
      .insert({
        ...values,
        organization_id: context.organizationId,
        status: "offline",
        avatar_color: "#4f8ef7",
        avatar_bg: "rgba(79,142,247,.15)",
      })
      .select("id")
      .single();
    if (createError) throw createError;

    const { error: membershipError } = await supabase
      .from("organization_members")
      .insert({
        organization_id: context.organizationId,
        agent_id: created.id,
        role: payload.data.role === "admin" ? "admin" : "advisor",
        status: "active",
      });
    if (membershipError) {
      await supabase.from("agents").delete().eq("id", created.id);
      throw membershipError;
    }
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("[CRM_AGENTS] save_failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar" },
      { status: 500 },
    );
  }
};
