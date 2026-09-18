import type {
  Agent,
  AgentDepartment,
  AgentRole,
  CrmView,
  OrganizationRole,
} from "./types";
import { CRM_NAV_ITEMS } from "./constants";

export interface AgentPermissionContext {
  role?: AgentRole | null;
  department?: AgentDepartment | null;
  organizationRole?: OrganizationRole | null;
}

/**
 * Determina si el usuario tiene privilegios administrativos en la organización
 * (Administrador general, Propietario o Supervisor).
 */
export const isCrmAdmin = (
  agent?: Pick<Agent, "role"> | null,
  organizationRole?: OrganizationRole | null,
): boolean => {
  if (agent?.role === "admin") return true;
  if (
    organizationRole === "owner" ||
    organizationRole === "admin" ||
    organizationRole === "supervisor"
  ) {
    return true;
  }
  return false;
};

/**
 * Retorna las vistas permitidas para el perfil actual según su rol y departamento.
 */
export const getAllowedViews = (
  agent?: Pick<Agent, "role" | "department"> | null,
  organizationRole?: OrganizationRole | null,
): CrmView[] => {
  if (!agent) {
    return ["conversations", "my-conversations"];
  }

  // 1. Administradores: Acceso total a todas las herramientas
  if (isCrmAdmin(agent, organizationRole)) {
    return [
      "dashboard",
      "conversations",
      "my-conversations",
      "history",
      "quick-replies",
      "clients",
      "payments",
      "tickets",
      "labels",
      "agents",
      "settings",
    ];
  }

  const dept = agent.department || "soporte";

  // 2. Cobranza y Finanzas: Pagos, chats, clientes, historial y respuestas rápidas
  if (dept === "cobranza") {
    return [
      "payments",
      "conversations",
      "my-conversations",
      "clients",
      "history",
      "quick-replies",
    ];
  }

  // 3. Asesor Polivalente (General): Atención técnica y de pagos combinada
  if (dept === "general") {
    return [
      "conversations",
      "my-conversations",
      "history",
      "tickets",
      "payments",
      "clients",
      "quick-replies",
    ];
  }

  // 4. Soporte Técnico: Atención, tickets técnicos, diagnóstico de clientes e historial
  return [
    "conversations",
    "my-conversations",
    "history",
    "tickets",
    "clients",
    "quick-replies",
  ];
};

/**
 * Comprueba si una vista específica está autorizada para el asesor.
 */
export const isViewAllowed = (
  view: CrmView,
  agent?: Pick<Agent, "role" | "department"> | null,
  organizationRole?: OrganizationRole | null,
): boolean => {
  const allowed = getAllowedViews(agent, organizationRole);
  return allowed.includes(view);
};

/**
 * Retorna la vista inicial por defecto recomendada para el asesor al ingresar al CRM.
 */
export const getDefaultViewForAgent = (
  agent?: Pick<Agent, "role" | "department"> | null,
  organizationRole?: OrganizationRole | null,
): CrmView => {
  if (!agent) return "conversations";
  if (isCrmAdmin(agent, organizationRole)) {
    return "dashboard";
  }
  const dept = agent.department || "soporte";
  if (dept === "cobranza") {
    return "payments";
  }
  return "conversations";
};

/**
 * Retorna los items del menú lateral filtrados respetando el orden oficial de la navegación.
 */
export const getFilteredNavItems = (
  agent?: Pick<Agent, "role" | "department"> | null,
  organizationRole?: OrganizationRole | null,
): typeof CRM_NAV_ITEMS => {
  const allowed = new Set(getAllowedViews(agent, organizationRole));
  return CRM_NAV_ITEMS.filter((item) => allowed.has(item.id));
};

/**
 * Retorna las 4 vistas principales para la barra inferior en dispositivos móviles.
 */
export const getMobilePrimaryNavItems = (
  agent?: Pick<Agent, "role" | "department"> | null,
  organizationRole?: OrganizationRole | null,
): CrmView[] => {
  if (isCrmAdmin(agent, organizationRole)) {
    return ["dashboard", "conversations", "my-conversations", "history"];
  }

  const dept = agent?.department || "soporte";
  if (dept === "cobranza") {
    return ["payments", "conversations", "my-conversations", "history"];
  }

  return ["conversations", "my-conversations", "tickets", "history"];
};

/**
 * Permisos funcionales adicionales:
 */
export const canManageAgents = (
  agent?: Pick<Agent, "role"> | null,
  organizationRole?: OrganizationRole | null,
): boolean => isCrmAdmin(agent, organizationRole);

export const canManageSettings = (
  agent?: Pick<Agent, "role"> | null,
  organizationRole?: OrganizationRole | null,
): boolean => isCrmAdmin(agent, organizationRole);

export const canProcessPayments = (
  agent?: Pick<Agent, "role" | "department"> | null,
  organizationRole?: OrganizationRole | null,
): boolean => {
  if (isCrmAdmin(agent, organizationRole)) return true;
  return agent?.department === "cobranza" || agent?.department === "general";
};
