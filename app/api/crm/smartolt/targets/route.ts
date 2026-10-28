import { NextRequest, NextResponse } from "next/server";
import { getCrmAuthContext } from "@/app/api/crm/_lib/crm-auth-context";
import { getSupabaseAdmin } from "@/app/api/crm/_lib/supabase-admin";

export interface BoardPortTarget {
  board: number;
  port: number;
  clientCount: number;
}

export async function GET(req: NextRequest) {
  try {
    const { organizationId } = await getCrmAuthContext(req);
    const supabase = getSupabaseAdmin();

    // 1️⃣ Obtener los IDs de clientes de la organización
    const { data: clients, error: clientErr } = await supabase
      .from("clients")
      .select("id")
      .eq("organization_id", organizationId);

    if (clientErr) {
      return NextResponse.json({ error: clientErr.message }, { status: 500 });
    }

    const clientIds = (clients || []).map((c) => c.id);
    if (!clientIds.length) {
      return NextResponse.json({ targets: [] });
    }

    // 2️⃣ Obtener las ONUs vinculadas con board y port válidos
    const { data: onus, error: onusErr } = await supabase
      .from("client_onus")
      .select("board, port, client_id")
      .in("client_id", clientIds)
      .not("board", "is", null)
      .not("port", "is", null);

    if (onusErr) {
      return NextResponse.json({ error: onusErr.message }, { status: 500 });
    }

    // 3️⃣ Agrupar por board y port contando clientes únicos
    const groups = new Map<string, { board: number; port: number; clientIds: Set<number> }>();

    for (const item of onus || []) {
      if (item.board == null || item.port == null) continue;
      const key = `${item.board}:${item.port}`;
      const group = groups.get(key) || {
        board: Number(item.board),
        port: Number(item.port),
        clientIds: new Set<number>(),
      };
      if (item.client_id) {
        group.clientIds.add(Number(item.client_id));
      }
      groups.set(key, group);
    }

    const targets: BoardPortTarget[] = Array.from(groups.values())
      .map((g) => ({
        board: g.board,
        port: g.port,
        clientCount: g.clientIds.size,
      }))
      .sort((a, b) => a.board - b.board || a.port - b.port);

    return NextResponse.json({ targets });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    const status = message.toLowerCase().includes("no autorizado") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
