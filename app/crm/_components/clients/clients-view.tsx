"use client";

import { useRef, useState } from "react";
import { Download, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { CrmButton } from "../shared/crm-button";
import type { Client, CreateClientInput, Ticket, UpdateClientInput } from "../../_lib/types";
import { ClientDetailDialog } from "./client-detail-dialog";
import { ClientEditDialog } from "./client-edit-dialog";
import { ClientFormDialog } from "./client-form-dialog";
import { ClientsStats } from "./clients-stats";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { ClientsTable } from "./clients-table";

type OnuImportError = { row: number; name: string; message: string };

type OnuImportResult = {
  linked: number;
  updated: number;
  skipped: number;
  errors: OnuImportError[];
};

interface ClientsViewProps {
  clients: Client[];
  tickets: Ticket[];
  onCreateClient: (input: CreateClientInput) => Promise<void>;
  onUpdateClient: (input: UpdateClientInput) => Promise<void>;
  onDeleteClient: (clientId: number) => Promise<void>;
  onClientsChanged?: () => Promise<void> | void;
}

export const ClientsView = ({
  clients,
  tickets,
  onCreateClient,
  onUpdateClient,
  onDeleteClient,
  onClientsChanged,
}: ClientsViewProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<OnuImportResult | null>(null);
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

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch("/api/crm/clients/onu-template", {
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "No se pudo descargar la plantilla");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "plantilla-equipos.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo descargar la plantilla",
      );
    }
  };

  const handleImportFile = async (file: File) => {
    setIsImporting(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/crm/clients/onu-import", {
        method: "POST",
        body,
      });
      const payload = (await response.json()) as OnuImportResult & {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || "No se pudo importar la plantilla");
      }
      setImportResult({
        linked: payload.linked,
        updated: payload.updated,
        skipped: payload.skipped,
        errors: payload.errors || [],
      });
      if (payload.linked || payload.updated) {
        await onClientsChanged?.();
      }
      toast.success(
        `${payload.linked} equipos vinculados, ${payload.updated} actualizados`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo importar la plantilla",
      );
    } finally {
      setIsImporting(false);
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
            Suscriptores de la organización
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <CrmButton
            type="button"
            variant="secondary"
            onClick={() => void handleDownloadTemplate()}
            className="w-full sm:w-auto"
          >
            <Download className="mr-2 size-4" aria-hidden="true" />
            Plantilla equipos
          </CrmButton>
          <CrmButton
            type="button"
            variant="secondary"
            disabled={isImporting}
            onClick={() => fileInputRef.current?.click()}
            className="w-full sm:w-auto"
          >
            <Upload className="mr-2 size-4" aria-hidden="true" />
            {isImporting ? "Importando…" : "Importar equipos"}
          </CrmButton>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            aria-label="Importar plantilla de equipos"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleImportFile(file);
            }}
          />
          <CrmButton type="button" onClick={() => setIsDialogOpen(true)} className="w-full sm:w-auto">
            <Plus className="mr-2 size-4" aria-hidden="true" />
            Nuevo cliente
          </CrmButton>
        </div>
      </div>
      <div className="space-y-5">
        {importResult ? (
          <div className="rounded-xl border border-border/70 p-3 text-sm">
            <p className="font-medium">
              {importResult.linked} vinculados, {importResult.updated} actualizados
              {importResult.errors.length
                ? `, ${importResult.errors.length} con error`
                : ""}
            </p>
            {importResult.errors.length ? (
              <ul className={`mt-2 grid gap-1 ${CRM_SURFACES.textMuted}`}>
                {importResult.errors.slice(0, 8).map((item) => (
                  <li key={`${item.row}-${item.message}`}>
                    Fila {item.row}
                    {item.name ? ` · ${item.name}` : ""}: {item.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
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
