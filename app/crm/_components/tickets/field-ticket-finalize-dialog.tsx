"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CRM_DIALOG, CRM_SURFACES } from "../../_lib/crm-theme";
import type { FieldTicket } from "@/lib/field-tickets";

const schema = z.object({
  observation: z.string().trim().min(3, "La observación debe tener al menos 3 caracteres"),
});

interface FieldTicketFinalizeDialogProps {
  open: boolean;
  ticket: FieldTicket | null;
  onOpenChange: (open: boolean) => void;
  onFinalize: (id: string, observation: string) => Promise<FieldTicket | void>;
}

export const FieldTicketFinalizeDialog = ({
  open,
  ticket,
  onOpenChange,
  onFinalize,
}: FieldTicketFinalizeDialogProps) => {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { observation: "" },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!ticket) return;
    await onFinalize(ticket.id, values.observation);
    form.reset();
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={CRM_DIALOG}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              Finalizar {ticket ? `#${ticket.publicId}` : "ticket"}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-2">
            <Label htmlFor="field-ticket-observation">Observación / reporte de cierre</Label>
            <Textarea
              id="field-ticket-observation"
              className={`min-h-28 ${CRM_SURFACES.input}`}
              {...form.register("observation")}
            />
            {form.formState.errors.observation ? (
              <p className="text-xs text-rose-600">
                {form.formState.errors.observation.message}
              </p>
            ) : null}
          </div>
          <DialogFooter className="mt-5">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Cerrando..." : "Cerrar ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
