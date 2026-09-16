import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { archiveAndDeleteConversation } from "@/app/crm/_lib/conversation-resolve";
import type { Ticket } from "@/app/crm/_lib/types";
import { getSupabaseAdmin } from "../../_lib/supabase-admin";
import { getCrmAuthContext } from "../../_lib/crm-auth-context";

const resolveSchema = z.object({
  conversationId: z.coerce.number().int().positive(),
  resolvedBy: z.coerce.number().int().positive(),
});

const resolveOpenTicketForClient = async (
  supabase: SupabaseClient,
  clientId: number | null,
  organizationId: string,
) => {
  if (!clientId) return;

  const { data } = await supabase
    .from("tickets")
    .select("*")
    .eq("client_id", clientId)
    .eq("organization_id", organizationId)
    .neq("status", "Resuelto")
    .limit(1)
    .maybeSingle<Ticket>();

  if (!data) return;

  const { error } = await supabase
    .from("tickets")
    .update({ status: "Resuelto" })
    .eq("id", data.id)
    .eq("organization_id", organizationId);

  if (error) {
    throw error;
  }
};

export async function POST(req: NextRequest) {
  try {
    const payload = resolveSchema.safeParse(await req.json());

    if (!payload.success) {
      return NextResponse.json(
        { error: payload.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    const { conversationId, resolvedBy } = payload.data;

    const context = await getCrmAuthContext(req);
    if (context.agentId !== resolvedBy) {
      return NextResponse.json(
        { error: "No puedes resolver en nombre de otro asesor" },
        { status: 403 },
      );
    }
    const supabase = getSupabaseAdmin();

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id, client_id, organization_id")
      .eq("id", conversationId)
      .eq("organization_id", context.organizationId)
      .maybeSingle<{
        id: number;
        client_id: number | null;
        organization_id: string;
      }>();

    if (conversationError) {
      console.error("Resolve conversation lookup:", conversationError);
      return NextResponse.json(
        { error: "No se pudo validar la conversación" },
        { status: 500 },
      );
    }

    if (!conversation) {
      return NextResponse.json(
        { error: "La conversación no existe" },
        { status: 404 },
      );
    }

    const historyId = await archiveAndDeleteConversation(
      supabase,
      conversationId,
      resolvedBy,
    );

    await resolveOpenTicketForClient(
      supabase,
      conversation.client_id,
      context.organizationId,
    );

    return NextResponse.json({ historyId });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Missing environment")) {
      console.error(error.message);
      return NextResponse.json(
        { error: "CRM no configurado en el servidor" },
        { status: 503 },
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "No se pudo archivar la conversación";

    console.error("Resolve conversation error:", error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
