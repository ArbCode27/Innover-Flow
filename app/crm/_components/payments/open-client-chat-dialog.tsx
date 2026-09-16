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

export type OpenClientChatPrompt = {
  conversationId: number;
  clientName: string;
};

interface OpenClientChatDialogProps {
  open: boolean;
  prompt: OpenClientChatPrompt | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (prompt: OpenClientChatPrompt) => void;
}

export const OpenClientChatDialog = ({
  open,
  prompt,
  onOpenChange,
  onConfirm,
}: OpenClientChatDialogProps) => {
  const clientName = prompt?.clientName?.trim() || "el cliente";

  const handleConfirm = () => {
    if (!prompt) return;
    onConfirm(prompt);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={CRM_DIALOG}>
        <AlertDialogHeader>
          <AlertDialogTitle className={CRM_SURFACES.textPrimary}>
            Pago aprobado
          </AlertDialogTitle>
          <AlertDialogDescription className={CRM_SURFACES.textMuted}>
            El pago de{" "}
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {clientName}
            </span>{" "}
            se registró correctamente en Wispro. ¿Quieres abrir el chat del
            cliente?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Ahora no</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              handleConfirm();
            }}
            className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500">
            Ir al chat
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
