"use client";

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
import { CRM_DIALOG, CRM_SURFACES } from "../../_lib/crm-theme";

interface ResolveConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  isSubmitting: boolean;
  onConfirm: () => Promise<void>;
}

export const ResolveConversationDialog = ({
  open,
  onOpenChange,
  clientName,
  isSubmitting,
  onConfirm,
}: ResolveConversationDialogProps) => {
  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={CRM_DIALOG}>
        <AlertDialogHeader>
          <AlertDialogTitle className={CRM_SURFACES.textPrimary}>
            ¿Resolver conversación?
          </AlertDialogTitle>
          <AlertDialogDescription className={CRM_SURFACES.textMuted}>
            Se guardará el historial completo de la conversación con{" "}
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {clientName}
            </span>{" "}
            y se eliminarán los mensajes del chat activo. Esta acción no se puede
            deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={isSubmitting}
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
            className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500">
            {isSubmitting ? "Archivando..." : "Resolver y archivar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
