"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Link2,
  Network,
  Receipt,
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
import { Progress } from "@/components/ui/progress";
import type {
  Organization,
  OrganizationIntegration,
  OrganizationRole,
} from "../../_lib/types";
import {
  runClientDirectorySync,
  type ClientDirectorySyncProgress,
} from "../../_lib/run-client-directory-sync";
import { CRM_SURFACES } from "../../_lib/crm-theme";

type Provider = "wispro" | "smartolt" | "sae";

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
  isImporting,
  onChanged,
  onImportClients,
}: {
  integration: OrganizationIntegration;
  canEdit: boolean;
  isImporting: boolean;
  onChanged: (integration: OrganizationIntegration) => void;
  onImportClients: (provider: "wispro" | "sae") => void;
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
      onImportClients("wispro");
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
      onImportClients("wispro");
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
                Consulta clientes, contratos, facturas y promesas de pago de esta sucursal.
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
              <CrmButton
                size="sm"
                variant="secondary"
                disabled={!canEdit || isImporting}
                onClick={() => onImportClients("wispro")}
              >
                {isImporting ? "Importando…" : "Importar clientes"}
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

const notifySaeAccountSync = (
  payload: { sae_accounts?: { count?: number; error?: string | null } },
  verb: "conectado" | "verificado",
) => {
  const accounts = payload.sae_accounts;
  if (accounts?.error) {
    toast.warning(
      `SAE Plus ${verb}, pero no se pudieron cargar las cuentas: ${accounts.error}`,
    );
    return;
  }
  const count = accounts?.count ?? 0;
  if (count === 0) {
    toast.success(`SAE Plus ${verb}. SAE no tiene cuentas registradas.`);
    return;
  }
  toast.success(
    `SAE Plus ${verb}. ${count} ${count === 1 ? "cuenta cargada" : "cuentas cargadas"}.`,
  );
};

/**
 * Tarjeta de integración de SAE Plus (Abonados, contratos y reportes de pago).
 */
const SaeCard = ({
  integration,
  canEdit,
  isImporting,
  onChanged,
  onImportClients,
}: {
  integration: OrganizationIntegration;
  canEdit: boolean;
  isImporting: boolean;
  onChanged: (integration: OrganizationIntegration) => void;
  onImportClients: (provider: "wispro" | "sae") => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [apiToken, setApiToken] = useState("");
  const [apiConnect, setApiConnect] = useState("");
  const [baseUrl, setBaseUrl] = useState(
    String(integration.config.base_url || "https://apiservice.saeplus.com"),
  );
  const [testContractId, setTestContractId] = useState(
    String(integration.config.test_contract_id || ""),
  );

  useEffect(() => {
    setBaseUrl(
      String(integration.config.base_url || "https://apiservice.saeplus.com"),
    );
    setTestContractId(String(integration.config.test_contract_id || ""));
  }, [integration.config]);

  const isConnected = integration.status === "connected";

  const handleSave = async () => {
    if (!canEdit || isSaving) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/crm/integrations/sae", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiToken,
          apiConnect,
          baseUrl,
          testContractId: testContractId.trim() || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo conectar");
      }
      onChanged(payload.integration);
      setApiToken("");
      setApiConnect("");
      setIsOpen(false);
      notifySaeAccountSync(payload, "conectado");
      onImportClients("sae");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo conectar");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const response = await fetch("/api/crm/integrations/sae", {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "La conexión falló");
      }
      onChanged(payload.integration);
      notifySaeAccountSync(payload, "verificado");
      onImportClients("sae");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "La conexión falló");
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = async () => {
    const response = await fetch("/api/crm/integrations/sae", {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = await response.json();
      toast.error(payload.error || "No se pudo desconectar");
      return;
    }
    onChanged(emptyIntegration("sae"));
    toast.success("SAE Plus desconectado");
  };

  return (
    <Card className="col-span-1 rounded-2xl border border-black/5 bg-transparent dark:border-white/10 lg:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-crm-accent-muted p-2.5 text-crm-accent">
              <Receipt className="size-5" aria-hidden="true" />
            </span>
            <div>
              <CardTitle className="text-base font-semibold">SAE Plus</CardTitle>
              <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                Gestión de abonados, consulta de contratos y registro de pagos para conciliar después.
              </p>
            </div>
          </div>

          <Badge variant={isConnected ? "default" : "secondary"}>
            {isConnected ? <CheckCircle2 className="mr-1 size-3" /> : null}
            {statusLabel[integration.status]}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {isConnected ? (
          <div className={`space-y-1 text-xs ${CRM_SURFACES.textMuted}`}>
            <p>
              URL API:{" "}
              <span className="font-mono text-foreground">
                {String(integration.config.base_url || "")}
              </span>
            </p>
            <p>
              Cuentas: se cargan desde SAE al conectar o verificar.
            </p>
            {integration.config.test_contract_id ? (
              <p>
                Contrato de prueba:{" "}
                <span className="font-mono text-foreground">
                  {String(integration.config.test_contract_id)}
                </span>
              </p>
            ) : null}
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
                {isConnected ? "Reconfigurar" : "Conectar SAE Plus"}
              </CrmButton>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Conectar SAE Plus</DialogTitle>
                <DialogDescription>
                  Ingresa las credenciales API de SAEplus Connect asignadas a tu empresa.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="sae-base-url">URL de la API</Label>
                  <Input
                    id="sae-base-url"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    placeholder="https://apiservice.saeplus.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sae-token">Api-Token</Label>
                  <Input
                    id="sae-token"
                    type="password"
                    autoComplete="new-password"
                    value={apiToken}
                    onChange={(event) => setApiToken(event.target.value)}
                    placeholder="Token API asignado a la empresa..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sae-connect">Api-Connect (ID Empresa)</Label>
                  <Input
                    id="sae-connect"
                    value={apiConnect}
                    onChange={(event) => setApiConnect(event.target.value)}
                    placeholder="Identificador de la empresa en SAE..."
                  />
                  <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                    Identifica a la empresa. SAE lo pide junto con el Api-Token en cada consulta.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sae-test-contract">
                    Contrato de prueba (Opcional)
                  </Label>
                  <Input
                    id="sae-test-contract"
                    value={testContractId}
                    onChange={(event) => setTestContractId(event.target.value)}
                    placeholder="Número o ID de contrato para pruebas autorizadas"
                  />
                  <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                    Al estar sobre el entorno productivo de SAE, usa contratos autorizados para ensayos.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <CrmButton
                  onClick={() => void handleSave()}
                  disabled={isSaving || !apiToken || !apiConnect || !baseUrl}>
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
                <RefreshCw
                  className={`size-4 ${isTesting ? "animate-spin" : ""}`}
                />
                Probar
              </CrmButton>
              <CrmButton
                size="sm"
                variant="secondary"
                disabled={!canEdit || isImporting}
                onClick={() => onImportClients("sae")}
              >
                {isImporting ? "Importando…" : "Importar clientes"}
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
                    <AlertDialogTitle>¿Desconectar SAE Plus?</AlertDialogTitle>
                    <AlertDialogDescription>
                      El CRM dejará de consultar abonados y saldos en tiempo real con estas credenciales.
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

/**
 * Tarjeta de integración de SmartOLT (Diagnóstico óptico y monitoreo PON).
 */
const SmartOltCard = ({
  organization,
  integration,
  canEdit,
  onChanged,
}: {
  organization?: Organization | null;
  integration: OrganizationIntegration;
  canEdit: boolean;
  onChanged: (integration: OrganizationIntegration) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(
    String(integration.config.base_url || ""),
  );
  const [hasCopiedWebhook, setHasCopiedWebhook] = useState(false);

  useEffect(() => {
    setBaseUrl(String(integration.config.base_url || ""));
  }, [integration.config]);

  const isConnected = integration.status === "connected";

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/smartolt?org=${organization?.slug || organization?.id || ""}`
      : "";

  const handleCopyWebhook = async () => {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setHasCopiedWebhook(true);
      toast.success("URL del Webhook copiada al portapapeles");
      setTimeout(() => setHasCopiedWebhook(false), 2500);
    } catch {
      toast.error("No se pudo copiar la URL");
    }
  };

  const handleSave = async () => {
    if (!canEdit || isSaving) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/crm/integrations/smartolt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, baseUrl }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo conectar con SmartOLT");
      }
      onChanged(payload.integration);
      setApiKey("");
      setIsOpen(false);
      toast.success("SmartOLT conectado correctamente");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo conectar");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const response = await fetch("/api/crm/integrations/smartolt", {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "La conexión falló");
      }
      onChanged(payload.integration);
      toast.success("Conexión con SmartOLT verificada exitosamente");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "La conexión falló");
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = async () => {
    const response = await fetch("/api/crm/integrations/smartolt", {
      method: "DELETE",
    });
    if (!response.ok) {
      const payload = await response.json();
      toast.error(payload.error || "No se pudo desconectar");
      return;
    }
    onChanged(emptyIntegration("smartolt"));
    toast.success("SmartOLT desconectado");
  };

  return (
    <Card className="col-span-1 rounded-2xl border border-black/5 bg-transparent dark:border-white/10 lg:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-crm-accent-muted p-2.5 text-crm-accent">
              <Network className="size-5" aria-hidden="true" />
            </span>
            <div>
              <CardTitle className="text-base font-semibold">SmartOLT</CardTitle>
              <p className={`text-xs ${CRM_SURFACES.textMuted}`}>
                Diagnóstico óptico en vivo, búsqueda de ONUs y monitoreo de incidencias PON exclusivo para esta sucursal.
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
          <div className={`space-y-1.5 text-xs ${CRM_SURFACES.textMuted}`}>
            <p>
              URL / Subdominio: <span className="font-mono text-foreground">{String(integration.config.base_url || "")}</span>
            </p>
            <p>
              Verificada:{" "}
              {integration.last_verified_at
                ? new Date(integration.last_verified_at).toLocaleString("es-VE")
                : "Reciente"}
            </p>

            <div className="mt-3 rounded-xl border border-border/60 bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">Webhook para SmartOLT de esta sucursal:</span>
                <CrmButton
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => void handleCopyWebhook()}>
                  {hasCopiedWebhook ? (
                    <>
                      <Check className="size-3.5 text-emerald-500" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      <span>Copiar URL</span>
                    </>
                  )}
                </CrmButton>
              </div>
              <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                {webhookUrl}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground/80">
                Pega esta URL en tu panel de SmartOLT (Ajustes &gt; Webhooks) activando eventos de estado (<code>onu.status_changed</code>) y potencia óptica (<code>onu.signal_changed</code>).
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <CrmButton disabled={!canEdit} size="sm">
                <Link2 className="size-4" />
                {isConnected ? "Reconfigurar" : "Conectar SmartOLT"}
              </CrmButton>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Conectar SmartOLT</DialogTitle>
                <DialogDescription>
                  Ingresa el subdominio o URL de tu instancia SmartOLT y tu API Key (X-Token). Las credenciales se almacenan cifradas con AES-256-GCM.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="smartolt-base-url">Subdominio o URL de SmartOLT</Label>
                  <Input
                    id="smartolt-base-url"
                    value={baseUrl}
                    placeholder="ej. mi-empresa o https://mi-empresa.smartolt.com"
                    onChange={(event) => setBaseUrl(event.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Puedes colocar solo tu subdominio (ej: <code>mi-empresa</code>) o la URL completa.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smartolt-token">API Key (X-Token)</Label>
                  <Input
                    id="smartolt-token"
                    type="password"
                    autoComplete="new-password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="Token de acceso SmartOLT..."
                  />
                </div>
              </div>
              <DialogFooter>
                <CrmButton
                  onClick={() => void handleSave()}
                  disabled={isSaving || !apiKey || !baseUrl}>
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
                    <AlertDialogTitle>¿Desconectar SmartOLT?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta sucursal dejará de consultar diagnósticos ópticos y recibir alertas automáticas de puertos PON con estas credenciales.
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

type ClientImportView = {
  provider: "wispro" | "sae";
  status: "running" | "done" | "error";
  message: string;
  page: number;
  totalPages: number | null;
  created: number;
  updated: number;
  skipped: number;
  processed: number;
  errors: string[];
  activity: string[];
};

const emptyImportView = (provider: "wispro" | "sae"): ClientImportView => ({
  provider,
  status: "running",
  message: "Preparando la importación…",
  page: 0,
  totalPages: null,
  created: 0,
  updated: 0,
  skipped: 0,
  processed: 0,
  errors: [],
  activity: [],
});

const ClientImportDialog = ({
  view,
  onClose,
}: {
  view: ClientImportView | null;
  onClose: () => void;
}) => {
  const running = view?.status === "running";
  const label = view?.provider === "sae" ? "SAE" : "Wispro";
  const percent = !view
    ? 0
    : view.status !== "running"
      ? 100
      : view.totalPages
        ? Math.min(99, Math.round((view.page / view.totalPages) * 100))
        : Math.min(90, Math.max(8, view.page * 12));

  return (
    <Dialog
      open={Boolean(view)}
      onOpenChange={(open) => {
        if (!open && !running) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={!running}
        onInteractOutside={(event) => {
          if (running) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (running) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {running ? `Importando clientes de ${label}` : `Importación de ${label}`}
          </DialogTitle>
          <DialogDescription>{view?.message}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {view?.totalPages
                  ? `Página ${Math.max(view.page, 1)} de ${view.totalPages}`
                  : view?.page
                    ? `Página ${view.page}`
                    : "Esperando la primera página"}
              </span>
              <span>{view?.status === "running" && !view.totalPages ? "En curso" : `${percent}%`}</span>
            </div>
            <Progress
              value={percent}
              aria-label="Progreso de la importación de clientes"
            />
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-border/70 px-2 py-2">
              <p className="text-lg font-semibold tabular-nums">{view?.created ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">Nuevos</p>
            </div>
            <div className="rounded-lg border border-border/70 px-2 py-2">
              <p className="text-lg font-semibold tabular-nums">{view?.updated ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">Actualizados</p>
            </div>
            <div className="rounded-lg border border-border/70 px-2 py-2">
              <p className="text-lg font-semibold tabular-nums">{view?.skipped ?? 0}</p>
              <p className="text-[11px] text-muted-foreground">Omitidos</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {view?.processed
              ? `${view.processed} clientes revisados en ${label}.`
              : "Todavía no llega el primer lote."}
          </p>

          {view?.activity.length ? (
            <ul className="grid max-h-28 gap-1 overflow-y-auto text-xs text-muted-foreground">
              {view.activity.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
          ) : null}

          {view?.errors.length ? (
            <ul className="grid max-h-24 gap-1 overflow-y-auto text-xs text-rose-600 dark:text-rose-300">
              {view.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <DialogFooter>
          <CrmButton type="button" disabled={running} onClick={onClose}>
            {running ? "Importando…" : "Cerrar"}
          </CrmButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const IntegrationsSettingsSection = ({
  organization,
  organizationRole,
}: {
  organization?: Organization | null;
  organizationRole: OrganizationRole | null;
}) => {
  const [integrations, setIntegrations] = useState<Record<Provider, OrganizationIntegration>>({
    wispro: emptyIntegration("wispro"),
    smartolt: emptyIntegration("smartolt"),
    sae: emptyIntegration("sae"),
  });
  const canEdit = organizationRole === "owner" || organizationRole === "admin";
  const [clientImport, setClientImport] = useState<ClientImportView | null>(null);
  const importLock = useRef(false);

  const handleImportClients = (provider: "wispro" | "sae") => {
    if (importLock.current) return;
    importLock.current = true;
    const label = provider === "wispro" ? "Wispro" : "SAE";
    setClientImport(emptyImportView(provider));

    void runClientDirectorySync(provider, (progress: ClientDirectorySyncProgress) => {
      setClientImport((current) => {
        const base = current?.provider === provider ? current : emptyImportView(provider);
        const activity = progress.done
          ? base.activity
          : [...base.activity, progress.message].slice(-6);
        return {
          provider,
          status: progress.done ? "done" : "running",
          message: progress.message,
          page: progress.page,
          totalPages: progress.totalPages ?? base.totalPages,
          created: progress.created,
          updated: progress.updated,
          skipped: progress.skipped,
          processed: progress.processed,
          errors: progress.errors,
          activity,
        };
      });
    })
      .then((result) => {
        setClientImport((current) => ({
          ...(current || emptyImportView(provider)),
          status: "done",
          message: `Listo. ${result.created} nuevos, ${result.updated} actualizados y ${result.skipped} omitidos.`,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          processed: result.processed,
          errors: result.errors,
        }));
        toast.success(
          `${label}: ${result.created} clientes nuevos y ${result.updated} actualizados.`,
        );
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "No se importaron los clientes";
        setClientImport((current) => ({
          ...(current || emptyImportView(provider)),
          status: "error",
          message,
        }));
        toast.error(message);
      })
      .finally(() => {
        importLock.current = false;
      });
  };

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
    void loadIntegration("smartolt");
    void loadIntegration("sae");
  }, [loadIntegration]);

  const handleChanged = (integration: OrganizationIntegration) => {
    if (
      integration.provider !== "wispro" &&
      integration.provider !== "smartolt" &&
      integration.provider !== "sae"
    )
      return;
    setIntegrations((current) => ({
      ...current,
      [integration.provider]: integration,
    }));
  };

  return (
    <Card className={`rounded-2xl border-0 ${CRM_SURFACES.elevated}`}>
      <CardHeader>
        <CardTitle className="text-base">Canales e Integraciones</CardTitle>
        <p className={`text-sm ${CRM_SURFACES.textMuted}`}>
          Configura sistemas externos independientes para esta sucursal (Facturación ISP y Red Óptica).
        </p>
      </CardHeader>
      <CardContent className="grid gap-5">
        <WisproCard
          integration={integrations.wispro}
          canEdit={canEdit}
          isImporting={clientImport?.status === "running"}
          onChanged={handleChanged}
          onImportClients={handleImportClients}
        />
        <SaeCard
          integration={integrations.sae}
          canEdit={canEdit}
          isImporting={clientImport?.status === "running"}
          onChanged={handleChanged}
          onImportClients={handleImportClients}
        />
        <ClientImportDialog
          view={clientImport}
          onClose={() => setClientImport(null)}
        />
        <SmartOltCard
          organization={organization}
          integration={integrations.smartolt}
          canEdit={canEdit}
          onChanged={handleChanged}
        />
      </CardContent>
    </Card>
  );
};
