"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { mapFieldTicketRow, type FieldTicket, type Technician } from "@/lib/field-tickets";
import type { TicketCategory } from "@/lib/ticket-categories";
import { ensureCrmRealtimeAuth, getSupabaseClient } from "../_lib/supabase";

export type CreatePayload = {
  title: string;
  description?: string | null;
  cause?: string | null;
  categoryId?: string | null;
  priority: FieldTicket["priority"];
  kind?: FieldTicket["kind"];
  employeeId?: string | null;
  mapsUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  addressText?: string | null;
  facadeMediaUrl?: string | null;
  facadeMessageId?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  conversationId?: number | null;
  crmClientId?: number | null;
  clientName?: string | null;
  clientPhone?: string | null;
};

const parseError = async (response: Response) => {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  };
  const error = new Error(payload.error || "No se pudo completar");
  (error as Error & { code?: string }).code = payload.code;
  return error;
};

export const useFieldTickets = (enabled: boolean, organizationId?: string) => {
  const [tickets, setTickets] = useState<FieldTicket[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    try {
      const [ticketsRes, techniciansRes, categoriesRes] = await Promise.all([
        fetch("/api/crm/field-tickets"),
        fetch("/api/crm/technicians"),
        fetch("/api/crm/ticket-categories"),
      ]);
      if (!ticketsRes.ok) throw await parseError(ticketsRes);
      const ticketsPayload = (await ticketsRes.json()) as { data: FieldTicket[] };
      setTickets(ticketsPayload.data || []);
      if (techniciansRes.ok) {
        const techPayload = (await techniciansRes.json()) as { data: Technician[] };
        setTechnicians(techPayload.data || []);
      }
      if (categoriesRes.ok) {
        const categoriesPayload = (await categoriesRes.json()) as {
          data: TicketCategory[];
        };
        setCategories(categoriesPayload.data || []);
      }
      setError(null);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "No se pudieron cargar los tickets";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !organizationId) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const start = async () => {
      await ensureCrmRealtimeAuth();
      if (cancelled) return;
      const supabase = getSupabaseClient();
      const channel = supabase
        .channel(`realtime:field_tickets:${organizationId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "field_tickets",
            filter: `organization_id=eq.${organizationId}`,
          },
          (payload) => {
            const event = payload.eventType;
            if (event === "DELETE") {
              const deletedId = String((payload.old as { id?: string })?.id || "");
              if (!deletedId) return;
              setTickets((current) => current.filter((ticket) => ticket.id !== deletedId));
              return;
            }
            const mapped = mapFieldTicketRow(
              (payload.new || {}) as Record<string, unknown>,
            );
            if (!mapped.id) return;
            setTickets((current) => {
              const exists = current.some((ticket) => ticket.id === mapped.id);
              if (!exists) return [mapped, ...current];
              return current.map((ticket) =>
                ticket.id === mapped.id ? { ...ticket, ...mapped } : ticket,
              );
            });
          },
        )
        .subscribe();

      unsubscribe = () => {
        void supabase.removeChannel(channel);
      };
    };

    void start();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [enabled, organizationId]);

  const getTicket = useCallback(async (id: string) => {
    const response = await fetch(`/api/crm/field-tickets/${id}`);
    if (!response.ok) throw await parseError(response);
    const payload = (await response.json()) as { data: FieldTicket };
    return payload.data;
  }, []);

  const createTicket = useCallback(async (input: CreatePayload) => {
    const response = await fetch("/api/crm/field-tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw await parseError(response);
    const payload = (await response.json()) as { data: FieldTicket };
    setTickets((current) => [payload.data, ...current]);
    toast.success(`Ticket #${payload.data.publicId} creado`);
    return payload.data;
  }, []);

  const updateTicket = useCallback(async (id: string, input: Record<string, unknown>) => {
    const response = await fetch(`/api/crm/field-tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", ...input }),
    });
    if (!response.ok) throw await parseError(response);
    const payload = (await response.json()) as { data: FieldTicket };
    setTickets((current) =>
      current.map((ticket) => (ticket.id === id ? payload.data : ticket)),
    );
    toast.success(`Ticket #${payload.data.publicId} actualizado`);
    return payload.data;
  }, []);

  const reassignTicket = useCallback(async (id: string, employeeId: string | null) => {
    const response = await fetch(`/api/crm/field-tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reassign", employeeId }),
    });
    if (!response.ok) throw await parseError(response);
    const payload = (await response.json()) as { data: FieldTicket };
    setTickets((current) =>
      current.map((ticket) => (ticket.id === id ? payload.data : ticket)),
    );
    toast.success(`Ticket #${payload.data.publicId} reasignado`);
    return payload.data;
  }, []);

  const finalizeTicket = useCallback(async (id: string, observation: string) => {
    const response = await fetch(`/api/crm/field-tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "finalize", observation, source: "crm" }),
    });
    if (!response.ok) throw await parseError(response);
    const payload = (await response.json()) as { data: FieldTicket };
    setTickets((current) =>
      current.map((ticket) => (ticket.id === id ? payload.data : ticket)),
    );
    toast.success(`Ticket #${payload.data.publicId} cerrado`);
    return payload.data;
  }, []);

  const deleteTicket = useCallback(async (id: string) => {
    const response = await fetch(`/api/crm/field-tickets/${id}`, { method: "DELETE" });
    if (!response.ok) throw await parseError(response);
    setTickets((current) => current.filter((ticket) => ticket.id !== id));
    toast.success("Ticket eliminado");
  }, []);

  const bulkReassign = useCallback(async (ids: string[], employeeId: string | null) => {
    const response = await fetch("/api/crm/field-tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reassign", ids, employeeId }),
    });
    if (!response.ok) throw await parseError(response);
    await refresh();
    toast.success("Tickets reasignados");
  }, [refresh]);

  const bulkDelete = useCallback(async (ids: string[]) => {
    const response = await fetch("/api/crm/field-tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", ids }),
    });
    if (!response.ok) throw await parseError(response);
    setTickets((current) => current.filter((ticket) => !ids.includes(ticket.id)));
    toast.success("Tickets eliminados");
  }, []);

  const uploadFacade = useCallback(async (file: File) => {
    const form = new FormData();
    form.append("image", file);
    const response = await fetch("/api/crm/field-tickets/media", {
      method: "POST",
      body: form,
    });
    if (!response.ok) throw await parseError(response);
    const payload = (await response.json()) as { data: { url: string } };
    return payload.data.url;
  }, []);

  return {
    tickets,
    technicians,
    categories,
    isLoading,
    error,
    refresh,
    getTicket,
    createTicket,
    updateTicket,
    reassignTicket,
    finalizeTicket,
    deleteTicket,
    bulkReassign,
    bulkDelete,
    uploadFacade,
  };
};
