"use client";

import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { generateClientAppPassword } from "@/lib/client-auth-utils";
import type { Technician } from "@/lib/field-tickets/types";
import { CRM_DIALOG, CRM_SURFACES } from "../../_lib/crm-theme";
import { CrmButton } from "../shared/crm-button";

export type TechnicianFormValues = {
  id?: string;
  name: string;
  phone: string | null;
  document: string | null;
  isSupervisor: boolean;
  appEnabled: boolean;
};

interface TechnicianFormDialogProps {
  open: boolean;
  editingTechnician: Technician | null;
  isSaving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: TechnicianFormValues) => Promise<void>;
}

export const TechnicianFormDialog = ({
  open,
  editingTechnician,
  isSaving = false,
  onOpenChange,
  onSave,
}: TechnicianFormDialogProps) => {
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [appEnabled, setAppEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEdit = Boolean(editingTechnician);

  useEffect(() => {
    if (!open) return;
    setName(editingTechnician?.name || "");
    setDocument(editingTechnician?.document || "");
    setPhone(editingTechnician?.phone || "");
    setIsSupervisor(Boolean(editingTechnician?.isSupervisor));
    setAppEnabled(editingTechnician?.appEnabled !== false);
    setIsSubmitting(false);
  }, [editingTechnician, open]);

  const previewPassword =
    document.trim() && name.trim()
      ? generateClientAppPassword(document, name)
      : null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || isSaving) return;

    const normalizedName = name.trim();
    if (normalizedName.length < 2) {
      toast.error("Ingresa el nombre del técnico");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        id: editingTechnician?.id,
        name: normalizedName,
        phone: phone.trim() || null,
        document: document.trim() || null,
        isSupervisor,
        appEnabled,
      });
      onOpenChange(false);
    } catch {
      // El padre muestra el toast de error
    } finally {
      setIsSubmitting(false);
    }
  };

  const busy = isSubmitting || isSaving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`sm:max-w-lg ${CRM_DIALOG}`}>
        <DialogHeader>
          <DialogTitle className={CRM_SURFACES.textPrimary}>
            {isEdit ? "Editar técnico" : "Nuevo técnico"}
          </DialogTitle>
          <DialogDescription className={CRM_SURFACES.textMuted}>
            {isEdit
              ? "Actualiza los datos del técnico o supervisor de campo."
              : "Registra un técnico o supervisor. La clave de la app se genera con cédula + iniciales."}
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="grid gap-1.5">
            <Label htmlFor="technician-form-name">Nombre</Label>
            <Input
              id="technician-form-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={CRM_SURFACES.input}
              placeholder="Ej. José Pérez"
              autoFocus
              required
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="technician-form-document">Cédula / documento</Label>
            <Input
              id="technician-form-document"
              value={document}
              onChange={(event) => setDocument(event.target.value)}
              className={CRM_SURFACES.input}
              placeholder="Ej. 28123456"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="technician-form-phone">Teléfono</Label>
            <Input
              id="technician-form-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={CRM_SURFACES.input}
              placeholder="Ej. 0412 0000000"
            />
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-2">
              <Switch
                id="technician-form-supervisor"
                checked={isSupervisor}
                onCheckedChange={setIsSupervisor}
              />
              <Label htmlFor="technician-form-supervisor">Supervisor</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="technician-form-app"
                checked={appEnabled}
                onCheckedChange={setAppEnabled}
              />
              <Label htmlFor="technician-form-app">Acceso a la app</Label>
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
              La clave es cédula (dígitos) + iniciales del nombre (ej. 28123456JP).
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <CrmButton
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </CrmButton>
            <CrmButton type="submit" variant="primary" disabled={busy}>
              {busy
                ? "Guardando…"
                : isEdit
                  ? "Guardar cambios"
                  : "Registrar"}
            </CrmButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
