"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CRM_DIALOG, CRM_SURFACES } from "../../_lib/crm-theme";
import {
  buildMapsUrl,
  fieldTicketCategoryLabel,
  fieldTicketPriorityLabel,
  fieldTicketStatusLabel,
  type FieldTicket,
} from "@/lib/field-tickets";
import { formatCrmDate } from "../../_lib/formatters";

interface FieldTicketDetailDialogProps {
  open: boolean;
  ticket: FieldTicket | null;
  onOpenChange: (open: boolean) => void;
}

export const FieldTicketDetailDialog = ({
  open,
  ticket,
  onOpenChange,
}: FieldTicketDetailDialogProps) => {
  if (!ticket) return null;
  const maps = buildMapsUrl({
    mapsUrl: ticket.mapsUrl,
    latitude: ticket.latitude,
    longitude: ticket.longitude,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${CRM_DIALOG} max-h-[90vh] overflow-y-auto sm:max-w-lg`}>
        <DialogHeader>
          <DialogTitle>Ticket #{ticket.publicId}</DialogTitle>
        </DialogHeader>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className={CRM_SURFACES.textMuted}>Cliente</dt>
            <dd className={CRM_SURFACES.textPrimary}>
              {ticket.clientName || "Sin nombre"}
              {ticket.clientPhone ? ` · ${ticket.clientPhone}` : ""}
            </dd>
          </div>
          <div>
            <dt className={CRM_SURFACES.textMuted}>Categoría</dt>
            <dd>{fieldTicketCategoryLabel(ticket)}</dd>
          </div>
          <div>
            <dt className={CRM_SURFACES.textMuted}>Prioridad</dt>
            <dd>{fieldTicketPriorityLabel(ticket.priority)}</dd>
          </div>
          <div>
            <dt className={CRM_SURFACES.textMuted}>Estado</dt>
            <dd>{fieldTicketStatusLabel(ticket.status)}</dd>
          </div>
          <div>
            <dt className={CRM_SURFACES.textMuted}>Técnico</dt>
            <dd>{ticket.employeeName || "Sin asignar"}</dd>
          </div>
          <div>
            <dt className={CRM_SURFACES.textMuted}>Ventana</dt>
            <dd>
              {ticket.windowStart || ticket.windowEnd
                ? `${formatCrmDate(ticket.windowStart)} – ${formatCrmDate(ticket.windowEnd)}`
                : "Sin agendar"}
            </dd>
          </div>
          <div>
            <dt className={CRM_SURFACES.textMuted}>Ubicación</dt>
            <dd>
              {ticket.addressText || "Sin dirección"}
              {maps ? (
                <>
                  {" "}
                  <a
                    href={maps}
                    target="_blank"
                    rel="noreferrer"
                    className="text-crm-accent underline">
                    Maps
                  </a>
                </>
              ) : null}
            </dd>
          </div>
          {ticket.description ? (
            <div>
              <dt className={CRM_SURFACES.textMuted}>Descripción</dt>
              <dd className="whitespace-pre-wrap">{ticket.description}</dd>
            </div>
          ) : null}
          {ticket.cause ? (
            <div>
              <dt className={CRM_SURFACES.textMuted}>Causa</dt>
              <dd>{ticket.cause}</dd>
            </div>
          ) : null}
          {ticket.status === "done" && ticket.resolutionObservation ? (
            <div>
              <dt className={CRM_SURFACES.textMuted}>Observación de cierre</dt>
              <dd className="whitespace-pre-wrap">{ticket.resolutionObservation}</dd>
            </div>
          ) : null}
          {ticket.facadeMediaUrl ? (
            <div>
              <dt className={CRM_SURFACES.textMuted}>Fachada</dt>
              <dd>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ticket.facadeMediaUrl}
                  alt="Foto de fachada"
                  className="mt-2 max-h-56 rounded-xl object-cover"
                />
              </dd>
            </div>
          ) : null}
        </dl>
        <DialogFooter className="mt-5">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
