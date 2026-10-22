"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { generateClientAppPassword } from "@/lib/client-auth-utils";
import type { Technician } from "@/lib/field-tickets/types";
import { CRM_DIALOG, CRM_SURFACES } from "../../_lib/crm-theme";
import { CrmButton } from "../shared/crm-button";

interface TechnicianDetailDialogProps {
  open: boolean;
  technician: Technician | null;
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (technician: Technician) => void;
}

const DetailRow = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => (
  <div className="grid gap-0.5">
    <dt className={`text-xs ${CRM_SURFACES.textMuted}`}>{label}</dt>
    <dd className={`text-sm ${CRM_SURFACES.textPrimary}`}>{value}</dd>
  </div>
);

export const TechnicianDetailDialog = ({
  open,
  technician,
  canEdit,
  onOpenChange,
  onEdit,
}: TechnicianDetailDialogProps) => {
  if (!technician) return null;

  const appPassword =
    technician.document?.trim() && technician.name.trim()
      ? generateClientAppPassword(technician.document, technician.name)
      : null;

  const handleEdit = () => {
    onOpenChange(false);
    onEdit(technician);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`sm:max-w-md ${CRM_DIALOG}`}>
        <DialogHeader>
          <DialogTitle className={CRM_SURFACES.textPrimary}>
            {technician.name}
          </DialogTitle>
          <DialogDescription className={CRM_SURFACES.textMuted}>
            Detalle del técnico o supervisor de campo
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {technician.isSupervisor ? (
            <Badge variant="secondary">Supervisor</Badge>
          ) : (
            <Badge variant="secondary">Técnico</Badge>
          )}
          {technician.appEnabled === false ? (
            <Badge
              variant="secondary"
              className="bg-muted text-muted-foreground border-border/40"
            >
              App inactiva
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              className="border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            >
              App activa
            </Badge>
          )}
        </div>

        <dl className="grid gap-3">
          <DetailRow
            label="Cédula / documento"
            value={technician.document || "Sin documento"}
          />
          <DetailRow
            label="Teléfono"
            value={technician.phone || "Sin teléfono"}
          />
          <DetailRow
            label="Clave de app"
            value={
              appPassword ||
              "Define cédula y nombre para generar la clave automática"
            }
          />
        </dl>

        <DialogFooter className="gap-2 sm:gap-0">
          <CrmButton
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cerrar
          </CrmButton>
          {canEdit ? (
            <CrmButton type="button" variant="primary" onClick={handleEdit}>
              Editar
            </CrmButton>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
