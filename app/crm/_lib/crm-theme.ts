/** CRM surface tokens — glass panels + light/dark pairs. */
export const CRM_SURFACES = {
  page: "crm-canvas text-slate-900 dark:text-slate-100",
  elevated: "crm-glass",
  elevatedTranslucent: "crm-glass-strong",
  input:
    "rounded-2xl border-white/50 bg-white/50 dark:border-white/10 dark:bg-white/[.06]",
  inputReadonly:
    "rounded-2xl border-white/40 bg-white/30 dark:border-white/10 dark:bg-white/[.04]",
  card: "crm-glass",
  border: "border-white/45 dark:border-white/10",
  divider: "divide-white/40 dark:divide-white/10",
  hover: "hover:bg-white/55 dark:hover:bg-white/[.06]",
  hoverStrong: "hover:bg-white/80 dark:hover:bg-white/10",
  textPrimary: "text-slate-900 dark:text-slate-100",
  textSecondary: "text-slate-600 dark:text-slate-300",
  textMuted: "text-slate-500 dark:text-slate-400",
  textLabel: "text-slate-500 dark:text-slate-600",
  textHeading: "text-slate-700 dark:text-slate-300",
  placeholder: "placeholder:text-slate-500",
} as const;

export const CRM_RADIUS = {
  panel: "rounded-3xl",
  card: "rounded-2xl",
  control: "rounded-2xl",
} as const;

export const CRM_PANEL = `crm-glass ${CRM_RADIUS.panel} overflow-hidden`;

export const CRM_TABLE = `overflow-hidden ${CRM_RADIUS.card} crm-glass`;

export const CRM_DIALOG =
  "crm-glass-strong rounded-3xl text-slate-900 dark:text-slate-100";

export const CRM_MENU =
  "crm-glass-strong rounded-2xl text-slate-900 dark:text-slate-100";

export const CRM_MENU_ITEM =
  "cursor-pointer rounded-2xl text-slate-700 focus:bg-white/70 focus:text-slate-900 dark:text-slate-200 dark:focus:bg-white/10 dark:focus:text-white";

/** Shared focus ring for interactive CRM controls (WCAG-visible focus). */
export const CRM_FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-accent focus-visible:ring-offset-2 focus-visible:ring-offset-transparent";

/** Brand accent surfaces — follow `data-crm-accent`, not hardcoded blue. */
export const CRM_BRAND = {
  solid:
    "bg-crm-accent text-crm-accent-foreground hover:bg-crm-accent-hover",
  muted: "bg-crm-accent-muted text-crm-accent-muted-foreground",
  text: "text-crm-accent",
  ring: "focus-visible:ring-crm-accent",
  navActive: "bg-crm-accent-muted text-crm-accent-muted-foreground",
  outgoingOnAccent: "text-crm-accent-foreground/80",
} as const;

/** Conversation list item states in the inbox sidebar. */
export const CRM_INBOX_ITEM = {
  active:
    "rounded-2xl border border-crm-accent/25 bg-crm-accent-muted/90",
  unread:
    "rounded-2xl border border-amber-200/60 bg-amber-50/70 dark:border-amber-400/20 dark:bg-amber-950/30",
  default: "rounded-2xl border border-transparent",
} as const;

export const CRM_HISTORY_ITEM = {
  active:
    "rounded-2xl border border-emerald-400/30 bg-emerald-50/80 dark:border-emerald-400/20 dark:bg-emerald-950/35",
  default: "rounded-2xl border border-transparent",
} as const;

export const CRM_BUBBLE = {
  outgoing:
    "rounded-3xl rounded-br-lg border border-crm-accent/70 bg-crm-accent/30 text-slate-900 backdrop-blur-md dark:border-crm-accent/50 dark:bg-crm-accent/20 dark:text-slate-100",
  incoming:
    "rounded-3xl rounded-bl-lg border border-slate-300/70 bg-white/40 text-slate-900 backdrop-blur-md dark:border-white/20 dark:bg-slate-800/40 dark:text-slate-100",
} as const;

/** Accessible badge tones for light and dark modes. */
export const CRM_BADGE_TONES = {
  blue: "border-blue-300/60 bg-blue-50/80 text-blue-800 dark:border-blue-500/40 dark:bg-blue-950/60 dark:text-blue-100",
  amber:
    "border-amber-300/60 bg-amber-50/80 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-100",
  emerald:
    "border-emerald-300/60 bg-emerald-50/80 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-100",
  red: "border-red-300/60 bg-red-50/80 text-red-800 dark:border-red-500/40 dark:bg-red-950/60 dark:text-red-100",
  violet:
    "border-violet-300/60 bg-violet-50/80 text-violet-900 dark:border-violet-500/40 dark:bg-violet-950/60 dark:text-violet-100",
  rose: "border-rose-300/60 bg-rose-50/80 text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/60 dark:text-rose-100",
  slate:
    "border-slate-300/60 bg-slate-100/80 text-slate-800 dark:border-slate-500/40 dark:bg-slate-900/60 dark:text-slate-200",
  neutral:
    "border-white/50 bg-white/40 text-slate-700 dark:border-white/15 dark:bg-white/5 dark:text-slate-200",
} as const;

export type CrmBadgeTone = keyof typeof CRM_BADGE_TONES;
