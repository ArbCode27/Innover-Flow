"use client";

import { FormEvent, useId, useState } from "react";
import { ArrowLeft, Check, Copy, KeyRound, Search, Smartphone } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { CRM_BADGE_TONES, CRM_DIALOG, CRM_SURFACES } from "../../_lib/crm-theme";
import type { CreateClientInput, WisproSearchResult } from "../../_lib/types";
import { generateClientAppPassword } from "@/lib/client-auth-utils";
import { wisproService } from "../../_lib/wispro-service";
import { formatClientDebt } from "../../_lib/client-profile-utils";
import { mapWisproToClientFields } from "../../_lib/wispro-client-fields";
import { LoadingState } from "../shared/loading-state";
import { StatusBadge } from "../shared/status-badge";

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateClient: (input: CreateClientInput) => Promise<void>;
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: string }).message);
  }
  return fallback;
};

export const ClientFormDialog = ({
  open,
  onOpenChange,
  onCreateClient,
}: ClientFormDialogProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WisproSearchResult[]>([]);
  const [selected, setSelected] = useState<WisproSearchResult | null>(null);
  const [manualPhone, setManualPhone] = useState("");
  const [appEnabled, setAppEnabled] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  const appSwitchId = useId();
  const selectedFields = selected
    ? mapWisproToClientFields(selected.customer, selected.invoicing)
    : null;
  const previewPhone = selectedFields?.phone || manualPhone.trim();
  const generatedPassword = selectedFields
    ? generateClientAppPassword(selectedFields.cedula, selectedFields.name)
    : "";

  const handleResetForm = () => {
    setQuery("");
    setResults([]);
    setSelected(null);
    setManualPhone("");
    setAppEnabled(true);
    setSearchError(null);
    setHasSearched(false);
    setHasCopied(false);
  };

  const handleDialogChange = (isOpen: boolean) => {
    if (!isOpen) {
      handleResetForm();
    }
    onOpenChange(isOpen);
  };

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = query.trim();
    if (!normalized) {
      setSearchError("Ingresa la cédula, RIF o el nombre");
      return;
    }

    const digits = normalized.replace(/\D/g, "");
    const isDocument =
      /^\d+$/.test(normalized.replace(/[\s.-]/g, "")) && digits.length >= 5;

    setIsSearching(true);
    setSearchError(null);
    setResults([]);
    setSelected(null);
    setHasSearched(false);

    try {
      const searchResults = isDocument
        ? await wisproService.search({ cedula: digits })
        : await wisproService.search({ name: normalized });
      setResults(searchResults);
      setHasSearched(true);
      if (!searchResults.length) {
        setSearchError("No se encontró ningún cliente con esa búsqueda.");
      }
    } catch (error) {
      setSearchError(getErrorMessage(error, "Error al consultar Wispro"));
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectResult = (result: WisproSearchResult) => {
    setSelected(result);
    setManualPhone("");
    setSearchError(null);
  };

  const handleCopyCredentials = async () => {
    if (!selectedFields || !generatedPassword) {
      toast.error("Selecciona un cliente de Wispro para generar las credenciales");
      return;
    }

    const textToCopy = [
      "Acceso a la App Móvil",
      `Usuario: ${selectedFields.cedula}`,
      `Contraseña: ${generatedPassword}`,
      previewPhone ? `Teléfono: ${previewPhone}` : null,
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !selectedFields) {
      toast.error("Busca y selecciona un cliente de Wispro");
      return;
    }

    if (!previewPhone) {
      toast.error("Wispro no trajo teléfono. Ingresa el número móvil");
      return;
    }

    try {
      setIsSubmitting(true);
      await onCreateClient({
        wispro_id: selected.customer.id,
        app_enabled: appEnabled,
        phone: selectedFields.phone ? undefined : manualPhone.trim(),
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
        <form onSubmit={selected ? handleSubmit : handleSearch}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="size-5 text-blue-500" aria-hidden="true" />
              Nuevo cliente
            </DialogTitle>
            <DialogDescription className={CRM_SURFACES.textMuted}>
              La ficha se toma de Wispro. Busca por cédula, RIF o nombre y
              confirma los datos antes de registrar.
            </DialogDescription>
          </DialogHeader>

          {!selected ? (
            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="client-wispro-search">Cédula, RIF o nombre</Label>
                <div className="flex gap-2">
                  <Input
                    id="client-wispro-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Ej. 28123456 o Carlos Pérez"
                    autoComplete="off"
                    disabled={isSearching}
                    className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`}
                  />
                  <CrmButton
                    type="submit"
                    disabled={isSearching}
                    aria-label="Buscar en Wispro">
                    <Search className="size-4" aria-hidden="true" />
                    Buscar
                  </CrmButton>
                </div>
              </div>

              {isSearching ? <LoadingState label="Consultando Wispro..." /> : null}

              {searchError ? (
                <p className="text-sm text-red-600 dark:text-red-300" role="alert">
                  {searchError}
                </p>
              ) : null}

              {results.length ? (
                <ul className="space-y-2" aria-label="Resultados de Wispro">
                  {results.map((result) => (
                    <li key={result.customer.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectResult(result)}
                        className={`w-full rounded-2xl border p-3 text-left transition-colors ${CRM_SURFACES.border} ${CRM_SURFACES.card} ${CRM_SURFACES.hover} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-accent`}>
                        <p className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
                          {result.customer.name}
                        </p>
                        <p className={`mt-1 text-xs ${CRM_SURFACES.textMuted}`}>
                          Doc.: {result.customer.national_identification_number}
                          {result.customer.zone_name
                            ? ` · ${result.customer.zone_name}`
                            : ""}
                        </p>
                        <p className={`mt-0.5 text-xs ${CRM_SURFACES.textMuted}`}>
                          Tel: {result.customer.phone_mobile || "No registrado"} ·
                          Deuda:{" "}
                          {result.invoicing.hasDebt
                            ? formatClientDebt(result.invoicing.debt)
                            : "Sin deuda"}
                        </p>
                        <span
                          className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${CRM_BADGE_TONES.emerald}`}>
                          Usar esta ficha
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {hasSearched && !isSearching && !results.length && !searchError ? (
                <p className={`text-sm ${CRM_SURFACES.textMuted}`}>
                  No se encontraron resultados para esa búsqueda.
                </p>
              ) : null}
            </div>
          ) : selectedFields ? (
            <div className="mt-5 space-y-4">
              <div className={`rounded-2xl border p-4 ${CRM_SURFACES.border} ${CRM_SURFACES.elevated}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
                      {selectedFields.name}
                    </p>
                    <p className={`mt-1 font-mono text-xs ${CRM_SURFACES.textMuted}`}>
                      V-{selectedFields.cedula}
                    </p>
                  </div>
                  <StatusBadge status={selectedFields.account} />
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className={`text-xs ${CRM_SURFACES.textMuted}`}>Plan / PPP</dt>
                    <dd className={`text-sm ${CRM_SURFACES.textSecondary}`}>
                      {selectedFields.plan}
                    </dd>
                  </div>
                  <div>
                    <dt className={`text-xs ${CRM_SURFACES.textMuted}`}>Zona</dt>
                    <dd className={`text-sm ${CRM_SURFACES.textSecondary}`}>
                      {selectedFields.zone}
                    </dd>
                  </div>
                  <div>
                    <dt className={`text-xs ${CRM_SURFACES.textMuted}`}>Teléfono Wispro</dt>
                    <dd className={`font-mono text-sm ${CRM_SURFACES.textSecondary}`}>
                      {selectedFields.phone || "No registrado"}
                    </dd>
                  </div>
                  <div>
                    <dt className={`text-xs ${CRM_SURFACES.textMuted}`}>Deuda</dt>
                    <dd className={`text-sm ${CRM_SURFACES.textSecondary}`}>
                      {selected.invoicing.hasDebt
                        ? formatClientDebt(selected.invoicing.debt)
                        : "Sin deuda"}
                    </dd>
                  </div>
                </dl>
              </div>

              {!selectedFields.phone ? (
                <div className="space-y-2">
                  <Label htmlFor="client-phone">Teléfono móvil</Label>
                  <Input
                    id="client-phone"
                    value={manualPhone}
                    onChange={(event) => setManualPhone(event.target.value)}
                    placeholder="Ej. 0412 1234567"
                    required
                    className={`${CRM_SURFACES.border} ${CRM_SURFACES.input}`}
                  />
                  <span className="text-xs text-muted-foreground">
                    Wispro no trajo teléfono. Es obligatorio para la app.
                  </span>
                </div>
              ) : null}

              <div className="rounded-lg border border-border/60 bg-muted/30 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label htmlFor={appSwitchId} className="cursor-pointer font-medium">
                      Permitir acceso a la App Móvil
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      El cliente entra con su cédula e iniciales autogeneradas.
                    </p>
                  </div>
                  <Switch
                    id={appSwitchId}
                    checked={appEnabled}
                    onCheckedChange={setAppEnabled}
                  />
                </div>

                {appEnabled ? (
                  <div className="mt-3.5 border-t border-border/50 pt-3">
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-2">
                        <KeyRound
                          className="mt-0.5 size-4 shrink-0 text-emerald-500"
                          aria-hidden="true"
                        />
                        <div>
                          <span className="block text-xs font-semibold text-foreground">
                            Contraseña autogenerada:
                          </span>
                          {generatedPassword ? (
                            <div className="mt-0.5 flex items-center gap-2">
                              <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-sm font-bold tracking-wider text-emerald-600 dark:text-emerald-400">
                                {generatedPassword}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                (Cédula + Iniciales)
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs italic text-muted-foreground">
                              La cédula de Wispro no es válida para generar clave
                            </span>
                          )}
                        </div>
                      </div>

                      {generatedPassword ? (
                        <button
                          type="button"
                          onClick={() => void handleCopyCredentials()}
                          className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-blue-600 transition-colors hover:underline dark:text-blue-400">
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
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <DialogFooter className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {selected ? (
              <CrmButton
                type="button"
                variant="secondary"
                onClick={() => setSelected(null)}
                disabled={isSubmitting}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                Cambiar cliente
              </CrmButton>
            ) : (
              <CrmButton
                type="button"
                variant="secondary"
                onClick={() => handleDialogChange(false)}
                disabled={isSearching}>
                Cancelar
              </CrmButton>
            )}
            {selected ? (
              <CrmButton type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Guardando..." : "Registrar cliente"}
              </CrmButton>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
