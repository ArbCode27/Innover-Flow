import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canManageOrganization,
  CrmAuthError,
  getCrmAuthContext,
} from "../_lib/crm-auth-context";
import {
  CRM_SESSION_COOKIE,
  createSignedSessionToken,
} from "../_lib/crm-session";
import { getSupabaseAdmin } from "../_lib/supabase-admin";

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

const switchSchema = z.object({
  organizationId: z.string().uuid(),
});

const setSessionCookie = (
  response: NextResponse,
  token: string,
) => {
  response.cookies.set(CRM_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });
};

export const GET = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    const { data, error } = await getSupabaseAdmin()
      .from("organization_members")
      .select("role, status, organizations(*)")
      .eq("agent_id", context.agentId)
      .eq("status", "active");
    if (error) throw error;
    return NextResponse.json({
      organizations: (data || []).map((membership) => ({
        ...(membership.organizations as unknown as Record<string, unknown>),
        membership_role: membership.role,
        is_current:
          (membership.organizations as unknown as { id?: string })?.id ===
          context.organizationId,
      })),
    });
  } catch (error) {
    const status = error instanceof CrmAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar" },
      { status },
    );
  }
};

export const POST = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    if (!canManageOrganization(context)) {
      return NextResponse.json(
        { error: "No tienes permiso para crear organizaciones" },
        { status: 403 },
      );
    }
    const payload = createSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }
    const supabase = getSupabaseAdmin();
    const { data: organization, error } = await supabase
      .from("organizations")
      .insert(payload.data)
      .select("*")
      .single();
    if (error) throw error;

    const { error: membershipError } = await supabase
      .from("organization_members")
      .insert({
        organization_id: organization.id,
        agent_id: context.agentId,
        role: "owner",
        status: "active",
      });
    if (membershipError) {
      await supabase.from("organizations").delete().eq("id", organization.id);
      throw membershipError;
    }
    return NextResponse.json({ organization }, { status: 201 });
  } catch (error) {
    const status = error instanceof CrmAuthError ? error.status : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo crear la organización",
      },
      { status },
    );
  }
};

export const PATCH = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    const payload = switchSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ error: "Organización inválida" }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();
    const { data: membership, error } = await supabase
      .from("organization_members")
      .select("role, status")
      .eq("organization_id", payload.data.organizationId)
      .eq("agent_id", context.agentId)
      .eq("status", "active")
      .maybeSingle();
    if (error || !membership) {
      return NextResponse.json(
        { error: "No tienes acceso a esta organización" },
        { status: 403 },
      );
    }

    const { error: updateError } = await supabase
      .from("agents")
      .update({
        organization_id: payload.data.organizationId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", context.agentId);
    if (updateError) throw updateError;

    const token = await createSignedSessionToken(
      context.agentId,
      context.agentRole,
      payload.data.organizationId,
    );
    const response = NextResponse.json({ success: true });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    const status = error instanceof CrmAuthError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo cambiar" },
      { status },
    );
  }
};
