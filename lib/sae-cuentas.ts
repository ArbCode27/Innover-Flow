export interface SaeCuentaBancaria {
  id_cuba: string;
  numero_cuenta: string;
  banco: string;
}

export const SAE_PAYMENT_STAGES = [
  "pendiente_contrato",
  "pendiente_cuenta",
  "registrada",
  "conciliada",
  "error",
] as const;

export type SaePaymentStage = (typeof SAE_PAYMENT_STAGES)[number];

export const SAE_STAGE_LABELS: Record<SaePaymentStage, string> = {
  pendiente_contrato: "Pendiente contrato",
  pendiente_cuenta: "Pendiente cuenta",
  registrada: "Registrado",
  conciliada: "Conciliado",
  error: "Error SAE",
};

export interface SaePaymentSnapshot {
  stage: SaePaymentStage | null;
  idContrato: string | null;
  abonadoId: string | null;
  idCuba: string | null;
  banco: string | null;
  numeroCuenta: string | null;
  registroAt: string | null;
  conciliadoAt: string | null;
  error: string | null;
}

export interface SaeContractPick {
  idContrato: string;
  abonadoId: string | null;
}

export interface SaeContractCandidate {
  abonadoId?: string | null;
  nroContrato?: string | null;
  cedula?: string | null;
  estadoContrato?: string | null;
}

const BANK_KEYS: Array<{ key: string; tokens: string[] }> = [
  { key: "VENEZUELA", tokens: ["BANCODEVENEZUELA", "VENEZUELA", "BDV"] },
  {
    key: "NACIONALDECREDITO",
    tokens: ["BANCONACIONALDECREDITO", "NACIONALDECREDITO", "BNC"],
  },
  { key: "MERCANTIL", tokens: ["MERCANTIL"] },
  { key: "BANCAMIGA", tokens: ["BANCAMIGA"] },
  { key: "BANPLUS", tokens: ["BANPLUS"] },
  { key: "BANESCO", tokens: ["BANESCO"] },
  { key: "PROVINCIAL", tokens: ["PROVINCIAL"] },
  { key: "BICENTENARIO", tokens: ["BICENTENARIO"] },
  { key: "EXTERIOR", tokens: ["EXTERIOR"] },
  { key: "TESORO", tokens: ["TESORO"] },
  { key: "BANCARIBE", tokens: ["BANCARIBE"] },
  { key: "FONDOCOMUN", tokens: ["FONDOCOMUN", "BFC"] },
  { key: "SOFITASA", tokens: ["SOFITASA"] },
  { key: "BANCOACTIVO", tokens: ["BANCOACTIVO"] },
  { key: "BANCOPLAZA", tokens: ["BANCOPLAZA"] },
];

const compactBank = (value: string | null | undefined) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const asText = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text || null;
};

const isSaeStage = (value: string | null): value is SaePaymentStage =>
  Boolean(value && SAE_PAYMENT_STAGES.includes(value as SaePaymentStage));

const isActiveContract = (estado: string) => {
  const compact = compactBank(estado);
  return compact.includes("ACTIV") && !compact.includes("INACTIV");
};

const asCuenta = (value: unknown): SaeCuentaBancaria | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const idCuba = String(row.id_cuba || "").trim();
  if (!idCuba) return null;
  return {
    id_cuba: idCuba,
    numero_cuenta: String(row.numero_cuenta || "").trim(),
    banco: String(row.banco || "").trim(),
  };
};

/**
 * Lee el catálogo de cuentas tal como lo devuelve SAE
 * (`data.info[]` con id_cuba, numero_cuenta y banco).
 */
export const parseSaeCuentasBancarias = (
  payload: unknown,
): SaeCuentaBancaria[] => {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : null;
  const list = [
    data?.info,
    data?.cuentas,
    root.info,
    root.data,
  ].find(Array.isArray) as unknown[] | undefined;

  const seen = new Set<string>();
  const cuentas: SaeCuentaBancaria[] = [];
  for (const item of list || []) {
    const cuenta = asCuenta(item);
    if (!cuenta || seen.has(cuenta.id_cuba)) continue;
    seen.add(cuenta.id_cuba);
    cuentas.push(cuenta);
  }
  return cuentas;
};

export const canonicalBankKey = (
  raw: string | null | undefined,
): string | null => {
  const compactValue = compactBank(raw);
  if (!compactValue) return null;
  const known = BANK_KEYS.find((group) =>
    group.tokens.some((token) => compactValue.includes(token)),
  );
  return known?.key ?? compactValue;
};

/** Cuentas del catálogo cuyo banco coincide con el banco receptor del comprobante. */
export const matchSaeCuentas = (
  bank: string | null | undefined,
  cuentas: SaeCuentaBancaria[],
): SaeCuentaBancaria[] => {
  const key = canonicalBankKey(bank);
  if (!key) return [];
  return cuentas.filter((cuenta) => canonicalBankKey(cuenta.banco) === key);
};

/**
 * Elige un solo contrato SAE para la cédula.
 * Si hay varios activos, no adivina.
 */
export const pickSaeContract = (
  items: SaeContractCandidate[],
  cedula: string,
): SaeContractPick | null => {
  const digits = cedula.replace(/\D/g, "");
  const withId = items
    .map((item) => ({
      abonadoId: String(item.abonadoId || "").trim() || null,
      idContrato: String(item.nroContrato || item.abonadoId || "").trim(),
      cedula: String(item.cedula || "").replace(/\D/g, ""),
      active: isActiveContract(String(item.estadoContrato || "")),
    }))
    .filter((item) => item.idContrato);

  const sameCedula = digits
    ? withId.filter((item) => item.cedula === digits)
    : [];
  const pool = sameCedula.length > 0 ? sameCedula : withId;
  const active = pool.filter((item) => item.active);
  const candidates = active.length > 0 ? active : pool.length === 1 ? pool : [];
  if (candidates.length !== 1) return null;

  return {
    idContrato: candidates[0].idContrato,
    abonadoId: candidates[0].abonadoId,
  };
};

export const readSaePaymentSnapshot = (
  metadata: Record<string, unknown> | null | undefined,
): SaePaymentSnapshot => {
  const meta = metadata || {};
  const registroAt = asText(meta.sae_registro_at);
  const conciliadoAt = asText(meta.sae_conciliado_at);
  const stored = asText(meta.sae_stage);
  let stage: SaePaymentStage | null = isSaeStage(stored) ? stored : null;
  if (conciliadoAt) stage = "conciliada";
  else if (registroAt) stage = "registrada";

  const error =
    stage === "conciliada"
      ? null
      : asText(meta.sae_conciliado_error) || asText(meta.sae_registro_error);

  return {
    stage,
    idContrato: asText(meta.sae_id_contrato),
    abonadoId: asText(meta.sae_abonado_id),
    idCuba: asText(meta.sae_id_cuba),
    banco: asText(meta.sae_banco),
    numeroCuenta: asText(meta.sae_numero_cuenta),
    registroAt,
    conciliadoAt,
    error,
  };
};
