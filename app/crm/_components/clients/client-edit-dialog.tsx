"use client";

import { FormEvent, useEffect, useId, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { generateClientAppPassword } from "@/lib/client-auth-utils";
import { CRM_DIALOG, CRM_SURFACES } from "../../_lib/crm-theme";
import type { Client, ClientAccountStatus, UpdateClientInput } from "../../_lib/types";
import { CrmButton } from "../shared/crm-button";

const ACCOUNT_OPTIONS: ClientAccountStatus[] = [
  "Al día",
  "Con deuda",
  "Suspendido",
  "Prospecto",
];

interface ClientEditDialogProps {
  open: boolean;
  client: Client | null;
  onOpenChange: (open: boolean) => void;
  onSave: (input: UpdateClientInput) => Promise<void>;
}

export const ClientEditDialog = ({
  open,
  client,
  onOpenChange,
  onSave,
}: ClientEditDialogProps) => {
  const appSwitchId = useId();
  const [name, setName] = useState("");
  const [cedula, setCedula] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState("");
  const [zone, setZone] = useState("");
  const [account, setAccount] = useState<ClientAccountStatus>("Prospecto");
  const [appEnabled, setAppEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !client) return;
    setName(client.name || "");
    setCedula(client.cedula || "");
    setPhone(client.phone || "");
    setPlan(client.plan || "");
    setZone(client.zone || "");
    setAccount(client.account || "Prospecto");
    setAppEnabled(client.app_enabled !== false);
    setIsSubmitting(false);
  }, [client, open]);

  const previewPassword =
    cedula.trim() && name.trim()
      ? generateClientAppPassword(cedula, name)
      : null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client || isSubmitting) return;

    const normalizedName = name.trim();
    if (normalizedName.length < 2) {
      toast.error("Ingresa el nombre del cliente");
      return;
    }
    if (phone.replace(/\D/g, "").length < 8) {
      toast.error("Ingresa un teléfono válido");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        id: client.id,
        name: normalizedName,
        phone: phone.trim(),
        cedula: cedula.trim() || null,
        plan: plan.trim() || null,
        zone: zone.trim() || null,
        account,
        app_enabled: appEnabled,
      });
      onOpenChange(false);
    } catch {
      // El padre muestra el error
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-h-[92vh] overflow-y-auto sm:max-w-lg ${CRM_DIALOG}`}>
        <DialogHeader>
          <DialogTitle className={CRM_SURFACES.textPrimary}>Editar cliente</DialogTitle>
          <DialogDescription className={CRM_SURFACES.textMuted}>
            Actualiza la ficha. El plan y el estado de cuenta pueden volver a
            sincronizarse con la facturación.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="grid gap-1.5">
            <Label htmlFor="client-edit-name">Nombre</Label>
            <Input
              id="client-edit-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={CRM_SURFACES.input}
              autoFocus
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="client-edit-cedula">Cédula / documento</Label>
              <Input
                id="client-edit-cedula"
                value={cedula}
                onChange={(event) => setCedula(event.target.value)}
                className={CRM_SURFACES.input}
                placeholder="Ej. 28123456"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="client-edit-phone">Teléfono</Label>
              <Input
                id="client-edit-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className={CRM_SURFACES.input}
                placeholder="Ej. 0412 1234567"
                required
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="client-edit-plan">Plan</Label>
              <Input
                id="client-edit-plan"
                value={plan}
                onChange={(event) => setPlan(event.target.value)}
                className={CRM_SURFACES.input}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="client-edit-zone">Zona</Label>
              <Input
                id="client-edit-zone"
                value={zone}
                onChange={(event) => setZone(event.target.value)}
                className={CRM_SURFACES.input}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="client-edit-account">Estado de cuenta</Label>
            <Select
              value={account}
              onValueChange={(value) => setAccount(value as ClientAccountStatus)}
            >
              <SelectTrigger
                id="client-edit-account"
                className={`w-full ${CRM_SURFACES.input}`}
              >
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 p-3.5">
            <div className="space-y-0.5">
              <Label htmlFor={appSwitchId} className="cursor-pointer font-medium">
                Permitir acceso a la App Móvil
              </Label>
              <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                {appEnabled && previewPassword
                  ? `Clave autogenerada: ${previewPassword}`
                  : "El cliente entra con su cédula e iniciales."}
              </p>
            </div>
            <Switch
              id={appSwitchId}
              checked={appEnabled}
              onCheckedChange={setAppEnabled}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <CrmButton
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </CrmButton>
            <CrmButton type="submit" variant="primary" disabled={isSubmitting || !client}>
              {isSubmitting ? "Guardando…" : "Guardar cambios"}
            </CrmButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
