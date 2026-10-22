import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { insertClientRow, normalizeClientPhone } from "@/app/crm/_lib/client-identity";
import { findOrCreateOpenConversation } from "@/app/api/crm/_lib/channel-messages";
import { assertAppChannelSecret, createAppSessionToken } from "../_lib/app-session";
import {
  extractCedulaDigits,
  generateClientAppPassword,
  verifyClientAppPassword,
} from "@/lib/client-auth-utils";
import {
  APP_ERROR_CODES,
  AppApiError,
  parseAppJsonBody,
  parseAppSchema,
  toAppErrorResponse,
} from "../_lib/app-errors";
import { buildAppRealtimePayload } from "../_lib/realtime-payload";
import { toSessionClientDto } from "../_lib/app-client-dtos";
import type { AppClientRow } from "../_lib/load-app-client";

const sessionRequestSchema = z.object({
  action: z
    .enum(["login", "register"], {
      errorMap: () => ({ message: "La acción debe ser login o register" }),
    })
    .default("login"),
  organization_slug: z
    .string()
    .trim()
    .max(80, "El identificador de la organización es demasiado largo")
    .optional(),
  cedula: z.string().trim().max(40, "La cédula es demasiado larga").optional(),
  identifier: z.string().trim().max(80, "El identificador es demasiado largo").optional(),
  password: z.string().trim().max(80, "La contraseña es demasiado larga").optional(),
  name: z.string().trim().max(120, "El nombre es demasiado largo").optional(),
  phone: z.string().trim().max(40, "El teléfono es demasiado largo").optional(),
});

export const POST = async (request: NextRequest) => {
  try {
    assertAppChannelSecret(request);
    const {
      action,
      organization_slug,
      cedula,
      identifier,
      password,
      name,
      phone,
    } = parseAppSchema(
      sessionRequestSchema,
      await parseAppJsonBody(request),
      "Revisa los datos e intenta de nuevo.",
    );

    const supabase = getSupabaseAdmin();

    // ========================================================================
    // FLUJO: REGISTRO DE CLIENTE DESDE LA APP
    // ========================================================================
    if (action === "register") {
      const cleanName = (name || "").trim();
      if (!cleanName || cleanName.length < 2) {
        throw new AppApiError(
          APP_ERROR_CODES.NAME_REQUIRED,
          "El nombre completo es requerido para registrar el cliente",
          400,
        );
      }

      const cleanCedula = extractCedulaDigits(cedula || identifier);
      if (!cleanCedula || cleanCedula.length < 5) {
        throw new AppApiError(
          APP_ERROR_CODES.CEDULA_INVALID,
          "La cédula o documento de identidad válido es requerido (mínimo 5 dígitos)",
          400,
        );
      }

      const rawPhone = (phone || "").trim();
      const normalizedPhone = normalizeClientPhone(rawPhone);
      if (!normalizedPhone || normalizedPhone.length < 7) {
        throw new AppApiError(
          APP_ERROR_CODES.PHONE_REQUIRED,
          "Un número de teléfono válido es requerido para el registro",
          400,
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
          throw new AppApiError(
            APP_ERROR_CODES.ORGANIZATION_NOT_FOUND,
            "No encontramos la organización. Verifica los datos o contacta a soporte.",
            404,
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
          throw new AppApiError(
            APP_ERROR_CODES.ORGANIZATION_NOT_FOUND,
            "El servicio no está disponible en este momento. Intenta más tarde.",
            404,
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
          throw new AppApiError(
            APP_ERROR_CODES.APP_DISABLED,
            "El acceso a la app está deshabilitado para esta cuenta. Contacte a soporte.",
            403,
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
        if (!targetOrgId || !targetOrgData) {
          throw new AppApiError(
            APP_ERROR_CODES.ORGANIZATION_NOT_FOUND,
            "No se pudo completar el registro. Intenta de nuevo.",
            400,
          );
        }

        client = await insertClientRow(supabase, {
          organizationId: targetOrgId,
          name: cleanName,
          phone: normalizedPhone,
          cedula: cleanCedula,
          appEnabled: true,
          account: "Prospecto",
          plan: null,
          zone: null,
        });
      }

      if (!targetOrgId || !targetOrgData) {
        throw new AppApiError(
          APP_ERROR_CODES.ORGANIZATION_NOT_FOUND,
          "No se pudo completar el registro. Intenta de nuevo.",
          400,
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
      const realtime = await buildAppRealtimePayload({
        clientId: Number(client.id),
        organizationId: targetOrgId,
        conversationId: Number(conversation.id),
      });

      return NextResponse.json({
        token,
        organization: {
          id: targetOrgData.id,
          name: targetOrgData.name,
          slug: targetOrgData.slug,
        },
        client: toSessionClientDto(client as AppClientRow),
        conversation: {
          id: conversation.id,
          status: conversation.status,
          human_mode: conversation.human_mode,
        },
        realtime,
        generated_password: generatedPassword,
        message: "Usuario registrado exitosamente desde la app",
      });
    }

    // ========================================================================
    // FLUJO: INICIO DE SESIÓN DESDE LA APP (SOLO CÉDULA Y CLAVE)
    // ========================================================================
    const rawCedula = (cedula || identifier || "").trim();
    if (!rawCedula) {
      throw new AppApiError(
        APP_ERROR_CODES.CEDULA_REQUIRED,
        "Ingresa tu cédula para iniciar sesión",
        400,
      );
    }

    const cleanPassword = (password || "").trim();
    if (!cleanPassword) {
      throw new AppApiError(
        APP_ERROR_CODES.PASSWORD_REQUIRED,
        "Ingresa tu contraseña para iniciar sesión",
        400,
      );
    }

    const cleanCedula = extractCedulaDigits(rawCedula);
    if (!cleanCedula || cleanCedula.length < 5) {
      throw new AppApiError(
        APP_ERROR_CODES.CEDULA_INVALID,
        "El formato de la cédula no es válido. Usa al menos 5 dígitos.",
        400,
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
      throw new AppApiError(
        APP_ERROR_CODES.CLIENT_NOT_FOUND,
        "No encontramos un cliente con esta cédula. Verifica el número o contacta a soporte.",
        404,
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
      throw new AppApiError(
        APP_ERROR_CODES.ORGANIZATION_INACTIVE,
        "Tu proveedor no está disponible en este momento. Contacte a soporte.",
        403,
      );
    }

    if (client.app_enabled === false) {
      throw new AppApiError(
        APP_ERROR_CODES.APP_DISABLED,
        "El acceso a la app está deshabilitado para esta cuenta. Contacte a soporte.",
        403,
      );
    }

    // Verificación estricta de la clave (cédula + iniciales en mayúsculas)
    const isPasswordValid = verifyClientAppPassword(
      cleanPassword,
      client.cedula || cleanCedula,
      client.name,
    );

    if (!isPasswordValid) {
      throw new AppApiError(
        APP_ERROR_CODES.WRONG_PASSWORD,
        "Contraseña incorrecta. Es tu cédula seguida de tus iniciales en mayúsculas (ejemplo: 28123456CP).",
        401,
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
    const realtime = await buildAppRealtimePayload({
      clientId: Number(client.id),
      organizationId: String(organization.id),
      conversationId: Number(conversation.id),
    });

    return NextResponse.json({
      token,
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      client: toSessionClientDto(client as AppClientRow),
      conversation: {
        id: conversation.id,
        status: conversation.status,
        human_mode: conversation.human_mode,
      },
      realtime,
    });
  } catch (error) {
    return toAppErrorResponse(error, {
      code: APP_ERROR_CODES.SESSION_FAILED,
      error: "No se pudo iniciar sesión. Intenta de nuevo.",
    });
  }
};
