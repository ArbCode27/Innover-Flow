"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AGENT_STATUSES, CRM_STORAGE_KEY } from "../_lib/constants";
import { crmService } from "../_lib/crm-service";
import type {
  Agent,
  AgentStatus,
  Organization,
  OrganizationAccess,
  OrganizationRole,
} from "../_lib/types";

export const useCrmAuth = () => {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [organizationRole, setOrganizationRole] =
    useState<OrganizationRole | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationAccess[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    crmService
      .getCurrentSession()
      .then((session) => {
        if (!isMounted) return;
        persistAgent(session.agent);
        setOrganization(session.organization);
        setOrganizationRole(session.organizationRole);
        return crmService.getOrganizations();
      })
      .then((availableOrganizations) => {
        if (isMounted && availableOrganizations) {
          setOrganizations(availableOrganizations);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        persistAgent(null);
        setOrganization(null);
        setOrganizationRole(null);
        setOrganizations([]);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const persistAgent = (nextAgent: Agent | null) => {
    setAgent(nextAgent);
    if (!nextAgent) {
      window.localStorage.removeItem(CRM_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(CRM_STORAGE_KEY, JSON.stringify(nextAgent));
  };

  const login = async (email: string, password: string) => {
    setIsSubmitting(true);
    try {
      const loggedAgent = await crmService.loginAgent(email, password);
      const session = await crmService.getCurrentSession();
      persistAgent(session.agent || loggedAgent);
      setOrganization(session.organization);
      setOrganizationRole(session.organizationRole);
      setOrganizations(await crmService.getOrganizations());
      toast.success("Acceso correcto");
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Correo o contraseña incorrectos";
      toast.error(message);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const logout = async () => {
    if (agent) {
      await crmService
        .updateAgentStatus(agent.id, "offline", agent.organization_id)
        .catch(() => undefined);
    }
    await fetch("/api/crm/auth/logout", { method: "POST" }).catch(() => undefined);
    persistAgent(null);
    setOrganization(null);
    setOrganizationRole(null);
    setOrganizations([]);
  };

  const updateStatus = async () => {
    if (!agent) return;

    const currentIndex = AGENT_STATUSES.indexOf(agent.status);
    const nextStatus: AgentStatus =
      AGENT_STATUSES[(currentIndex + 1) % AGENT_STATUSES.length] || "online";

    await crmService.updateAgentStatus(
      agent.id,
      nextStatus,
      agent.organization_id,
    );
    const nextAgent = { ...agent, status: nextStatus };
    persistAgent(nextAgent);
    toast.info(`Estado actualizado: ${nextStatus}`);
  };

  const replaceAgent = (nextAgent: Agent) => persistAgent(nextAgent);
  const replaceOrganization = (nextOrganization: Organization) =>
    setOrganization(nextOrganization);
  const switchOrganization = async (organizationId: string) => {
    if (organizationId === organization?.id) return;
    await crmService.switchOrganization(organizationId);
    window.location.reload();
  };

  return {
    agent,
    organization,
    organizationRole,
    organizations,
    isLoading,
    isSubmitting,
    login,
    logout,
    updateStatus,
    replaceAgent,
    replaceOrganization,
    switchOrganization,
  };
};
