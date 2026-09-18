import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canManageOrganization,
  CrmAuthError,
  getCrmAuthContext,
} from "../_lib/crm-auth-context";
import { getSupabaseAdmin } from "../_lib/supabase-admin";

const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  legal_name: z.string().trim().max(160).nullable().optional(),
  tax_id: z.string().trim().max(40).nullable().optional(),
  email: z
    .string()
    .trim()
    .max(160)
    .refine((val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
      message: "Formato de correo inválido",
    })
    .nullable()
    .optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().max(240).nullable().optional(),
  logo_url: z.string().trim().nullable().optional(),
  timezone: z.string().trim().min(1).max(80),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
});

const handleError = (error: unknown) => {
  if (error instanceof CrmAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[CRM_ORGANIZATION] request_failed", error);
  return NextResponse.json(
    { error: "No se pudo procesar la organización" },
    { status: 500 },
  );
};

export const GET = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    const { data, error } = await getSupabaseAdmin()
      .from("organizations")
      .select("*")
      .eq("id", context.organizationId)
      .single();
    if (error) throw error;
    return NextResponse.json({ organization: data });
  } catch (error) {
    return handleError(error);
  }
};

export const PATCH = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    if (!canManageOrganization(context)) {
      return NextResponse.json(
        { error: "Solo administradores pueden editar la organización" },
        { status: 403 },
      );
    }

    const payload = updateOrganizationSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const normalized = Object.fromEntries(
      Object.entries(payload.data).map(([key, value]) => [
        key,
        typeof value === "string" ? value.trim() || null : value,
      ]),
    );
    const { data, error } = await getSupabaseAdmin()
      .from("organizations")
      .update({ ...normalized, updated_at: new Date().toISOString() })
      .eq("id", context.organizationId)
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ organization: data });
  } catch (error) {
    return handleError(error);
  }
};
