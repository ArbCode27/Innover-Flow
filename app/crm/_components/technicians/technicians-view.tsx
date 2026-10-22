"use client";

import type { OrganizationRole } from "../../_lib/types";
import { CRM_SURFACES } from "../../_lib/crm-theme";
import { TechniciansSettingsSection } from "../settings/technicians-settings-section";

interface TechniciansViewProps {
  organizationRole: OrganizationRole | null;
}

export const TechniciansView = ({ organizationRole }: TechniciansViewProps) => (
  <div className="crm-scrollbar min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
    <div className="mb-6">
      <h2
        className={`text-xl font-semibold md:text-2xl ${CRM_SURFACES.textPrimary}`}
      >
        Técnicos y supervisores
      </h2>
      <p className={`mt-1 text-sm ${CRM_SURFACES.textMuted}`}>
        Catálogo de campo: asigna tickets, habilita acceso a la app y marca
        supervisores. Contraseña de app = cédula (dígitos) + iniciales del
        nombre.
      </p>
    </div>

    <TechniciansSettingsSection
      organizationRole={organizationRole}
      hideIntro
    />
  </div>
);
