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
import { CRM_DIALOG, CRM_SURFACES } from "../../_lib/crm-theme";
import { formatClientDocument } from "../../_lib/client-profile-utils";
import type { Client, Ticket } from "../../_lib/types";
import { CrmButton } from "../shared/crm-button";
import { StatusBadge } from "../shared/status-badge";

interface ClientDetailDialogProps {
  open: boolean;
  client: Client | null;
  tickets: Ticket[];
  onOpenChange: (open: boolean) => void;
  onEdit: (client: Client) => void;
}

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className="grid gap-0.5">
    <dt className={`text-xs ${CRM_SURFACES.textMuted}`}>{label}</dt>
    <dd className={`text-sm ${CRM_SURFACES.textPrimary}`}>{value}</dd>
  </div>
);

export const ClientDetailDialog = ({
  open,
  client,
  tickets,
  onOpenChange,
  onEdit,
}: ClientDetailDialogProps) => {
  if (!client) return null;

  const documentLabel = formatClientDocument(client.cedula) || "Sin documento";
  const openTickets = tickets.filter(
    (ticket) => ticket.client_id === client.id && ticket.status !== "Resuelto",
  );
  const appPassword =
    client.cedula?.trim() && client.name.trim()
      ? generateClientAppPassword(client.cedula, client.name)
      : null;
  const isAppEnabled = client.app_enabled !== false;

  const handleEdit = () => {
    onOpenChange(false);
    onEdit(client);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`sm:max-w-lg ${CRM_DIALOG}`}>
        <DialogHeader>
          <DialogTitle className={CRM_SURFACES.textPrimary}>{client.name}</DialogTitle>
          <DialogDescription className={CRM_SURFACES.textMuted}>
            Ficha del suscriptor en el CRM
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {client.account ? <StatusBadge status={client.account} /> : null}
          {isAppEnabled ? (
            <Badge
              variant="secondary"
              className="border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            >
              App habilitada
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              className="border-border/40 bg-muted text-muted-foreground"
            >
              App inactiva
            </Badge>
          )}
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <DetailRow label="Cédula / documento" value={documentLabel} />
          <DetailRow label="Teléfono" value={client.phone || "Sin teléfono"} />
          <DetailRow label="Plan" value={client.plan || "Sin plan"} />
          <DetailRow label="Zona" value={client.zone || "Sin zona"} />
          <DetailRow
            label="Tickets abiertos"
            value={
              openTickets.length
                ? `${openTickets.length} abierto${openTickets.length > 1 ? "s" : ""}`
                : "Ninguno"
            }
          />
          <DetailRow
            label="Clave de app"
            value={
              isAppEnabled
                ? appPassword || "Define cédula y nombre para generarla"
                : "Acceso deshabilitado"
            }
          />
          {client.onu?.sn ? (
            <DetailRow
              label="ONU"
              value={`${client.onu.sn}${
                client.onu.board != null && client.onu.port != null
                  ? ` · Board ${client.onu.board} / Puerto ${client.onu.port}`
                  : ""
              }${client.onu.status ? ` · ${client.onu.status}` : ""}`}
            />
          ) : null}
        </dl>

        <DialogFooter className="gap-2 sm:gap-0">
          <CrmButton type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cerrar
          </CrmButton>
          <CrmButton type="button" variant="primary" onClick={handleEdit}>
            Editar
          </CrmButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
