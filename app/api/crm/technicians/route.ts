import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canManageOrganization,
  CrmAuthError,
  getCrmAuthContext,
} from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import {
  listTechnicians,
  upsertTechnician,
} from "@/app/api/crm/_lib/field-tickets";
import { decryptIntegrationSecret } from "@/app/api/crm/_lib/integration-secrets";
import { extractCedulaDigits } from "@/lib/client-auth-utils";
import { getEmployees, isFieldEmployee } from "@/lib/wispro";

const technicianBodySchema = z.object({
  id: z.string().uuid().optional(),
  name: z
    .string()
    .trim()
    .min(2, "El nombre es demasiado corto")
    .max(120, "El nombre es demasiado largo"),
  phone: z
    .union([z.string().trim().max(40), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return null;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }),
  document: z
    .union([z.string().trim().max(40), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return null;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }),
  is_supervisor: z.boolean().optional().default(false),
  app_enabled: z.boolean().optional().default(true),
  source_employee_id: z
    .union([z.string().trim().max(120), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return null;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }),
});

const handleError = (error: unknown) => {
  if (error instanceof CrmAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message || "Datos inválidos" },
      { status: 400 },
    );
  }
  const pgCode =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: string }).code || "")
      : "";
  if (pgCode === "23505") {
    return NextResponse.json(
      {
        error:
          "Ya existe un técnico con ese documento o ID de empleado en esta organización.",
      },
      { status: 409 },
    );
  }
  console.error("[TECHNICIANS]", error);
  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "No se pudieron procesar los técnicos",
    },
    { status: 500 },
  );
};

export const GET = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    const supabase = getSupabaseAdmin();
    const localOnly =
      request.nextUrl.searchParams.get("source") === "local" ||
      request.nextUrl.searchParams.get("local") === "1";

    const technicians = await listTechnicians(supabase, context.organizationId);
    if (technicians.length || localOnly) {
      return NextResponse.json({
        data: technicians,
        can_edit: canManageOrganization(context),
        source: "database",
      });
    }

    const { data: integ } = await supabase
      .from("organization_integrations")
      .select("config, credentials_encrypted, status")
      .eq("organization_id", context.organizationId)
      .eq("provider", "wispro")
      .maybeSingle();

    if (integ?.status !== "connected" || !integ.credentials_encrypted) {
      return NextResponse.json({
        data: [],
        can_edit: canManageOrganization(context),
        source: "database",
      });
    }

    const config = (integ.config || {}) as Record<string, unknown>;
    const employees = await getEmployees({
      apiKey: decryptIntegrationSecret(integ.credentials_encrypted),
      baseUrl: String(
        config.base_url || "https://www.cloud.wispro.co/api/v1",
      ),
    });

    return NextResponse.json({
      data: employees.filter(isFieldEmployee).map((employee) => ({
        id: employee.id,
        organizationId: context.organizationId,
        name: employee.name,
        phone: employee.phone_mobile || employee.phone || null,
        document: employee.national_identification_number || null,
        isSupervisor: Boolean(employee.is_supervisor),
        appEnabled: true,
        sourceEmployeeId: employee.id,
      })),
      can_edit: canManageOrganization(context),
      source: "wispro_fallback",
    });
  } catch (error) {
    return handleError(error);
  }
};

export const POST = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    if (!canManageOrganization(context)) {
      throw new CrmAuthError(
        "Solo un administrador puede registrar técnicos",
        403,
      );
    }

    const body = technicianBodySchema.parse(await request.json());
    const documentDigits = extractCedulaDigits(body.document);
    if (body.app_enabled && documentDigits.length < 5) {
      return NextResponse.json(
        {
          error:
            "Para habilitar el acceso a la app, el técnico necesita una cédula válida (mínimo 5 dígitos).",
        },
        { status: 400 },
      );
    }

    const technician = await upsertTechnician(
      getSupabaseAdmin(),
      context.organizationId,
      {
        name: body.name,
        phone: body.phone,
        document: body.document,
        isSupervisor: body.is_supervisor,
        appEnabled: body.app_enabled,
        sourceEmployeeId: body.source_employee_id,
      },
    );

    return NextResponse.json({ data: technician }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
};

export const PUT = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    if (!canManageOrganization(context)) {
      throw new CrmAuthError(
        "Solo un administrador puede editar técnicos",
        403,
      );
    }

    const body = technicianBodySchema
      .extend({ id: z.string().uuid("El id del técnico no es válido") })
      .parse(await request.json());

    const documentDigits = extractCedulaDigits(body.document);
    if (body.app_enabled && documentDigits.length < 5) {
      return NextResponse.json(
        {
          error:
            "Para habilitar el acceso a la app, el técnico necesita una cédula válida (mínimo 5 dígitos).",
        },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: existing, error: existingError } = await supabase
      .from("technicians")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("id", body.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) {
      return NextResponse.json(
        { error: "Técnico no encontrado" },
        { status: 404 },
      );
    }

    const technician = await upsertTechnician(
      supabase,
      context.organizationId,
      {
        id: body.id,
        name: body.name,
        phone: body.phone,
        document: body.document,
        isSupervisor: body.is_supervisor,
        appEnabled: body.app_enabled,
        sourceEmployeeId: body.source_employee_id,
      },
    );

    return NextResponse.json({ data: technician });
  } catch (error) {
    return handleError(error);
  }
};

export const DELETE = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    if (!canManageOrganization(context)) {
      throw new CrmAuthError(
        "Solo un administrador puede eliminar técnicos",
        403,
      );
    }

    const id = request.nextUrl.searchParams.get("id")?.trim() || "";
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json(
        { error: "El id del técnico no es válido" },
        { status: 400 },
      );
    }

    const { error } = await getSupabaseAdmin()
      .from("technicians")
      .delete()
      .eq("organization_id", context.organizationId)
      .eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
};
