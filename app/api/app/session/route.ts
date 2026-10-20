import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { CRM_COLORS } from "@/app/crm/_lib/constants";
import {
  findOrCreateOpenConversation,
  normalizeChannelPhone,
} from "@/app/api/crm/_lib/channel-messages";
import { assertAppChannelSecret, createAppSessionToken } from "../_lib/app-session";
import {
  extractCedulaDigits,
  generateClientAppPassword,
  verifyClientAppPassword,
  getClientInitials,
} from "@/lib/client-auth-utils";

const sessionRequestSchema = z.object({
  action: z.enum(["login", "register"]).default("login"),
  // organization_slug es opcional: el cliente se identifica unívocamente por su cédula
  organization_slug: z.string().trim().max(80).optional(),
  // Login: cédula y clave
  cedula: z.string().trim().max(40).optional(),
  identifier: z.string().trim().max(80).optional(),
  password: z.string().trim().max(80).optional(),
  // Registro desde la app:
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
});

export const POST = async (request: NextRequest) => {
  try {
    assertAppChannelSecret(request);
    const body = await request.json();
    const parsed = sessionRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const {
      action,
      organization_slug,
      cedula,
      identifier,
      password,
      name,
      phone,
    } = parsed.data;

    const supabase = getSupabaseAdmin();

    // ========================================================================
    // FLUJO: REGISTRO DE CLIENTE DESDE LA APP
    // ========================================================================
    if (action === "register") {
      const cleanName = (name || "").trim();
      if (!cleanName || cleanName.length < 2) {
        return NextResponse.json(
          { error: "El nombre completo es requerido para registrar el cliente" },
          { status: 400 },
        );
      }

      const cleanCedula = extractCedulaDigits(cedula || identifier);
      if (!cleanCedula || cleanCedula.length < 5) {
        return NextResponse.json(
          { error: "La cédula o documento de identidad válido es requerido (mínimo 5 dígitos)" },
          { status: 400 },
        );
      }

      const rawPhone = (phone || "").trim();
      const normalizedPhone = normalizeChannelPhone(rawPhone);
      if (!normalizedPhone || normalizedPhone.length < 7) {
        return NextResponse.json(
          { error: "Un número de teléfono válido es requerido para el registro" },
          { status: 400 },
        );
      }

      // Resolver la organización para el registro
      let targetOrgId: string | null = null;
      let targetOrgData: { id: string; name: string; slug: string; status: string } | null = null;

      if (organization_slug) {
        const { data: orgBySlug, error: orgErr } = await supabase
          .from("organizations")
          .select("id, name, slug, status")
          .eq("slug", organization_slug)
          .eq("status", "active")
          .maybeSingle();

        if (orgErr) throw orgErr;
        if (!orgBySlug) {
          return NextResponse.json(
            { error: "Organización no encontrada o inactiva" },
            { status: 404 },
          );
        }
        targetOrgId = orgBySlug.id;
        targetOrgData = orgBySlug;
      } else {
        // Tomar la primera organización activa disponible
        const { data: defaultOrg, error: defOrgErr } = await supabase
          .from("organizations")
          .select("id, name, slug, status")
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (defOrgErr) throw defOrgErr;
        if (!defaultOrg) {
          return NextResponse.json(
            { error: "No hay ninguna organización activa disponible en el sistema" },
            { status: 404 },
          );
        }
        targetOrgId = defaultOrg.id;
        targetOrgData = defaultOrg;
      }

      // Comprobar si ya existe por cédula o teléfono
      const { data: existingClients, error: searchError } = await supabase
        .from("clients")
        .select("*")
        .or(`cedula.eq.${cleanCedula},phone.eq.${normalizedPhone}`);

      if (searchError) throw searchError;

      let client = existingClients?.[0] || null;

      if (client) {
        if (client.app_enabled === false) {
          return NextResponse.json(
            { error: "El acceso a la app móvil está deshabilitado para esta cuenta. Contacte a soporte." },
            { status: 403 },
          );
        }

        if (!client.cedula) {
          await supabase
            .from("clients")
            .update({ cedula: cleanCedula })
            .eq("id", client.id);
          client.cedula = cleanCedula;
        }

        // Si el cliente ya pertenecía a otra organización, usar los datos de esa organización
        if (client.organization_id !== targetOrgId) {
          const { data: clientOrg } = await supabase
            .from("organizations")
            .select("id, name, slug, status")
            .eq("id", client.organization_id)
            .maybeSingle();
          if (clientOrg) {
            targetOrgData = clientOrg;
            targetOrgId = clientOrg.id;
          }
        }
      } else {
        const { count } = await supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", targetOrgId);

        const color = CRM_COLORS[(count || 0) % CRM_COLORS.length];
        const initials = getClientInitials(cleanName);

        const { data: created, error: createError } = await supabase
          .from("clients")
          .insert({
            organization_id: targetOrgId,
            name: cleanName,
            phone: normalizedPhone,
            cedula: cleanCedula,
            app_enabled: true,
            account: "Prospecto",
            color: color.color,
            bg: color.bg,
            initials,
          })
          .select("*")
          .single();

        if (createError) throw createError;
        client = created;
      }

      if (!targetOrgId || !targetOrgData) {
        return NextResponse.json(
          { error: "No se pudo determinar la organización activa para el registro" },
          { status: 400 },
        );
      }

      const generatedPassword = generateClientAppPassword(client.cedula || cleanCedula, client.name);
      const conversation = await findOrCreateOpenConversation(
        supabase,
        targetOrgId,
        Number(client.id),
        client.phone || normalizedPhone,
      );

      const token = await createAppSessionToken({
        clientId: Number(client.id),
        organizationId: targetOrgId,
        phone: client.phone || normalizedPhone,
      });

      return NextResponse.json({
        token,
        organization: {
          id: targetOrgData.id,
          name: targetOrgData.name,
          slug: targetOrgData.slug,
        },
        client: {
          id: client.id,
          name: client.name,
          phone: client.phone,
          cedula: client.cedula,
          app_enabled: client.app_enabled,
        },
        conversation: {
          id: conversation.id,
          status: conversation.status,
          human_mode: conversation.human_mode,
        },
        generated_password: generatedPassword,
        message: "Usuario registrado exitosamente desde la app",
      });
    }

    // ========================================================================
    // FLUJO: INICIO DE SESIÓN DESDE LA APP (SOLO CÉDULA Y CLAVE)
    // ========================================================================
    const rawCedula = (cedula || identifier || "").trim();
    if (!rawCedula) {
      return NextResponse.json(
        { error: "Debe ingresar su cédula para iniciar sesión" },
        { status: 400 },
      );
    }

    const cleanPassword = (password || "").trim();
    if (!cleanPassword) {
      return NextResponse.json(
        { error: "Debe ingresar su contraseña para iniciar sesión" },
        { status: 400 },
      );
    }

    const cleanCedula = extractCedulaDigits(rawCedula);
    if (!cleanCedula || cleanCedula.length < 5) {
      return NextResponse.json(
        { error: "El formato de la cédula es inválido (mínimo 5 dígitos)" },
        { status: 400 },
      );
    }

    // Buscar exclusivamente por cédula (sin necesidad de slug de organización)
    let clientQuery = supabase
      .from("clients")
      .select("*")
      .or(`cedula.eq.${cleanCedula},cedula.eq.V-${cleanCedula},cedula.eq.V${cleanCedula},cedula.eq.E-${cleanCedula},cedula.eq.E${cleanCedula}`);

    if (organization_slug) {
      const { data: orgBySlug } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", organization_slug)
        .maybeSingle();

      if (orgBySlug) {
        clientQuery = clientQuery.eq("organization_id", orgBySlug.id);
      }
    }

    const { data: matchedClients, error: clientError } = await clientQuery.limit(2);
    if (clientError) throw clientError;

    const client = matchedClients?.[0];
    if (!client) {
      return NextResponse.json(
        { error: "No se encontró ningún cliente registrado con esta cédula" },
        { status: 404 },
      );
    }

    // Localizar automáticamente la organización del cliente
    const { data: organization, error: orgError } = await supabase
      .from("organizations")
      .select("id, name, slug, status")
      .eq("id", client.organization_id)
      .maybeSingle();

    if (orgError) throw orgError;
    if (!organization || organization.status !== "active") {
      return NextResponse.json(
        { error: "La organización asociada a su cuenta no se encuentra activa o disponible" },
        { status: 403 },
      );
    }

    if (client.app_enabled === false) {
      return NextResponse.json(
        { error: "El acceso a la app móvil está deshabilitado para esta cuenta. Contacte a soporte." },
        { status: 403 },
      );
    }

    // Verificación estricta de la clave (cédula + iniciales en mayúsculas)
    const isPasswordValid = verifyClientAppPassword(
      cleanPassword,
      client.cedula || cleanCedula,
      client.name,
    );

    if (!isPasswordValid) {
      return NextResponse.json(
        {
          error:
            "Contraseña incorrecta. Recuerde que su contraseña corresponde a los números de su cédula seguidos de sus iniciales en mayúsculas (ejemplo: 28123456CP).",
        },
        { status: 401 },
      );
    }

    const clientPhone = client.phone || "580000000000";
    const conversation = await findOrCreateOpenConversation(
      supabase,
      organization.id,
      Number(client.id),
      clientPhone,
    );

    const token = await createAppSessionToken({
      clientId: Number(client.id),
      organizationId: String(organization.id),
      phone: clientPhone,
    });

    return NextResponse.json({
      token,
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      client: {
        id: client.id,
        name: client.name,
        phone: client.phone,
        cedula: client.cedula,
        app_enabled: client.app_enabled,
      },
      conversation: {
        id: conversation.id,
        status: conversation.status,
        human_mode: conversation.human_mode,
      },
    });
  } catch (error) {
    const status = (error as { status?: number }).status || 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No se pudo procesar la sesión de la app",
      },
      { status },
    );
  }
};
