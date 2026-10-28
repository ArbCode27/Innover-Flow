import { NextRequest, NextResponse } from "next/server";
import { getCrmAuthContext } from "@/app/api/crm/_lib/crm-auth-context";
import { getOnuBySN } from "@/lib/smartolt";

export async function GET(req: NextRequest) {
  try {
    await getCrmAuthContext(req);

    const sn = req.nextUrl.searchParams.get("sn");
    const cleanSn = sn?.trim().toUpperCase();

    if (!cleanSn) {
      return NextResponse.json(
        { error: "Debes ingresar un número de serie (SN) válido." },
        { status: 400 },
      );
    }

    const onu = await getOnuBySN(cleanSn);

    if (!onu) {
      return NextResponse.json(
        {
          success: false,
          onu: null,
          message: `No se encontró ninguna ONU con el SN ${cleanSn} en SmartOLT.`,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      onu,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno";
    const status = message.toLowerCase().includes("no autorizado") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
