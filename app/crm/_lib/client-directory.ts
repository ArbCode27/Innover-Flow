import type { ClientAccountStatus } from "./types";
import { saeContractStatusLabel } from "./sae-chat-profile.ts";

export type DirectoryClient = {
  name: string;
  cedula: string | null;
  phone: string | null;
  zone: string | null;
  plan: string | null;
  account: ClientAccountStatus | null;
  wisproId: string | null;
};

export type LocalClientRef = {
  id: number;
  name: string;
  cedula: string | null;
  wispro_id: string | null;
  phone: string | null;
  plan: string | null;
  zone: string | null;
  account: string | null;
};

export const cedulaDigits = (value: string | null | undefined) =>
  String(value || "").replace(/\D/g, "");

export const normalizePersonName = (value: string | null | undefined) =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const clean = (value: unknown) => {
  const text = String(value || "").trim();
  return text || null;
};

export const accountFromSaeContract = (
  estado: string | null | undefined,
): ClientAccountStatus => {
  const label = saeContractStatusLabel(estado);
  if (label === "Suspendido" || label === "Inactivo") return "Suspendido";
  if (label === "Activo") return "Al día";
  return "Prospecto";
};

export const findDirectoryMatch = (
  locals: LocalClientRef[],
  incoming: Pick<DirectoryClient, "cedula" | "wisproId">,
): { match: LocalClientRef | null; conflict: boolean } => {
  const digits = cedulaDigits(incoming.cedula);
  const wisproId = incoming.wisproId?.trim() || "";
  const byWispro = wisproId
    ? locals.find((client) => client.wispro_id === wisproId) || null
    : null;
  const byCedula = digits
    ? locals.filter((client) => cedulaDigits(client.cedula) === digits)
    : [];

  if (byCedula.length > 1) return { match: null, conflict: true };
  const cedulaMatch = byCedula[0] || null;
  if (byWispro && cedulaMatch && byWispro.id !== cedulaMatch.id) {
    return { match: null, conflict: true };
  }
  return { match: byWispro || cedulaMatch, conflict: false };
};

const placeholder = (value: string | null | undefined) => {
  const text = clean(value);
  if (!text || text === "Sin asignar" || text === "—") return null;
  return text;
};

export const directoryPatch = (
  existing: LocalClientRef,
  incoming: DirectoryClient,
) => {
  const patch: Record<string, string | null> = {};
  const name = clean(incoming.name);
  if (name && name !== existing.name) patch.name = name;

  const phone = clean(incoming.phone);
  if (phone && !clean(existing.phone)) patch.phone = phone;

  const cedula = cedulaDigits(incoming.cedula);
  if (cedula && !cedulaDigits(existing.cedula)) patch.cedula = cedula;

  const wisproId = clean(incoming.wisproId);
  if (wisproId && !clean(existing.wispro_id)) patch.wispro_id = wisproId;

  const zone = placeholder(incoming.zone);
  if (zone && !placeholder(existing.zone)) patch.zone = zone;

  const plan = placeholder(incoming.plan);
  if (plan && !placeholder(existing.plan)) patch.plan = plan;

  if (
    incoming.account &&
    incoming.account !== "Prospecto" &&
    incoming.account !== existing.account
  ) {
    patch.account = incoming.account;
  }

  return patch;
};
