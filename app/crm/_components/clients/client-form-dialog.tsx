"use client";

import { FormEvent, useId, useState } from "react";
import { Check, Copy, KeyRound, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { CrmButton } from "../shared/crm-button";
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
import { ACCOUNT_STATUSES, INTERNET_PLANS } from "../../_lib/constants";
import { CRM_DIALOG, CRM_SURFACES } from "../../_lib/crm-theme";
import type { ClientAccountStatus, CreateClientInput } from "../../_lib/types";
import {
  extractCedulaDigits,
  generateClientAppPassword,
} from "@/lib/client-auth-utils";

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateClient: (input: CreateClientInput) => Promise<void>;
}

export const ClientFormDialog = ({
  open,
  onOpenChange,
  onCreateClient,
}: ClientFormDialogProps) => {
  const [name, setName] = useState("");
  const [cedula, setCedula] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState(INTERNET_PLANS[2]);
  const [zone, setZone] = useState("");
  const [account, setAccount] = useState<ClientAccountStatus>("Al día");
  const [appEnabled, setAppEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  const appSwitchId = useId();

  // Contraseña autogenerada en tiempo real (Cédula + Iniciales)
  const cleanCedula = extractCedulaDigits(cedula);
  const generatedPassword = generateClientAppPassword(cleanCedula, name);

  const handleCopyCredentials = async () => {
    if (!generatedPassword) {
      toast.error("Ingrese nombre y cédula para generar las credenciales");
      return;
    }

    const userLogin = cleanCedula || phone.trim();
    const textToCopy = [
      `📱 Acceso a la App Móvil`,
      `Usuario: ${userLogin}`,
      `Contraseña: ${generatedPassword}`,
      phone.trim() ? `Teléfono: ${phone.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await navigator.clipboard.writeText(textToCopy);
      setHasCopied(true);
      toast.success("Credenciales copiadas al portapapeles");
      setTimeout(() => setHasCopied(false), 2500);
    } catch {
      toast.error("No se pudo copiar al portapapeles");
    }
  };

  const handleResetForm = () => {
    setName("");
    setCedula("");
    setPhone("");
    setZone("");
    setPlan(INTERNET_PLANS[2]);
    setAccount("Al día");
    setAppEnabled(true);
    setHasCopied(false);
  };

  const handleDialogChange = (isOpen: boolean) => {
    if (!isOpen) {
      handleResetForm();
    }
    onOpenChange(isOpen);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast.error("Nombre y teléfono son requeridos");
      return;
    }

    try {
      setIsSubmitting(true);
      await onCreateClient({
        name: name.trim(),
        phone: phone.trim(),
        cedula: cleanCedula || undefined,
        app_enabled: appEnabled,
        plan,
        zone: zone.trim() || "Sin asignar",
        account,
      });

      handleResetForm();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al registrar el cliente",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className={`${CRM_DIALOG} max-w-xl`}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="size-5 text-blue-500" aria-hidden="true" />
              Nuevo cliente
            </DialogTitle>
            <DialogDescription className={CRM_SURFACES.textMuted}>
              Registra un nuevo suscriptor. Podrá iniciar sesión en la app con su cédula e iniciales autogeneradas.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="client-name">Nombre completo</Label>
              <Input
                id="client-name"
                placeholder="Ej. Carlos Pérez"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-cedula">Cédula / Documento</Label>
              <Input
                id="client-cedula"
                placeholder="Ej. 28.123.456"
                value={cedula}
                onChange={(event) => setCedula(event.target.value)}
                className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`}
              />
              <span className="text-xs text-muted-foreground">
                Base para la contraseña autogenerada
              </span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-phone">Teléfono móvil</Label>
              <Input
                id="client-phone"
                placeholder="Ej. +58 412 1234567"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
                className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`}
              />
              <span className="text-xs text-muted-foreground">
                Para autenticación y notificaciones
              </span>
            </div>

            <div className="space-y-2">
              <Label>Plan contratado</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger className={`w-full ${CRM_SURFACES.border} ${CRM_SURFACES.input}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERNET_PLANS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-zone">Zona / Nodo</Label>
              <Input
                id="client-zone"
                placeholder="Ej. Sector Norte / Nodo 4"
                value={zone}
                onChange={(event) => setZone(event.target.value)}
                className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Estado de cuenta inicial</Label>
              <Select
                value={account}
                onValueChange={(value) => setAccount(value as ClientAccountStatus)}
              >
                <SelectTrigger className={`w-full ${CRM_SURFACES.border} ${CRM_SURFACES.input}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_STATUSES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Switch de Acceso a App Móvil */}
            <div className="sm:col-span-2 rounded-lg border border-border/60 bg-muted/30 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor={appSwitchId} className="cursor-pointer font-medium">
                    Permitir acceso a la App Móvil
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Habilita que el cliente pueda iniciar sesión desde la aplicación móvil.
                  </p>
                </div>
                <Switch
                  id={appSwitchId}
                  checked={appEnabled}
                  onCheckedChange={setAppEnabled}
                />
              </div>

              {/* Vista previa de Credenciales Autogeneradas */}
              {appEnabled && (
                <div className="mt-3.5 border-t border-border/50 pt-3">
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-2">
                      <KeyRound className="mt-0.5 size-4 text-emerald-500 shrink-0" aria-hidden="true" />
                      <div>
                        <span className="text-xs font-semibold text-foreground block">
                          Contraseña autogenerada:
                        </span>
                        {generatedPassword ? (
                          <div className="mt-0.5 flex items-center gap-2">
                            <span className="font-mono text-sm font-bold tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                              {generatedPassword}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              (Cédula + Iniciales)
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            Escriba el nombre y la cédula para previsualizarla
                          </span>
                        )}
                      </div>
                    </div>

                    {generatedPassword && (
                      <button
                        type="button"
                        onClick={handleCopyCredentials}
                        className="inline-flex items-center gap-1.5 self-start sm:self-center text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline transition-colors"
                      >
                        {hasCopied ? (
                          <>
                            <Check className="size-3.5 text-emerald-500" aria-hidden="true" />
                            <span>Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3.5" aria-hidden="true" />
                            <span>Copiar credenciales</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <CrmButton
              type="button"
              variant="secondary"
              onClick={() => handleDialogChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </CrmButton>
            <CrmButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : "Registrar cliente"}
            </CrmButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
