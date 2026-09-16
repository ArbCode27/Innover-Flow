import type {
  Client,
  WisproInvoicingSummary,
  WisproSearchResult,
} from "./types";

interface WisproApiPayload {
  data?: WisproSearchResult[];
  client?: Client;
  error?: string;
  linkId?: string;
}

const parseApiError = (payload: WisproApiPayload, fallback: string) => {
  throw new Error(payload.error || fallback);
};

export const wisproService = {
  async searchByCedula(cedula: string): Promise<WisproSearchResult[]> {
    const response = await fetch("/api/crm/wispro/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cedula }),
    });

    const payload = (await response.json()) as WisproApiPayload;

    if (!response.ok) {
      parseApiError(payload, "Error al consultar Wispro");
    }

    return payload.data || [];
  },

  async associateToConversation(input: {
    conversationId: number;
    customer: WisproSearchResult["customer"];
    invoicing: WisproInvoicingSummary;
    existingClientId?: number | null;
    conversationPhone?: string | null;
    whatsappId?: string | null;
    waName?: string | null;
    linkId?: string | null;
  }): Promise<Client> {
    const response = await fetch("/api/crm/wispro/associate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    const payload = (await response.json()) as WisproApiPayload;

    if (!response.ok) {
      console.error("[WISPRO_ASSOCIATE] ui_api_error", {
        linkId: input.linkId || payload.linkId || null,
        status: response.status,
        error: payload.error || "No se pudo asociar el cliente",
      });
      parseApiError(payload, "No se pudo asociar el cliente");
    }

    if (!payload.client) {
      throw new Error("No se recibió el cliente asociado");
    }

    console.log("[WISPRO_ASSOCIATE] ui_api_ok", {
      linkId: input.linkId || payload.linkId || null,
      clientId: payload.client.id,
      wisproId: payload.client.wispro_id || null,
    });

    return payload.client;
  },

  async unlinkFromClient(clientId: number): Promise<Client> {
    const response = await fetch("/api/crm/wispro/unlink", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });

    const payload = (await response.json()) as WisproApiPayload;

    if (!response.ok) {
      parseApiError(payload, "No se pudo desvincular Wispro");
    }

    if (!payload.client) {
      throw new Error("No se recibió el cliente actualizado");
    }

    return payload.client;
  },

  async createPaymentPromise(input: {
    clientId?: number;
    conversationId?: number;
    hours?: number;
  }): Promise<{
    validUntil: string;
    contractId: string;
    promiseId: string;
  }> {
    const response = await fetch("/api/crm/wispro/payment-promise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: input.clientId,
        conversationId: input.conversationId,
        hours: input.hours ?? 48,
      }),
    });

    const payload = (await response.json()) as {
      ok?: boolean;
      error?: string;
      validUntil?: string;
      contractId?: string;
      promise?: { id?: string };
    };

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "No se pudo crear la promesa de pago");
    }

    if (!payload.validUntil || !payload.contractId || !payload.promise?.id) {
      throw new Error("Wispro no devolvió los datos de la promesa");
    }

    return {
      validUntil: payload.validUntil,
      contractId: payload.contractId,
      promiseId: payload.promise.id,
    };
  },
};
