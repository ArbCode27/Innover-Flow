export const CRM_ACCENT_IDS = [
  "rose",
  "violet",
  "blue",
  "amber",
  "emerald",
  "teal",
] as const;

export type CrmAccentId = (typeof CRM_ACCENT_IDS)[number];

export const CRM_COLOR_MODES = ["light", "dark", "system"] as const;

export type CrmColorMode = (typeof CRM_COLOR_MODES)[number];

export const DEFAULT_CRM_ACCENT: CrmAccentId = "blue";
export const DEFAULT_CRM_COLOR_MODE: CrmColorMode = "system";

export const CRM_ACCENT_STORAGE_KEY = "crm-accent";

export const CRM_ACCENT_OPTIONS: ReadonlyArray<{
  id: CrmAccentId;
  label: string;
  description: string;
  swatch: string;
}> = [
  {
    id: "rose",
    label: "Rosa",
    description: "Pastel cálido, de bajo contraste",
    swatch: "#f2c6d4",
  },
  {
    id: "violet",
    label: "Lila",
    description: "Pastel violeta suave",
    swatch: "#d9c8ef",
  },
  {
    id: "blue",
    label: "Azul",
    description: "Pastel de Innover",
    swatch: "#c9d7f2",
  },
  {
    id: "amber",
    label: "Vainilla",
    description: "Pastel amarillo crema",
    swatch: "#f3e0b5",
  },
  {
    id: "emerald",
    label: "Menta",
    description: "Pastel de fibra y conexión",
    swatch: "#c5e8d6",
  },
  {
    id: "teal",
    label: "Agua",
    description: "Pastel teal telecom",
    swatch: "#c2e4e0",
  },
];

export const CRM_COLOR_MODE_OPTIONS: ReadonlyArray<{
  id: CrmColorMode;
  label: string;
}> = [
  { id: "light", label: "Claro" },
  { id: "dark", label: "Oscuro" },
  { id: "system", label: "Sistema" },
];

export const isCrmAccentId = (value: unknown): value is CrmAccentId =>
  typeof value === "string" &&
  CRM_ACCENT_IDS.includes(value as CrmAccentId);

export const isCrmColorMode = (value: unknown): value is CrmColorMode =>
  typeof value === "string" &&
  CRM_COLOR_MODES.includes(value as CrmColorMode);

export const parseCrmAccentId = (
  value: unknown,
  fallback: CrmAccentId = DEFAULT_CRM_ACCENT,
): CrmAccentId => (isCrmAccentId(value) ? value : fallback);

export const parseCrmColorMode = (
  value: unknown,
  fallback: CrmColorMode = DEFAULT_CRM_COLOR_MODE,
): CrmColorMode => (isCrmColorMode(value) ? value : fallback);

export const readStoredCrmAccent = (): CrmAccentId | null => {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(CRM_ACCENT_STORAGE_KEY);
    return isCrmAccentId(stored) ? stored : null;
  } catch {
    return null;
  }
};

export const persistCrmAccent = (accent: CrmAccentId) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CRM_ACCENT_STORAGE_KEY, accent);
  } catch {
    // Ignore quota / private mode.
  }
};

export const applyCrmAccentToDocument = (accent: CrmAccentId) => {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.crmAccent = accent;
};
