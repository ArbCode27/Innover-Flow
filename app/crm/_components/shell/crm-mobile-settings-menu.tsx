"use client";

import { useMemo } from "react";
import {
  Bot,
  MessageSquareQuote,
  Settings2,
  Tags,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CRM_MENU, CRM_MENU_ITEM, CRM_SURFACES } from "../../_lib/crm-theme";
import type { Agent, CrmView, OrganizationRole } from "../../_lib/types";
import { CrmButton } from "../shared/crm-button";
import { isViewAllowed } from "../../_lib/crm-permissions";

interface CrmMobileSettingsMenuProps {
  currentAgent?: Agent | null;
  organizationRole?: OrganizationRole | null;
  onSelectView: (view: CrmView) => void;
}

const SETTINGS_ITEMS: Array<{ id: CrmView; label: string; icon: typeof Users }> = [
  { id: "clients", label: "Clientes", icon: Users },
  { id: "payments", label: "Pagos", icon: Wallet },
  { id: "tickets", label: "Tickets", icon: Ticket },
  { id: "quick-replies", label: "Respuestas rápidas", icon: MessageSquareQuote },
  { id: "labels", label: "Etiquetas", icon: Tags },
  { id: "agents", label: "Agentes", icon: Bot },
  { id: "settings", label: "Ajustes", icon: Settings2 },
];

export const CrmMobileSettingsMenu = ({
  currentAgent,
  organizationRole,
  onSelectView,
}: CrmMobileSettingsMenuProps) => {
  const visibleItems = useMemo(
    () =>
      SETTINGS_ITEMS.filter((item) =>
        isViewAllowed(item.id, currentAgent, organizationRole),
      ),
    [currentAgent, organizationRole],
  );

  if (!visibleItems.length) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <CrmButton
          type="button"
          variant="secondary"
          size="icon"
          className="size-8 md:hidden"
          aria-label="Abrir opciones adicionales del CRM">
          <Settings2 className="size-4" aria-hidden="true" />
        </CrmButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={`w-48 ${CRM_MENU} ${CRM_SURFACES.textPrimary}`}>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={item.id}
              onClick={() => onSelectView(item.id)}
              className={CRM_MENU_ITEM}>
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
