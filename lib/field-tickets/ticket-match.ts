export type TicketNameMatch = {
  publicId: number;
  clientName: string | null;
};

const PUBLIC_ID_RE = /#\s*(\d{4,})|\b(?:ticket|caso)\s*#?\s*(\d{4,})\b/i;

export const extractPublicIdFromText = (text: string | null | undefined) => {
  const raw = String(text || "");
  const match = raw.match(PUBLIC_ID_RE);
  if (!match) return null;
  const value = Number(match[1] || match[2]);
  return Number.isInteger(value) ? value : null;
};

export const matchTicketByPublicIdOrClientName = <T extends TicketNameMatch>(
  text: string | null | undefined,
  tickets: T[],
): T | null => {
  const raw = String(text || "").trim();
  if (!raw || !tickets.length) return null;

  const publicId = extractPublicIdFromText(raw);
  if (publicId != null) {
    const byId = tickets.filter((ticket) => ticket.publicId === publicId);
    if (byId.length === 1) return byId[0];
    return null;
  }

  const normalized = raw.toLowerCase();
  const byName = tickets.filter((ticket) => {
    const name = ticket.clientName?.trim().toLowerCase();
    return Boolean(name && name.length >= 3 && normalized.includes(name));
  });

  if (byName.length === 1) return byName[0];
  return null;
};
