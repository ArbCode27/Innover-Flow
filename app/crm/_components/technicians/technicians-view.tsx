"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { Technician } from "@/lib/field-tickets/types";
import type { OrganizationRole } from "../../_lib/types";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { CrmButton } from "../shared/crm-button";
import { LoadingState } from "../shared/loading-state";
import {
  TechnicianFormDialog,
  type TechnicianFormValues,
} from "./technician-form-dialog";
import { TechnicianDetailDialog } from "./technician-detail-dialog";
import { TechniciansTable } from "./technicians-table";

interface TechniciansViewProps {
  organizationRole: OrganizationRole | null;
}

export const TechniciansView = ({ organizationRole }: TechniciansViewProps) => {
  const canEdit =
    organizationRole === "owner" || organizationRole === "admin";

  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTechnician, setEditingTechnician] = useState<Technician | null>(
    null,
  );
  const [viewingTechnician, setViewingTechnician] = useState<Technician | null>(
    null,
  );

  const loadTechnicians = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/crm/technicians?source=local", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        data?: Technician[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "No se pudieron cargar los técnicos");
      }
      const sorted = [...(payload.data || [])].sort((a, b) =>
        a.name.localeCompare(b.name, "es"),
      );
      setTechnicians(sorted);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los técnicos",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTechnicians();
  }, [loadTechnicians]);

  const handleOpenCreate = () => {
    setEditingTechnician(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (technician: Technician) => {
    setEditingTechnician(technician);
    setIsFormOpen(true);
  };

  const handleOpenView = (technician: Technician) => {
    setViewingTechnician(technician);
  };

  const handleSave = async (values: TechnicianFormValues) => {
    if (!canEdit) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/crm/technicians", {
        method: values.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: values.id,
          name: values.name,
          phone: values.phone,
          document: values.document,
          is_supervisor: values.isSupervisor,
          app_enabled: values.appEnabled,
        }),
      });
      const payload = (await response.json()) as {
        data?: Technician;
        error?: string;
      };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error || "No se pudo guardar");
      }

      setTechnicians((current) => {
        const others = current.filter((item) => item.id !== payload.data!.id);
        return [...others, payload.data!].sort((a, b) =>
          a.name.localeCompare(b.name, "es"),
        );
      });
      toast.success(values.id ? "Técnico actualizado" : "Técnico registrado");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo guardar el técnico";
      toast.error(message);
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (technician: Technician) => {
    if (!canEdit) return;
    const confirmed = window.confirm(
      `¿Eliminar a ${technician.name} del catálogo? Los tickets históricos no se borran.`,
    );
    if (!confirmed) return;

    try {
      const response = await fetch(
        `/api/crm/technicians?id=${encodeURIComponent(technician.id)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo eliminar");
      }
      setTechnicians((current) =>
        current.filter((item) => item.id !== technician.id),
      );
      if (viewingTechnician?.id === technician.id) {
        setViewingTechnician(null);
      }
      toast.success("Técnico eliminado");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo eliminar",
      );
    }
  };

  const handleSyncWispro = async () => {
    if (!canEdit || isSyncing) return;
    setIsSyncing(true);
    try {
      const response = await fetch("/api/crm/technicians/sync", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        synced?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo sincronizar");
      }
      toast.success(
        `Sincronizados ${payload.synced ?? 0} técnicos desde Wispro`,
      );
      await loadTechnicians();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo sincronizar",
      );
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="crm-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2
            className={`text-xl font-semibold md:text-2xl ${CRM_SURFACES.textPrimary}`}
          >
            Técnicos y supervisores
          </h2>
          <p className={`mt-1 text-sm ${CRM_SURFACES.textMuted}`}>
            Catálogo de campo: asigna tickets, habilita acceso a la app y marca
            supervisores. Contraseña de app = cédula (dígitos) + iniciales del
            nombre.
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <CrmButton
              type="button"
              variant="secondary"
              disabled={isSyncing}
              onClick={() => void handleSyncWispro()}
            >
              <RefreshCw
                className={`mr-2 size-4 ${isSyncing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {isSyncing ? "Sincronizando…" : "Sync Wispro"}
            </CrmButton>
            <CrmButton
              type="button"
              onClick={handleOpenCreate}
              className="w-full sm:w-auto"
            >
              <Plus className="mr-2 size-4" aria-hidden="true" />
              Nuevo técnico
            </CrmButton>
          </div>
        ) : null}
      </div>

      {isLoading ? <LoadingState label="Cargando técnicos…" /> : null}

      {!isLoading && loadError ? (
        <div
          className={`flex flex-wrap items-center gap-3 rounded-2xl p-4 ${CRM_SURFACES.elevated}`}
        >
          <p className="text-sm text-destructive">{loadError}</p>
          <CrmButton
            type="button"
            variant="secondary"
            onClick={() => void loadTechnicians()}
          >
            Reintentar
          </CrmButton>
        </div>
      ) : null}

      {!isLoading && !loadError ? (
        <>
          <p className={`mb-3 text-sm ${CRM_SURFACES.textMuted}`}>
            {technicians.length}{" "}
            {technicians.length === 1 ? "registro" : "registros"}
          </p>
          <TechniciansTable
            technicians={technicians}
            canEdit={canEdit}
            onView={handleOpenView}
            onEdit={handleOpenEdit}
            onDelete={(technician) => void handleDelete(technician)}
          />
          {!canEdit ? (
            <p className={`mt-3 text-xs ${CRM_SURFACES.textMuted}`}>
              Solo un administrador puede crear, editar o eliminar técnicos.
            </p>
          ) : null}
        </>
      ) : null}

      <TechnicianFormDialog
        open={isFormOpen}
        editingTechnician={editingTechnician}
        isSaving={isSaving}
        onOpenChange={setIsFormOpen}
        onSave={handleSave}
      />

      <TechnicianDetailDialog
        open={Boolean(viewingTechnician)}
        technician={viewingTechnician}
        canEdit={canEdit}
        onOpenChange={(open) => {
          if (!open) setViewingTechnician(null);
        }}
        onEdit={handleOpenEdit}
      />
    </div>
  );
};
