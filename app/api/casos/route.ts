import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  asignarTecnico,
  createIssue,
  createOrder,
  WisproHttpError,
} from "@/lib/wispro";
import { getCrmAuthContext } from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { decryptIntegrationSecret } from "@/app/api/crm/_lib/integration-secrets";

const casoSchema = z.object({
  // Identificadores para reintento de pasos previos
  existing_ticket_id: z.string().optional(),
  existing_ticket_public_id: z.number().optional(),
  existing_order_id: z.string().optional(),

  // Datos del ticket
  ticket: z.object({
    title: z.string().min(1, "El título es obligatorio").max(80),
    description: z.string().min(1, "La descripción es obligatoria"),
    category_id: z.string().min(1, "La categoría es obligatoria"),
    category_name: z.string().optional(),
    client_id: z.string().optional(), // Wispro Client UUID
    contract_id: z.string().optional(), // Wispro Contract UUID
    assignable_id: z.string().optional(),
    crm_client_id: z.number().optional(),
    agent_name: z.string().optional(),
  }),

  // Control de generación de orden
  generate_order: z.boolean().default(true),

  // Datos de la orden
  order: z
    .object({
      kind: z.enum(["technical", "installation", "resignation", "feasibility"]).default("technical"),
      description: z.string().optional(),
      start_at: z.string().optional(),
      end_at: z.string().optional(),
      gps_point_attributes: z
        .object({
          street: z.string().optional(),
          number: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          country_code: z.string().default("VE"),
          latitude: z.number(),
          longitude: z.number(),
        })
        .optional(),
    })
    .optional(),

  // Asignación de técnico
  technician: z
    .object({
      employee_id: z.string().min(1),
      employee_name: z.string().optional(),
      start_at: z.string().min(1),
      end_at: z.string().min(1),
    })
    .optional(),
});

export type ResultadoCaso = {
  ticket: { ok: true; id: string; publicId: number } | { ok: false; error: string };
  orden: { ok: true; id: string } | { ok: false; error: string } | { ok: null };
  tecnico: { ok: true } | { ok: false; error: string } | { ok: null };
};

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = casoSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Payload de caso inválido" },
        { status: 400 },
      );
    }

    const {
      existing_ticket_id,
      existing_ticket_public_id,
      existing_order_id,
      ticket: ticketData,
      generate_order,
      order: orderData,
      technician,
    } = parsed.data;

    // Resolver contexto de CRM y credenciales
    let organizationId: string | null = null;
    let override: { apiKey?: string; baseUrl?: string } | undefined;
    let authAgentName = ticketData.agent_name || "Agente de Soporte";

    try {
      const context = await getCrmAuthContext(req);
      if (context?.organizationId) {
        organizationId = context.organizationId;
        const { data: integ } = await getSupabaseAdmin()
          .from("organization_integrations")
          .select("config, credentials_encrypted, status")
          .eq("organization_id", context.organizationId)
          .eq("provider", "wispro")
          .maybeSingle();

        if (integ?.status === "connected" && integ.credentials_encrypted) {
          const config = (integ.config || {}) as Record<string, unknown>;
          override = {
            apiKey: decryptIntegrationSecret(integ.credentials_encrypted),
            baseUrl: String(config.base_url || "https://www.cloud.wispro.co/api/v1"),
          };
        }
      }
    } catch {
      // Sesión opcional
    }

    const result: ResultadoCaso = {
      ticket: { ok: false, error: "No iniciado" },
      orden: { ok: null },
      tecnico: { ok: null },
    };

    let ticketId = existing_ticket_id || "";
    let ticketPublicId = existing_ticket_public_id || 0;

    // -------------------------------------------------------------------------
    // PASO 1: Crear ticket en Wispro (si no existe ya de un intento previo)
    // -------------------------------------------------------------------------
    if (existing_ticket_id && existing_ticket_public_id) {
      ticketId = existing_ticket_id;
      ticketPublicId = existing_ticket_public_id;
      result.ticket = {
        ok: true,
        id: ticketId,
        publicId: ticketPublicId,
      };
    } else {
      try {
        const createdIssue = await createIssue(
          {
            title: ticketData.title,
            description: ticketData.description,
            category_id: ticketData.category_id,
            client_id: ticketData.client_id,
            contract_id: ticketData.contract_id,
            assignable_id: ticketData.assignable_id,
          },
          override,
        );

        ticketId = createdIssue.id;
        ticketPublicId = createdIssue.publicId;

        result.ticket = {
          ok: true,
          id: ticketId,
          publicId: ticketPublicId,
        };

        // Guardar o sincronizar en la base de datos de nuestro CRM
        if (organizationId) {
          try {
            const supabase = getSupabaseAdmin();
            await supabase.from("tickets").upsert(
              {
                id: `TK-${ticketPublicId}`,
                organization_id: organizationId,
                client_id: ticketData.crm_client_id || null,
                type: ticketData.category_name || "Falla técnica",
                status: "Abierto",
                agent: authAgentName,
                description: `${ticketData.title}\n\n${ticketData.description}`,
              },
              { onConflict: "id" },
            );
          } catch (dbErr) {
            console.warn("[CASOS_CRM_DB_SYNC_WARN]", dbErr);
          }
        }
      } catch (err) {
        const errorMessage =
          err instanceof WisproHttpError
            ? `Error ${err.status}: ${err.rawBody || err.message}`
            : err instanceof Error
              ? err.message
              : "Fallo al crear ticket en Wispro";

        result.ticket = { ok: false, error: errorMessage };
        // Abortar si el paso 1 falla
        return NextResponse.json(result, { status: 207 });
      }
    }

    // -------------------------------------------------------------------------
    // PASO 2: Crear orden de trabajo (si está solicitada y el ticket existe)
    // -------------------------------------------------------------------------
    let orderId = existing_order_id || "";

    if (!generate_order) {
      result.orden = { ok: null };
    } else if (existing_order_id) {
      orderId = existing_order_id;
      result.orden = { ok: true, id: orderId };
    } else {
      try {
        const orderRes = await createOrder(
          {
            order: {
              state: "pending",
              kind: orderData?.kind || "technical",
              result: "not_set",
              description: orderData?.description || ticketData.description,
              ticketable_id: ticketId,
              ticketable_type: "HelpDesk",
              orderable_id: ticketData.contract_id,
              orderable_type: "Contract",
              start_at: orderData?.start_at,
              end_at: orderData?.end_at,
            },
            gps_point_attributes: orderData?.gps_point_attributes,
          },
          override,
        );

        orderId = orderRes.id;
        result.orden = { ok: true, id: orderId };
      } catch (err) {
        const errorMessage =
          err instanceof WisproHttpError
            ? `Error ${err.status}: ${err.rawBody || err.message}`
            : err instanceof Error
              ? err.message
              : "Fallo al crear orden técnica en Wispro";

        result.orden = { ok: false, error: errorMessage };
        // Si la orden falla, el ticket ya existe y se devuelve el estado parcial
        return NextResponse.json(result, { status: 207 });
      }
    }

    // -------------------------------------------------------------------------
    // PASO 3: Asignar técnico y agendar (si hay técnico y orden)
    // -------------------------------------------------------------------------
    if (!technician || !technician.employee_id || !orderId) {
      result.tecnico = { ok: null };
    } else {
      try {
        await asignarTecnico(
          orderId,
          technician.employee_id,
          technician.start_at,
          technician.end_at,
          override,
        );
        result.tecnico = { ok: true };
      } catch (err) {
        const errorMessage =
          err instanceof WisproHttpError
            ? `Error ${err.status}: ${err.rawBody || err.message}`
            : err instanceof Error
              ? err.message
              : "Fallo al agendar y asignar técnico en Wispro";

        result.tecnico = { ok: false, error: errorMessage };
        return NextResponse.json(result, { status: 207 });
      }
    }

    return NextResponse.json(result, { status: 200 });
  } catch (globalError) {
    console.error("[API_CASOS_FATAL_ERROR]", globalError);
    return NextResponse.json(
      {
        error:
          globalError instanceof Error
            ? globalError.message
            : "Error interno al orquestar el caso",
      },
      { status: 500 },
    );
  }
}
