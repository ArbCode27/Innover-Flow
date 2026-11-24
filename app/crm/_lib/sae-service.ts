import type {
  SaeAbonadoListItem,
  SaeAbonadoDetalle,
  SaeAbonadoSaldo,
  SaeServicioItem,
  SaeMovimientoEstadoCuenta,
} from "@/app/api/crm/_lib/sae-api";

export interface SaeAbonadoFull {
  abonado: SaeAbonadoDetalle | null;
  saldo: SaeAbonadoSaldo | null;
  servicios: SaeServicioItem[];
  estado_cuenta: SaeMovimientoEstadoCuenta[] | null;
}

export const saeService = {
  async search(input: {
    cedula?: string;
    nombre?: string;
    nroContrato?: string;
    nroCuentaPago?: string;
  }): Promise<SaeAbonadoListItem[]> {
    const response = await fetch("/api/crm/sae/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "No se pudo consultar la ficha");
    }

    return (payload.data as SaeAbonadoListItem[]) || [];
  },

  async getAbonado(
    abonadoId: string,
    options?: { includeEstadoCuenta?: boolean },
  ): Promise<SaeAbonadoFull> {
    const query = options?.includeEstadoCuenta ? "?include_estado_cuenta=true" : "";
    const response = await fetch(
      `/api/crm/sae/abonados/${encodeURIComponent(abonadoId)}${query}`,
      { cache: "no-store" },
    );

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "No se pudo obtener información del abonado");
    }

    return {
      abonado: payload.abonado || null,
      saldo: payload.saldo || null,
      servicios: payload.servicios || [],
      estado_cuenta: payload.estado_cuenta || null,
    };
  },

  async reportPayment(payload: {
    id_contrato: string;
    id_cuba: string;
    monto: number;
    referencia: string;
    fecha: string;
    observacion?: string | null;
    cambio?: string | null;
    telefono?: string | null;
    modo?: "reportes" | "conciliados";
  }): Promise<{ resultado: string; info?: string | null }> {
    const response = await fetch("/api/crm/sae/pagos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || "No se pudo reportar el pago");
    }

    return body.data;
  },
};
