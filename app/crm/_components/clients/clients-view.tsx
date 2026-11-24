"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { CrmButton } from "../shared/crm-button";
import type { Client, CreateClientInput, Ticket, UpdateClientInput } from "../../_lib/types";
import { ClientDetailDialog } from "./client-detail-dialog";
import { ClientEditDialog } from "./client-edit-dialog";
import { ClientFormDialog } from "./client-form-dialog";
import { ClientsStats } from "./clients-stats";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { ClientsTable } from "./clients-table";

interface ClientsViewProps {
  clients: Client[];
  tickets: Ticket[];
  onCreateClient: (input: CreateClientInput) => Promise<void>;
  onUpdateClient: (input: UpdateClientInput) => Promise<void>;
  onDeleteClient: (clientId: number) => Promise<void>;
}

export const ClientsView = ({
  clients,
  tickets,
  onCreateClient,
  onUpdateClient,
  onDeleteClient,
}: ClientsViewProps) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const handleOpenEdit = (client: Client) => {
    setEditingClient(client);
  };

  const handleSaveEdit = async (input: UpdateClientInput) => {
    try {
      await onUpdateClient(input);
      setViewingClient((current) =>
        current?.id === input.id
          ? {
              ...current,
              name: input.name,
              phone: input.phone,
              cedula: input.cedula ?? null,
              plan: input.plan ?? null,
              zone: input.zone ?? null,
              account: input.account,
              app_enabled: input.app_enabled,
            }
          : current,
      );
      toast.success("Cliente actualizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el cliente");
      throw error;
    }
  };

  const handleDelete = async (client: Client) => {
    const confirmed = window.confirm(
      `¿Eliminar a ${client.name}? Se quitan sus tickets y el acceso a la app. Las conversaciones quedan sin cliente vinculado.`,
    );
    if (!confirmed) return;

    try {
      await onDeleteClient(client.id);
      if (viewingClient?.id === client.id) setViewingClient(null);
      if (editingClient?.id === client.id) setEditingClient(null);
      toast.success("Cliente eliminado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el cliente");
    }
  };

  const viewingFromList =
    viewingClient && clients.find((client) => client.id === viewingClient.id);

  return (
    <div className={`crm-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-6`}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={`text-xl font-semibold md:text-2xl ${CRM_SURFACES.textPrimary}`}>Clientes</h2>
          <p className={`text-sm ${CRM_SURFACES.textMuted}`}>
            Suscriptores vinculados a Wispro
          </p>
        </div>
        <CrmButton type="button" onClick={() => setIsDialogOpen(true)} className="w-full sm:w-auto">
          <Plus className="mr-2 size-4" aria-hidden="true" />
          Nuevo cliente
        </CrmButton>
      </div>
      <div className="space-y-5">
        <ClientsStats clients={clients} tickets={tickets} />
        <ClientsTable
          clients={clients}
          tickets={tickets}
          onView={setViewingClient}
          onEdit={handleOpenEdit}
          onDelete={(client) => void handleDelete(client)}
        />
      </div>
      <ClientFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onCreateClient={onCreateClient}
      />
      <ClientDetailDialog
        open={Boolean(viewingFromList)}
        client={viewingFromList ?? null}
        tickets={tickets}
        onOpenChange={(open) => {
          if (!open) setViewingClient(null);
        }}
        onEdit={handleOpenEdit}
      />
      <ClientEditDialog
        open={Boolean(editingClient)}
        client={editingClient}
        onOpenChange={(open) => {
          if (!open) setEditingClient(null);
        }}
        onSave={handleSaveEdit}
      />
    </div>
  );
};
