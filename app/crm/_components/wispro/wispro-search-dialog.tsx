"use client";

import { FormEvent, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CrmButton } from "../shared/crm-button";
import { LoadingState } from "../shared/loading-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CRM_DIALOG, CRM_BADGE_TONES, CRM_SURFACES } from "../../_lib/crm-theme";
import type { WisproCustomer, WisproSearchResult } from "../../_lib/types";
import { wisproService } from "../../_lib/wispro-service";
import { formatClientDebt } from "../../_lib/client-profile-utils";

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: string }).message);
  }

  return fallback;
};

export type WisproDialogMode = "link" | "relink";

interface WisproSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssociate: (result: WisproSearchResult) => Promise<void>;
  mode?: WisproDialogMode;
  currentLink?: {
    name: string;
    cedula?: string | null;
    wisproSnapshot?: WisproCustomer | null;
  } | null;
}

export const WisproSearchDialog = ({
  open,
  onOpenChange,
  onAssociate,
  mode = "link",
  currentLink = null,
}: WisproSearchDialogProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WisproSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isAssociating, setIsAssociating] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [pendingResult, setPendingResult] = useState<WisproSearchResult | null>(
    null,
  );

  const isRelink = mode === "relink";

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setError(null);
      setHasSearched(false);
      setIsSearching(false);
      setIsAssociating(false);
      setPendingResult(null);
    }
  }, [open]);

  const handleSearch = async (event?: FormEvent) => {
    event?.preventDefault();

    const normalized = query.trim();
    if (!normalized) {
      setError("Ingresa la cédula, RIF o el nombre");
      return;
    }

    const digits = normalized.replace(/\D/g, "");
    const isDocument = /^\d+$/.test(normalized.replace(/[\s.-]/g, "")) && digits.length >= 5;

    setIsSearching(true);
    setError(null);
    setResults([]);
    setHasSearched(false);

    try {
      const searchResults = isDocument
        ? await wisproService.search({ cedula: digits })
        : await wisproService.search({ name: normalized });
      setResults(searchResults);
      setHasSearched(true);

      if (!searchResults.length) {
        setError("No se encontró ningún cliente con esa búsqueda.");
      }
    } catch (searchError) {
      setError(getErrorMessage(searchError, "Error al consultar Wispro"));
    } finally {
      setIsSearching(false);
    }
  };

  const applyAssociate = async (result: WisproSearchResult) => {
    setIsAssociating(true);
    setError(null);

    try {
      await onAssociate(result);
      setPendingResult(null);
      onOpenChange(false);
    } catch (associateError) {
      setError(getErrorMessage(associateError, "No se pudo asociar el cliente"));
    } finally {
      setIsAssociating(false);
    }
  };

  const handleAssociateClick = (result: WisproSearchResult) => {
    if (isRelink) {
      setPendingResult(result);
      return;
    }
    void applyAssociate(result);
  };

  const currentCedula =
    currentLink?.cedula ||
    currentLink?.wisproSnapshot?.national_identification_number ||
    null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={CRM_DIALOG}>
          <DialogHeader>
            <DialogTitle>
              {isRelink ? "Cambiar vinculación Wispro" : "Buscar cliente en Wispro"}
            </DialogTitle>
            <DialogDescription className={CRM_SURFACES.textMuted}>
              {isRelink
                ? "Busca por cédula, RIF o nombre. El chat se mantiene; solo se actualiza la ficha Wispro."
                : "Consulta por cédula/RIF (solo números) o por nombre y asocia el resultado a la conversación activa."}
            </DialogDescription>
          </DialogHeader>

          {isRelink && currentLink ? (
            <div
              className={`rounded-2xl border px-3 py-2 text-xs ${CRM_SURFACES.border} ${CRM_SURFACES.input} ${CRM_SURFACES.textSecondary}`}>
              Vinculación actual:{" "}
              <span className={`font-medium ${CRM_SURFACES.textPrimary}`}>
                {currentLink.name}
              </span>
              {currentCedula ? ` · Doc. ${currentCedula}` : null}
            </div>
          ) : null}

          <form onSubmit={handleSearch} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="wispro-search"
                className={`text-xs font-medium uppercase tracking-wide ${CRM_SURFACES.textLabel}`}>
                Cédula, RIF o nombre
              </label>
              <div className="flex gap-2">
                <Input
                  id="wispro-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Ej: 29985885 o María Pérez"
                  autoComplete="off"
                  disabled={isSearching || isAssociating}
                  className={`${CRM_SURFACES.border} ${CRM_SURFACES.input} ${CRM_SURFACES.textPrimary}`}
                />
                <CrmButton
                  type="submit"
                  disabled={isSearching || isAssociating}
                  aria-label="Buscar en Wispro">
                  <Search className="size-4" aria-hidden="true" />
                  Buscar
                </CrmButton>
              </div>
            </div>
          </form>

          {isSearching ? <LoadingState label="Consultando Wispro..." /> : null}

          {error ? (
            <p className="text-sm text-red-600 dark:text-red-300" role="alert">
              {error}
            </p>
          ) : null}

          {results.length ? (
            <ul className="space-y-2" aria-label="Resultados de Wispro">
              {results.map((result) => (
                <li key={result.customer.id}>
                  <button
                    type="button"
                    disabled={isAssociating}
                    onClick={() => handleAssociateClick(result)}
                    className={`w-full rounded-2xl border p-3 text-left transition-colors disabled:opacity-60 ${CRM_SURFACES.border} ${CRM_SURFACES.card} ${CRM_SURFACES.hover} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-accent`}>
                    <p className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
                      {result.customer.name}
                    </p>
                    <p className={`mt-1 text-xs ${CRM_SURFACES.textMuted}`}>
                      Doc.: {result.customer.national_identification_number}
                      {result.customer.city || result.customer.state
                        ? ` · ${[result.customer.city, result.customer.state].filter(Boolean).join(", ")}`
                        : ""}
                    </p>
                    <p className={`mt-0.5 text-xs ${CRM_SURFACES.textMuted}`}>
                      Tel: {result.customer.phone_mobile || "No registrado"} · Zona:{" "}
                      {result.customer.zone_name || "—"}
                    </p>
                    <p className={`mt-0.5 text-xs ${CRM_SURFACES.textMuted}`}>
                      Deuda:{" "}
                      {result.invoicing.hasDebt
                        ? formatClientDebt(result.invoicing.debt)
                        : "Sin deuda"}
                      {" · "}
                      Estado: {result.invoicing.accountStatus}
                      {result.invoicing.serviceSuspended ? " (suspendido)" : ""}
                    </p>
                    <span
                      className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${CRM_BADGE_TONES.emerald}`}>
                      {isRelink ? "Haz clic para cambiar vinculación" : "Haz clic para asociar"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {hasSearched && !isSearching && !results.length && !error ? (
            <p className={`text-sm ${CRM_SURFACES.textMuted}`}>
              No se encontraron resultados para esa búsqueda.
            </p>
          ) : null}

          <DialogFooter>
            <CrmButton
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={isAssociating}>
              Cerrar
            </CrmButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingResult)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !isAssociating) setPendingResult(null);
        }}>
        <AlertDialogContent className={CRM_DIALOG}>
          <AlertDialogHeader>
            <AlertDialogTitle className={CRM_SURFACES.textPrimary}>
              ¿Reemplazar vinculación Wispro?
            </AlertDialogTitle>
            <AlertDialogDescription className={CRM_SURFACES.textMuted}>
              Vas a reemplazar{" "}
              <strong className={CRM_SURFACES.textPrimary}>
                {currentLink?.name || "la vinculación actual"}
                {currentCedula ? ` (${currentCedula})` : ""}
              </strong>{" "}
              por{" "}
              <strong className={CRM_SURFACES.textPrimary}>
                {pendingResult?.customer.name}
                {pendingResult
                  ? ` (${pendingResult.customer.national_identification_number})`
                  : ""}
              </strong>
              . El chat se mantiene; solo cambia la ficha Wispro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAssociating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isAssociating || !pendingResult}
              onClick={(event) => {
                event.preventDefault();
                if (pendingResult) void applyAssociate(pendingResult);
              }}>
              {isAssociating ? "Actualizando..." : "Confirmar cambio"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
