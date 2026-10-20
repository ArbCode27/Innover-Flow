"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Link2,
  RefreshCw,
  Server,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { CrmButton } from "../shared/crm-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  OrganizationIntegration,
  OrganizationRole,
} from "../../_lib/types";
import { CRM_SURFACES } from "../../_lib/crm-theme";

type Provider = "wispro";

const emptyIntegration = (provider: Provider): OrganizationIntegration => ({
  provider,
  status: "disconnected",
  config: {},
  has_credentials: false,
  last_verified_at: null,
  last_error: null,
  updated_at: "",
});

const statusLabel: Record<OrganizationIntegration["status"], string> = {
  connected: "Conectado",
  disconnected: "Sin conectar",
  pending: "Pendiente",
  error: "Con error",
};

/**
 * Tarjeta de integración de Wispro (Facturación e ISP).
 */
const WisproCard = ({
  integration,
  canEdit,
  onChanged,
}: {
  integration: OrganizationIntegration;
  canEdit: boolean;
  onChanged: (integration: OrganizationIntegration) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [apiToken, setApiToken] = useState("");
  const [baseUrl, setBaseUrl] = useState(
    String(
      integration.config.base_url || "https://www.cloud.wispro.co/api/v1",
    ),
  );

  useEffect(() => {
    setBaseUrl(
      String(
        integration.config.base_url || "https://www.cloud.wispro.co/api/v1",
      ),
    );
  }, [integration.config]);

  const isConnected = integration.status === "connected";

  const handleSave = async () => {
    if (!canEdit || isSaving) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/crm/integrations/wispro", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiToken, baseUrl }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo conectar");
      }
      onChanged(payload.integration);
      setApiToken("");
      setIsOpen(false);
      toast.success("Wispro conectado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo conectar");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const response = await fetch("/api/crm/integrations/wispro", {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "La conexión falló");
      }
      onChanged(payload.integration);
      toast.success("Conexión con Wispro verificada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "La conexión falló");
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = async () => {
    const response = await fetch("/api/crm/integrations/wispro", {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = await response.json();
      toast.error(payload.error || "No se pudo desconectar");
      return;
    }
    onChanged(emptyIntegration("wispro"));
    toast.success("Wispro desconectado");
  };

  return (
    <Card className="col-span-1 rounded-2xl border border-black/5 bg-transparent dark:border-white/10 lg:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-crm-accent-muted p-2.5 text-crm-accent">
              <Server className="size-5" aria-hidden="true" />
            </span>
            <div>
              <CardTitle className="text-base font-semibold">Wispro Cloud</CardTitle>
              <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                Consulta clientes, contratos, facturas y promesas de pago automáticamente.
              </p>
            </div>
          </div>

          <Badge variant={isConnected ? "default" : "secondary"}>
            {isConnected ? (
              <CheckCircle2 className="mr-1 size-3" />
            ) : null}
            {statusLabel[integration.status]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {isConnected ? (
          <div className={`space-y-1 text-xs ${CRM_SURFACES.textMuted}`}>
            <p>
              URL API: <span className="font-mono text-foreground">{String(integration.config.base_url || "")}</span>
            </p>
            <p>
              Verificada:{" "}
              {integration.last_verified_at
                ? new Date(integration.last_verified_at).toLocaleString("es-VE")
                : "Reciente"}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <CrmButton disabled={!canEdit} size="sm">
                <Link2 className="size-4" />
                {isConnected ? "Reconfigurar" : "Conectar Wispro"}
              </CrmButton>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Conectar Wispro</DialogTitle>
                <DialogDescription>
                  Ingresa tu API Key de Wispro Cloud. Las credenciales se cifran en el servidor.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="wispro-base-url">URL de la API</Label>
                  <Input
                    id="wispro-base-url"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wispro-token">API Key de Wispro</Label>
                  <Input
                    id="wispro-token"
                    type="password"
                    autoComplete="new-password"
                    value={apiToken}
                    onChange={(event) => setApiToken(event.target.value)}
                    placeholder="Token de acceso..."
                  />
                </div>
              </div>
              <DialogFooter>
                <CrmButton
                  onClick={() => void handleSave()}
                  disabled={isSaving || !apiToken || !baseUrl}>
                  {isSaving ? "Validando…" : "Validar y conectar"}
                </CrmButton>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {isConnected ? (
            <>
              <CrmButton
                size="sm"
                variant="secondary"
                onClick={() => void handleTest()}
                disabled={isTesting}>
                <RefreshCw className={`size-4 ${isTesting ? "animate-spin" : ""}`} />
                Probar
              </CrmButton>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <CrmButton size="sm" variant="ghost" disabled={!canEdit}>
                    <Unplug className="size-4" />
                    Desconectar
                  </CrmButton>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Desconectar Wispro?</AlertDialogTitle>
                    <AlertDialogDescription>
                      El CRM dejará de consultar contratos y facturas en tiempo real con estas credenciales.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void handleDisconnect()}>
                      Desconectar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

export const IntegrationsSettingsSection = ({
  organizationRole,
}: {
  organizationRole: OrganizationRole | null;
}) => {
  const [integrations, setIntegrations] = useState<Record<Provider, OrganizationIntegration>>({
    wispro: emptyIntegration("wispro"),
  });
  const canEdit = organizationRole === "owner" || organizationRole === "admin";

  const loadIntegration = useCallback(async (provider: Provider) => {
    const response = await fetch(`/api/crm/integrations/${provider}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = await response.json();
    setIntegrations((current) => ({
      ...current,
      [provider]: payload.integration,
    }));
  }, []);

  useEffect(() => {
    void loadIntegration("wispro");
  }, [loadIntegration]);

  const handleChanged = (integration: OrganizationIntegration) => {
    if (integration.provider !== "wispro") return;
    setIntegrations((current) => ({
      ...current,
      wispro: integration,
    }));
  };

  return (
    <Card className={`rounded-2xl border-0 ${CRM_SURFACES.elevated}`}>
      <CardHeader>
        <CardTitle className="text-base">Canales e Integraciones</CardTitle>
        <p className={`text-sm ${CRM_SURFACES.textMuted}`}>
          La atención a clientes corre por la app móvil vía endpoints propios del CRM.
          Aquí configuras sistemas externos como Wispro.
        </p>
      </CardHeader>
      <CardContent className="grid gap-5">
        <WisproCard
          integration={integrations.wispro}
          canEdit={canEdit}
          onChanged={handleChanged}
        />
      </CardContent>
    </Card>
  );
};
