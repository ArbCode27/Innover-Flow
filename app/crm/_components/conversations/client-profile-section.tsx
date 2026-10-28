"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Plus, Radio, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { CRM_BADGE_TONES, CRM_DIALOG, CRM_SURFACES } from "../../_lib/crm-theme";
import {
  formatClientDebt,
  getAccountTextClass,
  parseClientEnvoicing,
  resolveActivePlanLabel,
} from "../../_lib/client-profile-utils";
import type { Client, ClientOnu, WisproCustomer } from "../../_lib/types";
import type { SmartOltOnuDetail } from "@/lib/smartolt";
import { AvatarInitials } from "../shared/avatar-initials";
import { CrmButton } from "../shared/crm-button";
import { LoadingState } from "../shared/loading-state";
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ClientProfileSectionProps {
  client: Client;
  wisproSnapshot?: WisproCustomer | null;
  onOpenWispro?: () => void;
  onUnlinkWispro?: () => void;
  isUnlinkingWispro?: boolean;
  onCreatePaymentPromise?: () => void;
  isCreatingPaymentPromise?: boolean;
}

const fieldClass = "space-y-1";

const ProfileField = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <div className={fieldClass}>
    <p className={`text-[11px] uppercase tracking-wide ${CRM_SURFACES.textLabel}`}>
      {label}
    </p>
    {children}
  </div>
);

export const ClientProfileSection = ({
  client,
  wisproSnapshot,
  onOpenWispro,
  onUnlinkWispro,
  isUnlinkingWispro = false,
  onCreatePaymentPromise,
  isCreatingPaymentPromise = false,
}: ClientProfileSectionProps) => {
  const [currentOnu, setCurrentOnu] = useState<ClientOnu | null>(client.onu ?? null);
  const [isRefreshingOnu, setIsRefreshingOnu] = useState(false);

  // Estados del modal para vincular o cambiar ONU
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [searchSn, setSearchSn] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [foundOnu, setFoundOnu] = useState<SmartOltOnuDetail | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCurrentOnu(client.onu ?? null);
  }, [client.id, client.onu]);

  const locationLabel = wisproSnapshot
    ? [wisproSnapshot.city, wisproSnapshot.state].filter(Boolean).join(", ")
    : null;
  const envoicingData = parseClientEnvoicing(client.envoicing);
  const activePlan = resolveActivePlanLabel({
    pppProfile: envoicingData?.pppProfile,
    planName: envoicingData?.planName,
    clientPlan: client.plan,
  });

  const handleRefreshLiveOnu = async () => {
    if (!currentOnu?.sn) return;
    setIsRefreshingOnu(true);

    try {
      const res = await fetch(
        `/api/crm/smartolt/search?sn=${encodeURIComponent(currentOnu.sn)}`,
      );
      const data = await res.json();

      if (!res.ok || !data.success || !data.onu) {
        toast.error(data.message || "No se pudo actualizar el estado de la ONU");
        return;
      }

      const freshOnu: SmartOltOnuDetail = data.onu;
      const parsedSignal = freshOnu.signal ? Number.parseFloat(freshOnu.signal) : null;

      // Persistir en base de datos
      await fetch("/api/crm/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "associateClientOnu",
          clientId: client.id,
          onu: {
            unique_external_id: freshOnu.unique_external_id,
            sn: freshOnu.sn,
            board: freshOnu.board,
            port: freshOnu.port,
            rx_signal: Number.isNaN(parsedSignal) ? null : parsedSignal,
            status: freshOnu.status,
          },
        }),
      });

      setCurrentOnu((prev) => ({
        ...prev,
        onu_external_id: freshOnu.unique_external_id,
        sn: freshOnu.sn,
        board: freshOnu.board,
        port: freshOnu.port,
        rx_signal: Number.isNaN(parsedSignal) ? null : parsedSignal,
        status: freshOnu.status,
      }));

      toast.success("Señal de Smart OLT actualizada", {
        description: `Board ${freshOnu.board}, Port ${freshOnu.port} · ${freshOnu.status} (${freshOnu.signal ? `${freshOnu.signal} dBm` : "N/D"})`,
      });
    } catch (err) {
      toast.error("Error al consultar Smart OLT", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsRefreshingOnu(false);
    }
  };

  const handleSearchOnu = async (e: FormEvent) => {
    e.preventDefault();
    const cleanSn = searchSn.trim().toUpperCase();
    if (!cleanSn) {
      setSearchError("Ingresa un número de serie (SN)");
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setFoundOnu(null);

    try {
      const res = await fetch(`/api/crm/smartolt/search?sn=${encodeURIComponent(cleanSn)}`);
      const data = await res.json();

      if (!res.ok || !data.success || !data.onu) {
        setSearchError(data.message || `No se encontró la ONU ${cleanSn} en Smart OLT`);
        return;
      }

      setFoundOnu(data.onu as SmartOltOnuDetail);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Error al consultar Smart OLT");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSaveOnu = async () => {
    if (!foundOnu) return;

    try {
      setIsSaving(true);
      const parsedSignal = foundOnu.signal ? Number.parseFloat(foundOnu.signal) : null;

      const res = await fetch("/api/crm/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "associateClientOnu",
          clientId: client.id,
          onu: {
            unique_external_id: foundOnu.unique_external_id,
            sn: foundOnu.sn,
            board: foundOnu.board,
            port: foundOnu.port,
            rx_signal: Number.isNaN(parsedSignal) ? null : parsedSignal,
            status: foundOnu.status,
          },
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "No se pudo vincular la ONU");
      }

      setCurrentOnu({
        onu_external_id: foundOnu.unique_external_id,
        sn: foundOnu.sn,
        board: foundOnu.board,
        port: foundOnu.port,
        rx_signal: Number.isNaN(parsedSignal) ? null : parsedSignal,
        status: foundOnu.status,
      });

      toast.success("ONU vinculada con éxito", {
        description: `Board ${foundOnu.board}, Port ${foundOnu.port} (${foundOnu.status})`,
      });

      setIsLinkModalOpen(false);
      setFoundOnu(null);
      setSearchSn("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al vincular la ONU");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <AvatarInitials
          name={client.name}
          initials={client.initials}
          color={client.color || "#4f8ef7"}
          bg={client.bg || "rgba(79,142,247,.15)"}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
            {client.name}
          </p>
          {client.wispro_id ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${CRM_BADGE_TONES.emerald}`}>
                Wispro
              </span>
              {onOpenWispro ? (
                <CrmButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={onOpenWispro}>
                  Cambiar vinculación
                </CrmButton>
              ) : null}
              {onUnlinkWispro ? (
                <CrmButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-rose-600 hover:text-rose-700 dark:text-rose-300"
                  disabled={isUnlinkingWispro}
                  onClick={onUnlinkWispro}>
                  {isUnlinkingWispro ? "Desvinculando..." : "Desvincular"}
                </CrmButton>
              ) : null}
            </div>
          ) : onOpenWispro ? (
            <CrmButton
              type="button"
              variant="secondary"
              size="sm"
              className="mt-1 h-7 px-2 text-[11px]"
              onClick={onOpenWispro}>
              Vincular Wispro
            </CrmButton>
          ) : null}
        </div>
      </div>

      {wisproSnapshot ? (
        <ProfileField label="Cédula">
          <p className={`font-mono text-sm ${CRM_SURFACES.textSecondary}`}>
            {wisproSnapshot.national_identification_number}
          </p>
        </ProfileField>
      ) : null}

      <ProfileField label="Teléfono">
        <p className={`font-mono text-sm ${CRM_SURFACES.textSecondary}`}>
          {client.phone || "—"}
        </p>
      </ProfileField>

      {locationLabel ? (
        <ProfileField label="Ubicación">
          <p className={`text-sm ${CRM_SURFACES.textSecondary}`}>{locationLabel}</p>
        </ProfileField>
      ) : null}

      <ProfileField label="Zona">
        <p className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
          {client.zone || "—"}
        </p>
      </ProfileField>

      <ProfileField label="Estado">
        <p
          className={`text-sm font-medium ${getAccountTextClass(client.account) || CRM_SURFACES.textPrimary}`}>
          {client.account || "—"}
        </p>
      </ProfileField>

      <ProfileField label="Deuda">
        <p
          className={`text-sm font-medium ${
            envoicingData?.hasDebt
              ? "text-red-700 dark:text-red-300"
              : CRM_SURFACES.textPrimary
          }`}>
          {envoicingData?.hasDebt
            ? formatClientDebt(envoicingData.debt)
            : "Sin deuda"}
        </p>
      </ProfileField>

      <ProfileField label="Plan">
        <p className={`text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
          {activePlan}
        </p>
      </ProfileField>

      {/* ================= DATOS DE RED / SMART OLT ================= */}
      <div className="pt-2 border-t border-border/40 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Radio className="size-3.5 text-emerald-500" />
            <span className={`text-[11px] font-semibold uppercase tracking-wide ${CRM_SURFACES.textLabel}`}>
              Datos OLT (Smart OLT)
            </span>
          </div>
          {currentOnu?.sn ? (
            <button
              type="button"
              onClick={handleRefreshLiveOnu}
              disabled={isRefreshingOnu}
              title="Refrescar estado y potencia en Smart OLT"
              className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 disabled:opacity-50 transition-colors">
              <RefreshCw className={cn("size-3", isRefreshingOnu && "animate-spin")} />
              <span>{isRefreshingOnu ? "Refrescando..." : "Refrescar"}</span>
            </button>
          ) : null}
        </div>

        {currentOnu ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <ProfileField label="Board (Tarjeta)">
                <p className={`font-mono text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
                  {currentOnu.board != null ? `Tarjeta ${currentOnu.board}` : "—"}
                </p>
              </ProfileField>

              <ProfileField label="Port (Puerto PON)">
                <p className={`font-mono text-sm font-semibold ${CRM_SURFACES.textPrimary}`}>
                  {currentOnu.port != null ? `Puerto ${currentOnu.port}` : "—"}
                </p>
              </ProfileField>

              <ProfileField label="Estado OLT">
                <div className="pt-0.5">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border",
                      currentOnu.status?.toLowerCase() === "online"
                        ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : currentOnu.status?.toLowerCase() === "los" || currentOnu.status?.toLowerCase() === "offline"
                          ? "border-red-500/30 bg-red-500/15 text-red-600 dark:text-red-400"
                          : "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400",
                    )}>
                    {currentOnu.status || "Desconocido"}
                  </span>
                </div>
              </ProfileField>

              <ProfileField label="Potencia RX">
                <p
                  className={cn(
                    "font-mono text-sm font-bold",
                    currentOnu.rx_signal != null
                      ? currentOnu.rx_signal < -27
                        ? "text-red-600 dark:text-red-400"
                        : currentOnu.rx_signal < -24
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      : CRM_SURFACES.textPrimary,
                  )}>
                  {currentOnu.rx_signal != null ? `${currentOnu.rx_signal} dBm` : "—"}
                </p>
              </ProfileField>
            </div>

            <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground border-t border-border/20">
              <span className="font-mono truncate" title={currentOnu.sn}>
                SN: {currentOnu.sn}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSearchSn(currentOnu.sn);
                  setIsLinkModalOpen(true);
                }}
                className="text-muted-foreground hover:text-foreground text-[11px] underline">
                Cambiar ONU
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/70 p-3 text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              Sin ONU vinculada en Smart OLT
            </p>
            <CrmButton
              type="button"
              variant="secondary"
              size="sm"
              className="w-full text-xs h-7"
              onClick={() => {
                setSearchSn("");
                setFoundOnu(null);
                setSearchError(null);
                setIsLinkModalOpen(true);
              }}>
              <Plus className="size-3 mr-1" />
              Vincular ONU
            </CrmButton>
          </div>
        )}
      </div>

      {client.wispro_id && onCreatePaymentPromise ? (
        <div className="space-y-1.5 pt-1">
          <CrmButton
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
            disabled={isCreatingPaymentPromise}
            onClick={onCreatePaymentPromise}
            aria-label="Crear promesa de pago por 48 horas en Wispro">
            {isCreatingPaymentPromise
              ? "Creando promesa..."
              : "Crear promesa 48h"}
          </CrmButton>
          <p className={`text-[11px] leading-snug ${CRM_SURFACES.textMuted}`}>
            Solo si el servicio está suspendido. No se notifica por el chat.
          </p>
        </div>
      ) : null}

      {/* ================= MODAL VINCULAR / CAMBIAR ONU ================= */}
      <Dialog open={isLinkModalOpen} onOpenChange={setIsLinkModalOpen}>
        <DialogContent className={`${CRM_DIALOG} w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-5`}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Radio className="size-4 text-emerald-500" />
              Vincular ONU a {client.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Busca el equipo por su Número de Serie (SN) para vincular Board, Port, Estado y Potencia.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSearchOnu} className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="search-onu-sn" className="text-xs">
                Número de Serie (SN)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="search-onu-sn"
                  value={searchSn}
                  onChange={(e) => setSearchSn(e.target.value.toUpperCase())}
                  placeholder="Ej. HWTC12345678"
                  className="font-mono uppercase text-sm"
                  disabled={isSearching || isSaving}
                />
                <CrmButton type="submit" disabled={isSearching || isSaving} size="sm">
                  <Search className="size-3.5 mr-1" />
                  Buscar
                </CrmButton>
              </div>
            </div>

            {isSearching ? <LoadingState label="Consultando Smart OLT..." /> : null}

            {searchError ? (
              <p className="text-xs text-red-500">{searchError}</p>
            ) : null}

            {foundOnu ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-foreground">
                    {foundOnu.sn}
                  </span>
                  <Badge variant="outline" className="border-emerald-500 text-emerald-600">
                    {foundOnu.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-muted-foreground pt-1">
                  <div>
                    Board: <strong className="text-foreground">{foundOnu.board}</strong>
                  </div>
                  <div>
                    Port PON: <strong className="text-foreground">{foundOnu.port}</strong>
                  </div>
                  <div>
                    Potencia:{" "}
                    <strong className="text-foreground">
                      {foundOnu.signal ? `${foundOnu.signal} dBm` : "N/D"}
                    </strong>
                  </div>
                  <div>
                    OLT ID:{" "}
                    <strong className="text-foreground">{foundOnu.olt_id || "1"}</strong>
                  </div>
                </div>
              </div>
            ) : null}

            <DialogFooter className="mt-4 flex flex-row justify-end gap-2">
              <CrmButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsLinkModalOpen(false)}>
                Cancelar
              </CrmButton>
              <CrmButton
                type="button"
                variant="success"
                size="sm"
                disabled={!foundOnu || isSaving}
                onClick={handleSaveOnu}>
                {isSaving ? "Guardando..." : "Guardar vinculación"}
              </CrmButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
