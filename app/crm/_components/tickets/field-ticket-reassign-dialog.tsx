"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CRM_DIALOG, CRM_SURFACES } from "../../_lib/crm-theme";
import type { Technician } from "@/lib/field-tickets";

const UNASSIGNED = "__none__";

interface FieldTicketReassignDialogProps {
  open: boolean;
  technicians: Technician[];
  count?: number;
  onOpenChange: (open: boolean) => void;
  onReassign: (employeeId: string | null) => Promise<void>;
}

export const FieldTicketReassignDialog = ({
  open,
  technicians,
  count = 1,
  onOpenChange,
  onReassign,
}: FieldTicketReassignDialogProps) => {
  const [employeeId, setEmployeeId] = useState(UNASSIGNED);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onReassign(employeeId === UNASSIGNED ? null : employeeId);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={CRM_DIALOG}>
        <DialogHeader>
          <DialogTitle>
            {count > 1 ? `Reasignar ${count} tickets` : "Reasignar ticket"}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger className={`w-full ${CRM_SURFACES.input}`}>
              <SelectValue placeholder="Técnico" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Sin asignar</SelectItem>
              {technicians.map((technician) => (
                <SelectItem key={technician.id} value={technician.id}>
                  {technician.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter className="mt-5">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? "Guardando..." : "Reasignar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
