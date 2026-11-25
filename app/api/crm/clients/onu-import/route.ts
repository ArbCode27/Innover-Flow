import { NextRequest, NextResponse } from "next/server";
import { parseOnuWorkbook } from "@/app/api/crm/_lib/onu-workbook";
import { resolveOnuImportClient } from "@/app/crm/_lib/onu-import";
import { getOnuBySN, getSmartOltConfig, parseSignalValue } from "@/lib/smartolt";
import {
  CrmAuthError,
  getCrmAuthContext,
} from "../../_lib/crm-auth-context";
import { getSupabaseAdmin } from "../../_lib/supabase-admin";

const MAX_SERIALS = 200;

type OnuRow = {
  id: number;
  client_id: number | null;
  sn: string | null;
  onu_external_id: string | null;
};

const runPool = async <T>(
  items: T[],
  size: number,
  worker: (item: T) => Promise<void>,
) => {
  let index = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      if (current) await worker(current);
    }
  });
  await Promise.all(runners);
};

export const POST = async (request: NextRequest) => {
  try {
    const context = await getCrmAuthContext(request);
    const smartOlt = await getSmartOltConfig({
      organizationId: context.organizationId,
    });
    if (!smartOlt) {
      return NextResponse.json(
        { ok: false, error: "SmartOLT no está conectado en esta sucursal" },
        { status: 409 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Adjunta la plantilla de Excel" },
        { status: 400 },
      );
    }
    if (file.size > 2_000_000) {
      return NextResponse.json(
        { ok: false, error: "El archivo supera 2 MB" },
        { status: 400 },
      );
    }

    const parsed = await parseOnuWorkbook(await file.arrayBuffer());
    if (parsed.error) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }
    if (parsed.rows.length > MAX_SERIALS) {
      return NextResponse.json(
        {
          ok: false,
          error: `Hay ${parsed.rows.length} seriales. Importa hasta ${MAX_SERIALS} por archivo.`,
        },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const [clientsResult, onusResult] = await Promise.all([
      supabase
        .from("clients")
        .select("id, name, cedula")
        .eq("organization_id", context.organizationId),
      supabase
        .from("client_onus")
        .select("id, client_id, sn, onu_external_id")
        .eq("organization_id", context.organizationId),
    ]);
    if (clientsResult.error) throw clientsResult.error;
    if (onusResult.error) throw onusResult.error;

    const clients = (clientsResult.data || []).map((client) => ({
      id: Number(client.id),
      name: String(client.name || ""),
      cedula: client.cedula ? String(client.cedula) : null,
    }));
    const onus = (onusResult.data || []) as OnuRow[];

    let linked = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ row: number; name: string; message: string }> = [];

    await runPool(parsed.rows, 5, async (row) => {
      const target = resolveOnuImportClient(row, clients);
      if (!target.client) {
        errors.push({
          row: row.row,
          name: row.name,
          message: target.error || "No se encontró el cliente",
        });
        return;
      }

      const owned = onus.find((item) => Number(item.client_id) === target.client!.id);
      if (
        owned?.sn &&
        owned.sn.trim().toUpperCase() !== row.serial
      ) {
        errors.push({
          row: row.row,
          name: target.client.name,
          message: "Este cliente ya tiene un equipo vinculado.",
        });
        return;
      }

      const onu = await getOnuBySN(row.serial, {
        organizationId: context.organizationId,
      });
      if (!onu?.unique_external_id) {
        errors.push({
          row: row.row,
          name: target.client.name,
          message: "SmartOLT no encontró ese serial.",
        });
        return;
      }

      const taken = onus.find(
        (item) =>
          item.onu_external_id === onu.unique_external_id &&
          Number(item.client_id) !== target.client!.id,
      );
      if (taken) {
        errors.push({
          row: row.row,
          name: target.client.name,
          message: "Ese serial ya está vinculado a otro cliente.",
        });
        return;
      }

      const payload = {
        organization_id: context.organizationId,
        client_id: target.client.id,
        onu_external_id: onu.unique_external_id,
        sn: (onu.sn || row.serial).trim().toUpperCase(),
        board: onu.board ?? null,
        port: onu.port ?? null,
        rx_signal: parseSignalValue(onu.signal),
        status: onu.status || null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("client_onus")
        .upsert(payload, { onConflict: "organization_id,onu_external_id" })
        .select("id, client_id, sn, onu_external_id")
        .single<OnuRow>();
      if (error || !data) {
        errors.push({
          row: row.row,
          name: target.client.name,
          message: "No se pudo guardar el equipo.",
        });
        return;
      }

      const previous = onus.findIndex(
        (item) => item.onu_external_id === data.onu_external_id,
      );
      if (previous >= 0) {
        onus[previous] = data;
        updated += 1;
      } else {
        onus.push(data);
        linked += 1;
      }
    });

    skipped = parsed.rows.length - linked - updated - errors.length;
    errors.sort((a, b) => a.row - b.row);

    return NextResponse.json({
      ok: true,
      linked,
      updated,
      skipped: Math.max(skipped, 0),
      errors,
    });
  } catch (error) {
    if (error instanceof CrmAuthError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }
    const message =
      error instanceof Error ? error.message : "No se pudo importar la plantilla";
    console.error("[ONU_IMPORT]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
