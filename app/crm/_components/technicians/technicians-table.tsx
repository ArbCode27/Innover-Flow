"use client";

import { Eye, HardHat, Pencil, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Technician } from "@/lib/field-tickets/types";
import { CRM_SURFACES, CRM_TABLE } from "../../_lib/crm-theme";
import { CrmButton } from "../shared/crm-button";
import { EmptyState } from "../shared/empty-state";

interface TechniciansTableProps {
  technicians: Technician[];
  canEdit: boolean;
  onView: (technician: Technician) => void;
  onEdit: (technician: Technician) => void;
  onDelete: (technician: Technician) => void;
}

export const TechniciansTable = ({
  technicians,
  canEdit,
  onView,
  onEdit,
  onDelete,
}: TechniciansTableProps) => {
  if (technicians.length === 0) {
    return (
      <div className={CRM_TABLE}>
        <EmptyState
          icon={HardHat}
          title="No hay técnicos registrados"
          description="Crea un técnico o sincroniza desde Wispro para empezar."
        />
      </div>
    );
  }

  return (
    <div className={CRM_TABLE}>
      <div className="overflow-x-auto">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow className={`${CRM_SURFACES.border} hover:bg-transparent`}>
              <TableHead className={CRM_SURFACES.textMuted}>Nombre</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>
                Cédula / Doc
              </TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Teléfono</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>Rol</TableHead>
              <TableHead className={CRM_SURFACES.textMuted}>App</TableHead>
              <TableHead
                className={`text-right ${CRM_SURFACES.textMuted}`}
              >
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {technicians.map((technician) => (
              <TableRow
                key={technician.id}
                className={`${CRM_SURFACES.border} ${CRM_SURFACES.hover}`}
              >
                <TableCell>
                  <span
                    className={`font-medium ${CRM_SURFACES.textPrimary}`}
                  >
                    {technician.name}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {technician.document ? (
                    <span className="rounded bg-muted/50 px-1.5 py-0.5 text-foreground">
                      {technician.document}
                    </span>
                  ) : (
                    <span className={CRM_SURFACES.textMuted}>—</span>
                  )}
                </TableCell>
                <TableCell
                  className={`font-mono text-sm ${CRM_SURFACES.textMuted}`}
                >
                  {technician.phone || "—"}
                </TableCell>
                <TableCell>
                  {technician.isSupervisor ? (
                    <Badge variant="secondary">Supervisor</Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="bg-muted text-muted-foreground"
                    >
                      Técnico
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {technician.appEnabled === false ? (
                    <Badge
                      variant="secondary"
                      className="bg-muted text-muted-foreground border-border/40 text-[11px]"
                    >
                      Inactiva
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="border border-emerald-500/20 bg-emerald-500/10 text-[11px] text-emerald-600 dark:text-emerald-400"
                    >
                      Activa
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1.5">
                    <CrmButton
                      type="button"
                      variant="secondary"
                      className="h-8 px-2.5"
                      onClick={() => onView(technician)}
                      aria-label={`Ver ${technician.name}`}
                    >
                      <Eye className="size-3.5" aria-hidden="true" />
                      <span className="sr-only sm:not-sr-only sm:ml-1.5">
                        Ver
                      </span>
                    </CrmButton>
                    {canEdit ? (
                      <>
                        <CrmButton
                          type="button"
                          variant="secondary"
                          className="h-8 px-2.5"
                          onClick={() => onEdit(technician)}
                          aria-label={`Editar ${technician.name}`}
                        >
                          <Pencil className="size-3.5" aria-hidden="true" />
                          <span className="sr-only sm:not-sr-only sm:ml-1.5">
                            Editar
                          </span>
                        </CrmButton>
                        <CrmButton
                          type="button"
                          variant="secondary"
                          className="h-8 px-2.5 text-destructive hover:text-destructive"
                          onClick={() => onDelete(technician)}
                          aria-label={`Eliminar ${technician.name}`}
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                          <span className="sr-only sm:not-sr-only sm:ml-1.5">
                            Eliminar
                          </span>
                        </CrmButton>
                      </>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
