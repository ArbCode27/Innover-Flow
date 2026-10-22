"use client";

import { useCallback, useEffect, useState } from "react";
import {
  HardHat,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { generateClientAppPassword } from "@/lib/client-auth-utils";
import type { Technician } from "@/lib/field-tickets/types";
import type { OrganizationRole } from "../../_lib/types";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { CrmButton } from "../shared/crm-button";

type TechnicianDraft = {
  id: string | null;
  name: string;
  phone: string;
  document: string;
  isSupervisor: boolean;
  appEnabled: boolean;
};

const emptyDraft = (): TechnicianDraft => ({
  id: null,
  name: "",
  phone: "",
  document: "",
  isSupervisor: false,
  appEnabled: true,
});

const toDraft = (technician: Technician): TechnicianDraft => ({
  id: technician.id,
  name: technician.name,
  phone: technician.phone || "",
  document: technician.document || "",
  isSupervisor: technician.isSupervisor,
  appEnabled: technician.appEnabled !== false,
});

export const TechniciansSettingsSection = ({
  organizationRole,
  hideIntro = false,
}: {
  organizationRole: OrganizationRole | null;
  /** Oculta título/descripción del card cuando la vista padre ya los muestra. */
  hideIntro?: boolean;
}) => {
  const canEdit = organizationRole === "owner" || organizationRole === "admin";
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [draft, setDraft] = useState<TechnicianDraft>(emptyDraft());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
      setTechnicians(payload.data || []);
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

  const handleEdit = (technician: Technician) => {
    setDraft(toDraft(technician));
  };

  const handleReset = () => {
    setDraft(emptyDraft());
  };

  const handleSave = async () => {
    if (!canEdit || isSaving) return;
    if (draft.name.trim().length < 2) {
      toast.error("Ingresa el nombre del técnico");
      return;
    }

    setIsSaving(true);
    try {
      const body = {
        id: draft.id || undefined,
        name: draft.name.trim(),
        phone: draft.phone.trim() || null,
        document: draft.document.trim() || null,
        is_supervisor: draft.isSupervisor,
        app_enabled: draft.appEnabled,
      };
      const response = await fetch("/api/crm/technicians", {
        method: draft.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
      setDraft(toDraft(payload.data));
      toast.success(draft.id ? "Técnico actualizado" : "Técnico registrado");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar el técnico",
      );
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
      if (draft.id === technician.id) {
        setDraft(emptyDraft());
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

  const previewPassword =
    draft.document.trim() && draft.name.trim()
      ? generateClientAppPassword(draft.document, draft.name)
      : null;

  return (
    <Card className={`rounded-2xl border-0 ${CRM_SURFACES.elevated}`}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          {hideIntro ? (
            <div className="flex items-center gap-2">
              <HardHat className="size-4 text-crm-accent" aria-hidden="true" />
              <CardTitle className="text-base">Catálogo</CardTitle>
            </div>
          ) : (
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <HardHat className="size-4 text-crm-accent" aria-hidden="true" />
                Técnicos de campo
              </CardTitle>
              <p className={`mt-1 text-sm ${CRM_SURFACES.textMuted}`}>
                Registra técnicos y supervisores para asignar tickets y que
                puedan entrar a la app con cédula + iniciales.
              </p>
            </div>
          )}
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <CrmButton
                type="button"
                variant="secondary"
                disabled={isSyncing}
                onClick={() => void handleSyncWispro()}>
                <RefreshCw
                  className={`size-3.5 ${isSyncing ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                {isSyncing ? "Sincronizando…" : "Sync Wispro"}
              </CrmButton>
              <CrmButton
                type="button"
                variant="secondary"
                onClick={handleReset}>
                <Plus className="size-3.5" aria-hidden="true" />
                Nuevo
              </CrmButton>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-12">
        <section className="grid gap-3 lg:col-span-5">
          <h4 className={`text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
            {draft.id ? "Editar técnico" : "Registrar técnico"}
          </h4>
          <div className="grid gap-1.5">
            <Label htmlFor="tech-name">Nombre</Label>
            <Input
              id="tech-name"
              value={draft.name}
              disabled={!canEdit}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              className={CRM_SURFACES.input}
              placeholder="Ej. José Pérez"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tech-document">Cédula / documento</Label>
            <Input
              id="tech-document"
              value={draft.document}
              disabled={!canEdit}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  document: event.target.value,
                }))
              }
              className={CRM_SURFACES.input}
              placeholder="Ej. 28123456"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tech-phone">Teléfono</Label>
            <Input
              id="tech-phone"
              value={draft.phone}
              disabled={!canEdit}
              onChange={(event) =>
                setDraft((current) => ({ ...current, phone: event.target.value }))
              }
              className={CRM_SURFACES.input}
              placeholder="Ej. 0412 0000000"
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="tech-supervisor"
                checked={draft.isSupervisor}
                disabled={!canEdit}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({
                    ...current,
                    isSupervisor: checked,
                  }))
                }
              />
              <Label htmlFor="tech-supervisor">Supervisor</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="tech-app"
                checked={draft.appEnabled}
                disabled={!canEdit}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({
                    ...current,
                    appEnabled: checked,
                  }))
                }
              />
              <Label htmlFor="tech-app">Acceso a la app</Label>
            </div>
          </div>
          {previewPassword ? (
            <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
              Clave de app (autogenerada):{" "}
              <span className={`font-mono ${CRM_SURFACES.textSecondary}`}>
                {previewPassword}
              </span>
            </p>
          ) : (
            <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
              La clave es cédula + iniciales (ej. 28123456JP).
            </p>
          )}
          {canEdit ? (
            <CrmButton
              type="button"
              variant="primary"
              disabled={isSaving}
              onClick={() => void handleSave()}>
              <Save className="size-3.5" aria-hidden="true" />
              {isSaving ? "Guardando…" : draft.id ? "Guardar cambios" : "Registrar"}
            </CrmButton>
          ) : (
            <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
              Solo un administrador puede editar técnicos.
            </p>
          )}
        </section>

        <section className="lg:col-span-7">
          <h4
            className={`mb-3 text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
            Catálogo ({technicians.length})
          </h4>
          {isLoading ? (
            <p className={`text-sm ${CRM_SURFACES.textMuted}`}>Cargando…</p>
          ) : null}
          {loadError ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-destructive">{loadError}</p>
              <CrmButton
                type="button"
                variant="secondary"
                onClick={() => void loadTechnicians()}>
                Reintentar
              </CrmButton>
            </div>
          ) : null}
          {!isLoading && !loadError && technicians.length === 0 ? (
            <p className={`text-sm ${CRM_SURFACES.textMuted}`}>
              Aún no hay técnicos locales. Registra uno o sincroniza desde
              Wispro.
            </p>
          ) : null}
          <ul className="grid gap-2">
            {technicians.map((technician) => (
              <li
                key={technician.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 ${CRM_SURFACES.border}`}>
                <div className="min-w-0">
                  <p
                    className={`truncate text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
                    {technician.name}
                    {technician.isSupervisor ? " · Supervisor" : ""}
                  </p>
                  <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                    {technician.document || "Sin cédula"}
                    {technician.phone ? ` · ${technician.phone}` : ""}
                    {technician.appEnabled === false
                      ? " · App deshabilitada"
                      : " · App activa"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <CrmButton
                    type="button"
                    variant="secondary"
                    onClick={() => handleEdit(technician)}>
                    Editar
                  </CrmButton>
                  {canEdit ? (
                    <CrmButton
                      type="button"
                      variant="secondary"
                      onClick={() => void handleDelete(technician)}
                      aria-label={`Eliminar ${technician.name}`}>
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </CrmButton>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  );
};
