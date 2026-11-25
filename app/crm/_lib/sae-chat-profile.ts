export type SaeChatProfileContact = {
  telefono?: string | null;
  telefonoMovil?: string | null;
};

export type SaeChatProfileAbonado = {
  cedula?: string | null;
  estadoContrato?: string | null;
  direccionServicio?: string | null;
  datosContacto?: SaeChatProfileContact | null;
};

export type SaeChatProfileSaldo = {
  saldoActual?: number | null;
};

export type SaeChatProfileServicio = {
  nombreServicio?: string | null;
  estadoServicio?: string | null;
};

export type SaeChatProfile = {
  source: "sae";
  cedula: string | null;
  phone: string | null;
  location: string | null;
  status: string | null;
  debt: number | null;
  hasDebt: boolean;
  plan: string | null;
};

const clean = (value: string | null | undefined) => {
  const text = String(value || "").trim();
  return text || null;
};

const compact = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export const saeContractStatusLabel = (estado: string | null | undefined) => {
  const text = clean(estado);
  if (!text) return null;
  const key = compact(text);
  if (key.includes("cort") || key.includes("susp")) return "Suspendido";
  if (key.includes("inactiv")) return "Inactivo";
  if (key.includes("activ")) return "Activo";
  return text;
};

const isActiveService = (estado: string | null | undefined) => {
  const key = compact(String(estado || ""));
  if (!key) return false;
  return key.includes("activ") && !key.includes("inactiv");
};

const planFromServices = (servicios: SaeChatProfileServicio[]) => {
  const named = servicios
    .map((servicio) => ({
      name: clean(servicio.nombreServicio),
      active: isActiveService(servicio.estadoServicio),
    }))
    .filter((servicio) => servicio.name);
  const active = named.filter((servicio) => servicio.active);
  const chosen = (active.length ? active : named).slice(0, 2);
  if (!chosen.length) return null;
  return chosen.map((servicio) => servicio.name).join(" · ");
};

export const mapSaeChatProfile = (input: {
  abonado: SaeChatProfileAbonado | null;
  saldo: SaeChatProfileSaldo | null;
  servicios: SaeChatProfileServicio[];
}): SaeChatProfile => {
  const abonado = input.abonado;
  const contacto = abonado?.datosContacto;
  const debt = Number(input.saldo?.saldoActual);
  const hasAmount = Number.isFinite(debt);

  return {
    source: "sae",
    cedula: clean(abonado?.cedula),
    phone: clean(contacto?.telefonoMovil) || clean(contacto?.telefono),
    location: clean(abonado?.direccionServicio),
    status: saeContractStatusLabel(abonado?.estadoContrato),
    debt: hasAmount ? debt : null,
    hasDebt: hasAmount && debt > 0,
    plan: planFromServices(input.servicios),
  };
};
