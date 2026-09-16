"use client";

import {
  Check,
  EllipsisVertical,
  FileText,
  RotateCcw,
  Tag,
  UserCheck,
  UserPlus,
} from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { CrmButton } from "../shared/crm-button";
import { CRM_SURFACES } from "../../_lib/crm-theme";

interface ConversationActionsDrawerProps {
  isHumanMode: boolean;
  isResolving: boolean;
  canAssignAgent: boolean;
  assignLabel: string;
  onTakeControl: () => void;
  onReactivateBot: () => void;
  onResolve: () => void;
  onOpenLabels: () => void;
  onOpenNote: () => void;
  onOpenAssign: () => void;
}

export const ConversationActionsDrawer = ({
  isHumanMode,
  isResolving,
  canAssignAgent,
  assignLabel,
  onTakeControl,
  onReactivateBot,
  onResolve,
  onOpenLabels,
  onOpenNote,
  onOpenAssign,
}: ConversationActionsDrawerProps) => (
  <Drawer>
    <DrawerTrigger asChild>
      <CrmButton
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Abrir acciones de conversación">
        <EllipsisVertical className="size-4" aria-hidden="true" />
      </CrmButton>
    </DrawerTrigger>

    <DrawerContent className={`rounded-t-3xl ${CRM_SURFACES.elevatedTranslucent} ${CRM_SURFACES.textPrimary}`}>
      <DrawerHeader>
        <DrawerTitle className={CRM_SURFACES.textPrimary}>
          Acciones de conversación
        </DrawerTitle>
        <DrawerDescription className={CRM_SURFACES.textMuted}>
          Gestiona control, notas, etiquetas y seguimiento del cliente.
        </DrawerDescription>
      </DrawerHeader>

      <div className="grid gap-2 p-4 pt-0">
        {isHumanMode ? (
          <DrawerClose asChild>
            <CrmButton
              type="button"
              variant="violet"
              className="w-full justify-start"
              onClick={onReactivateBot}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Reactivar bot
            </CrmButton>
          </DrawerClose>
        ) : (
          <DrawerClose asChild>
            <CrmButton
              type="button"
              variant="danger"
              className="w-full justify-start"
              onClick={onTakeControl}>
              <UserCheck className="size-4" aria-hidden="true" />
              Tomar control
            </CrmButton>
          </DrawerClose>
        )}

        <DrawerClose asChild>
          <CrmButton
            type="button"
            variant="success"
            className="w-full justify-start"
            disabled={isResolving}
            onClick={onResolve}>
            <Check className="size-4" aria-hidden="true" />
            {isResolving ? "Archivando..." : "Resolver"}
          </CrmButton>
        </DrawerClose>

        <DrawerClose asChild>
          <CrmButton
            type="button"
            variant="secondary"
            className="w-full justify-start"
            onClick={onOpenLabels}>
            <Tag className="size-4" aria-hidden="true" />
            Editar etiquetas
          </CrmButton>
        </DrawerClose>

        <DrawerClose asChild>
          <CrmButton
            type="button"
            variant="secondary"
            className="w-full justify-start"
            onClick={onOpenNote}>
            <FileText className="size-4" aria-hidden="true" />
            Agregar nota
          </CrmButton>
        </DrawerClose>

        {canAssignAgent ? (
          <DrawerClose asChild>
            <CrmButton
              type="button"
              variant="secondary"
              className="w-full justify-start"
              onClick={onOpenAssign}>
              <UserPlus className="size-4" aria-hidden="true" />
              {assignLabel}
            </CrmButton>
          </DrawerClose>
        ) : null}
      </div>
    </DrawerContent>
  </Drawer>
);
