"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Bot,
  Building2,
  Check,
  ChartNoAxesCombined,
  Headphones,
  History,
  Inbox,
  Layers,
  MessageSquareQuote,
  LogOut,
  Plus,
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrmButton } from "../shared/crm-button";
import { CRM_MENU, CRM_MENU_ITEM, CRM_PANEL, CRM_SURFACES } from "../../_lib/crm-theme";
import { CRM_NAV_ITEMS } from "../../_lib/constants";
import {
  getFilteredNavItems,
  getMobilePrimaryNavItems,
} from "../../_lib/crm-permissions";
import type {
  Agent,
  CrmView,
  Organization,
  OrganizationAccess,
  OrganizationRole,
} from "../../_lib/types";
import { AvatarInitials } from "../shared/avatar-initials";
import { StatusBadge } from "../shared/status-badge";
import { CrmNavItem } from "./crm-nav-item";
import { CrmThemeToggle } from "./crm-theme-toggle";

interface CrmSidebarProps {
  agent: Agent;
  organization: Organization | null;
  organizations: OrganizationAccess[];
  organizationRole?: OrganizationRole | null;
  activeView: CrmView;
  myAssignedCount?: number;
  onSelectView: (view: CrmView) => void;
  onToggleStatus: () => void;
  onLogout: () => void;
  onSwitchOrganization: (organizationId: string) => Promise<void>;
  onCreateOrganization?: (name: string, slug?: string) => Promise<Organization | unknown>;
}

const icons = {
  dashboard: ChartNoAxesCombined,
  conversations: Headphones,
  "my-conversations": Inbox,
  history: History,
  "quick-replies": MessageSquareQuote,
  clients: Users,
  payments: Wallet,
  tickets: Ticket,
  labels: Tags,
  agents: Bot,
  settings: Settings2,
} as const;

const MOBILE_PRIMARY_NAV_ITEMS: CrmView[] = [
  "dashboard",
  "conversations",
  "my-conversations",
  "history",
];

export const CrmSidebar = ({
  agent,
  organization,
  organizations,
  organizationRole,
  activeView,
  myAssignedCount = 0,
  onSelectView,
  onToggleStatus,
  onLogout,
  onSwitchOrganization,
  onCreateOrganization,
}: CrmSidebarProps) => {
  const visibleNavItems = useMemo(
    () => getFilteredNavItems(agent, organizationRole),
    [agent, organizationRole],
  );
  const [isCreateOrgOpen, setIsCreateOrgOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [createError, setCreateError] = useState("");

  const handleOpenCreateOrg = () => {
    setNewOrgName("");
    setCreateError("");
    setIsCreateOrgOpen(true);
  };

  const handleCreateOrgSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newOrgName.trim()) return;

    if (!onCreateOrganization) {
      setCreateError("Función no disponible");
      return;
    }

    setIsCreatingOrg(true);
    setCreateError("");
    try {
      await onCreateOrganization(newOrgName.trim());
      setIsCreateOrgOpen(false);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Error creando la organización",
      );
    } finally {
      setIsCreatingOrg(false);
    }
  };

  return (
    <>
      <aside
        className={`hidden h-full min-h-0 w-16 shrink-0 flex-col items-center py-4 md:flex ${CRM_PANEL}`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="mb-5 flex size-10 items-center justify-center overflow-hidden rounded-2xl bg-crm-accent text-crm-accent-foreground outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-crm-accent shadow-sm"
              aria-label={`Organización actual: ${organization?.name || "sin seleccionar"}`}
              title={organization?.name || "Organización"}>
              {organization?.logo_url ? (
                <img
                  src={organization.logo_url}
                  alt={organization.name}
                  className="size-full object-cover"
                />
              ) : (
                <Layers className="size-5" aria-hidden="true" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className={`w-64 ${CRM_MENU}`}>
            <DropdownMenuLabel>Organizaciones</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {organizations.map((item) => (
              <DropdownMenuItem
                key={item.id}
                className={CRM_MENU_ITEM}
                onClick={() => void onSwitchOrganization(item.id)}>
                {item.logo_url ? (
                  <img
                    src={item.logo_url}
                    alt=""
                    className="size-4 rounded-full object-cover"
                  />
                ) : (
                  <Building2 className="size-4" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {item.id === organization?.id ? (
                  <Check className="size-4 text-crm-accent" aria-hidden="true" />
                ) : null}
              </DropdownMenuItem>
            ))}

            {onCreateOrganization ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className={`${CRM_MENU_ITEM} font-medium text-crm-accent hover:text-crm-accent`}
                  onClick={handleOpenCreateOrg}>
                  <Plus className="size-4" aria-hidden="true" />
                  <span>Crear nueva organización</span>
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Navegación CRM">
          {visibleNavItems.map((item) => (
            <CrmNavItem
              key={item.id}
              icon={icons[item.id]}
              label={item.label}
              view={item.id}
              isActive={activeView === item.id}
              badgeCount={item.id === "my-conversations" ? myAssignedCount : 0}
              onSelect={onSelectView}
            />
          ))}
        </nav>

        <div className="mt-auto flex flex-col items-center gap-2">
          <CrmThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-accent"
                title="Abrir menú de agente"
                aria-label="Abrir menú de agente">
                <AvatarInitials
                  name={agent.name}
                  initials={agent.initials}
                  color={agent.avatar_color}
                  bg={agent.avatar_bg}
                  size="md"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className={`w-60 ${CRM_MENU}`}>
              <DropdownMenuLabel>
                <span className={`block truncate text-sm font-medium ${CRM_SURFACES.textPrimary}`}>
                  {agent.name}
                </span>
                <span className="mt-1 flex items-center">
                  <StatusBadge status={agent.status} />
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-200 dark:bg-white/10" />
              <DropdownMenuItem onClick={onToggleStatus} className={CRM_MENU_ITEM}>
                Cambiar mi estado
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onLogout}
                className="cursor-pointer text-red-700 focus:bg-red-50 focus:text-red-900 dark:text-red-100 dark:focus:bg-red-950/60 dark:focus:text-white">
                <LogOut className="size-4" aria-hidden="true" />
                Salir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Modal para crear una nueva organización */}
      <Dialog open={isCreateOrgOpen} onOpenChange={setIsCreateOrgOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-5 text-crm-accent" aria-hidden="true" />
              Crear nueva organización
            </DialogTitle>
            <DialogDescription>
              Crea un espacio de trabajo aislado para otra empresa o sucursal. Los clientes,
              mensajes y ajustes serán completamente independientes.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateOrgSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-org-name" className="text-xs font-medium">
                Nombre de la organización o empresa
              </Label>
              <Input
                id="new-org-name"
                value={newOrgName}
                onChange={(event) => setNewOrgName(event.target.value)}
                placeholder="Ej. Distribuidora Central C.A."
                required
                autoFocus
                disabled={isCreatingOrg}
                className={`${CRM_SURFACES.border} ${CRM_SURFACES.input} ${CRM_SURFACES.textPrimary}`}
              />
            </div>

            {createError ? (
              <p
                className="rounded-lg bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-300"
                aria-live="polite">
                {createError}
              </p>
            ) : null}

            <DialogFooter className="gap-2 sm:gap-0">
              <CrmButton
                type="button"
                variant="secondary"
                onClick={() => setIsCreateOrgOpen(false)}
                disabled={isCreatingOrg}>
                Cancelar
              </CrmButton>
              <CrmButton
                type="submit"
                disabled={isCreatingOrg || !newOrgName.trim()}>
                {isCreatingOrg ? "Creando..." : "Crear y Acceder"}
              </CrmButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

interface CrmMobileNavProps {
  agent?: Agent | null;
  organizationRole?: OrganizationRole | null;
  activeView: CrmView;
  myAssignedCount?: number;
  onSelectView: (view: CrmView) => void;
}

export const CrmMobileNav = ({
  agent,
  organizationRole,
  activeView,
  myAssignedCount = 0,
  onSelectView,
}: CrmMobileNavProps) => {
  const primaryViews = useMemo(
    () => getMobilePrimaryNavItems(agent, organizationRole),
    [agent, organizationRole],
  );

  return (
    <nav
      className={`fixed inset-x-2 bottom-2 z-40 rounded-3xl px-2 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] pt-2 md:hidden ${CRM_PANEL}`}
      aria-label="Navegación móvil CRM">
      <div className="mx-auto flex max-w-screen-sm items-center justify-between gap-1">
        {primaryViews.map((view) => {
          const Icon = icons[view];
          const label = CRM_NAV_ITEMS.find((item) => item.id === view)?.label || view;
          const isActive = activeView === view;
          const badgeCount = view === "my-conversations" ? myAssignedCount : 0;

          return (
            <button
              key={view}
              type="button"
              onClick={() => onSelectView(view)}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] transition ${
                isActive
                  ? "bg-crm-accent-muted text-crm-accent-muted-foreground"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200"
              }`}>
              <Icon className="size-4" aria-hidden="true" />
              <span className="truncate">{label}</span>
              {badgeCount > 0 ? (
                <span
                  className="absolute right-3 top-1 flex min-w-4 items-center justify-center rounded-full bg-crm-accent px-1 text-[10px] font-semibold leading-4 text-crm-accent-foreground"
                  aria-hidden="true">
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
