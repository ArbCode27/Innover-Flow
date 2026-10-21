import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCrmAuthContext } from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";
import { createFieldTicket } from "@/app/api/crm/_lib/field-tickets";
import { localWisproOrderId } from "@/lib/wispro-rules";

const casoSchema = z.object({
  existing_ticket_id: z.string().optional(),
  existing_ticket_public_id: z.number().optional(),
  existing_order_id: z.string().optional(),
  ticket: z.object({
    title: z.string().min(1, "El título es obligatorio").max(80),
    description: z.string().min(1, "La descripción es obligatoria"),
    category_id: z.string().uuid().optional(),
    category_name: z.string().optional(),
    client_id: z.string().optional(),
    contract_id: z.string().optional(),
    assignable_id: z.string().optional(),
    crm_client_id: z.number().optional(),
    agent_name: z.string().optional(),
  }),
  generate_order: z.boolean().default(true),
  order: z
    .object({
      kind: z
        .enum(["technical", "installation", "resignation", "feasibility"])
        .default("technical"),
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

/**
 * New tickets are LOCAL (field_tickets). This route never POSTs to Wispro help_desk/orders.
 */
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

    const context = await getCrmAuthContext(req);
    const {
      existing_ticket_id,
      existing_ticket_public_id,
      existing_order_id,
      ticket: ticketData,
      generate_order,
      order: orderData,
      technician,
    } = parsed.data;

    const gps = orderData?.gps_point_attributes;
    const addressText = gps
      ? [gps.street, gps.number, gps.city, gps.state].filter(Boolean).join(" ")
      : null;

    const created = await createFieldTicket(
      getSupabaseAdmin(),
      context.organizationId,
      {
        title: ticketData.title,
        description: orderData?.description || ticketData.description,
        cause: ticketData.category_name || null,
        categoryId: ticketData.category_id || null,
        priority: "medium",
        kind: orderData?.kind || "technical",
        employeeId: technician?.employee_id || ticketData.assignable_id || null,
        mapsUrl: null,
        windowStart: technician?.start_at || orderData?.start_at || null,
        windowEnd: technician?.end_at || orderData?.end_at || null,
        startAt: null,
        endAt: null,
        latitude: gps?.latitude ?? null,
        longitude: gps?.longitude ?? null,
        addressText,
        facadeMediaUrl: null,
        facadeMessageId: null,
        conversationId: null,
        crmClientId: ticketData.crm_client_id ?? null,
        clientName: null,
        clientPhone: null,
      },
    );

    const issueId = existing_ticket_id || created.wisproIssueId || created.issueId;
    const publicId = existing_ticket_public_id || created.publicId;
    const orderId =
      existing_order_id || created.wisproOrderId || localWisproOrderId(created.id);

    const result: ResultadoCaso = {
      ticket: { ok: true, id: issueId, publicId },
      orden: generate_order ? { ok: true, id: orderId } : { ok: null },
      tecnico: technician?.employee_id ? { ok: true } : { ok: null },
    };

    return NextResponse.json(result, { status: 200 });
  } catch (globalError) {
    console.error("[API_CASOS_LOCAL_ERROR]", globalError);
    return NextResponse.json(
      {
        error:
          globalError instanceof Error
            ? globalError.message
            : "Error interno al crear el caso local",
      },
      { status: 500 },
    );
  }
}
