"use client";

import { useEffect } from "react";
import {
  isCrmAccentId,
  parseCrmAccentId,
  parseCrmColorMode,
  type CrmAccentId,
} from "../../_lib/crm-accents";
import type { Agent } from "../../_lib/types";
import { useCrmAppearance } from "./crm-appearance-provider";

interface CrmAppearanceHydratorProps {
  agent: Agent | null;
  officeAccent?: CrmAccentId | null;
}

export const CrmAppearanceHydrator = ({
  agent,
  officeAccent,
}: CrmAppearanceHydratorProps) => {
  const { hydrate } = useCrmAppearance();

  useEffect(() => {
    hydrate({
      agentId: agent?.id ?? null,
      accent: isCrmAccentId(agent?.ui_accent) ? agent.ui_accent : null,
      mode: agent?.ui_mode ? parseCrmColorMode(agent.ui_mode) : null,
      officeAccent: parseCrmAccentId(officeAccent),
    });
  }, [
    agent?.id,
    agent?.ui_accent,
    agent?.ui_mode,
    hydrate,
    officeAccent,
  ]);

  return null;
};
