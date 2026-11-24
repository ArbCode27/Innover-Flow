import type { SupabaseClient } from "@supabase/supabase-js";
import {
  matchSaeCuentas,
  pickSaeContract,
  readSaePaymentSnapshot,
  type SaeCuentaBancaria,
} from "@/lib/sae-cuentas";
import type { CrmPayment } from "./crm-payments";
import { isIntegrationConnected } from "./organization-integrations";
import {
  getOrganizationSaeConfig,
  getSaeCuentasBancarias,
  postSaePagoConciliado,
  postSaePagoReporte,
  SaeApiError,
  searchSaeAbonados,
} from "./sae-api";

export class SaePaymentSyncError extends Error {
  readonly status: number;
  readonly payment?: CrmPayment;

  constructor(message: string, status = 400, payment?: CrmPayment) {
    super(message);
    this.name = "SaePaymentSyncError";
    this.status = status;
    this.payment = payment;
  }
}

const positiveAmount = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0
      ? Math.round((value + Number.EPSILON) * 100) / 100
      : null;
  }
  if (typeof value !== "string") return null;
  const parsed = Number.parseFloat(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round((parsed + Number.EPSILON) * 100) / 100
    : null;
};

const readMonto = (payment: CrmPayment) => {
  const meta = payment.receipt_metadata || {};
  return (
    positiveAmount(meta.amount_bs) ??
    positiveAmount(payment.amount_raw) ??
    positiveAmount(payment.amount)
  );
};

const readCambio = (payment: CrmPayment) => {
  const meta = payment.receipt_metadata || {};
  const raw = meta.cambio ?? meta.bcv_rate;
  const text = String(raw ?? "").trim();
  return text || null;
};

const readPaymentFacts = (payment: CrmPayment) => {
  const monto = readMonto(payment);
  const referencia = String(payment.transaction_code || "").trim();
  const fecha = String(payment.payment_date || "").slice(0, 10);
  const cedula = String(payment.cedula || "").replace(/\D/g, "");
  return { monto, referencia, fecha, cedula };
};

const isReadyToReport = (payment: CrmPayment) => {
  const facts = readPaymentFacts(payment);
  return Boolean(
    facts.monto &&
      facts.referencia &&
      facts.cedula &&
      /^\d{4}-\d{2}-\d{2}$/.test(facts.fecha),
  );
};

const blockedStatus = (payment: CrmPayment) =>
  payment.status === "RECHAZADO" || payment.status === "DUPLICADO";

const reloadPayment = async (supabase: SupabaseClient, paymentId: string) => {
  const { data, error } = await supabase
    .from("crm_payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle<CrmPayment>();
  if (error) throw new Error(error.message);
  if (!data) throw new SaePaymentSyncError("No se encontró el pago", 404);
  return data;
};

const writeSaeMetadata = async (
  supabase: SupabaseClient,
  paymentId: string,
  patch: Record<string, unknown>,
) => {
  const { data: row, error: readError } = await supabase
    .from("crm_payments")
    .select("receipt_metadata")
    .eq("id", paymentId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  const current =
    row?.receipt_metadata && typeof row.receipt_metadata === "object"
      ? (row.receipt_metadata as Record<string, unknown>)
      : {};

  const { error } = await supabase
    .from("crm_payments")
    .update({
      receipt_metadata: {
        ...current,
        ...patch,
      },
    })
    .eq("id", paymentId);
  if (error) throw new Error(error.message);
  return reloadPayment(supabase, paymentId);
};

const loadSaeConfig = async (organizationId: string) => {
  try {
    return await getOrganizationSaeConfig(organizationId);
  } catch (error) {
    throw new SaePaymentSyncError(
      error instanceof Error ? error.message : "La facturación no está conectada",
      409,
    );
  }
};

const saeErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof SaeApiError || error instanceof Error) return error.message;
  return fallback;
};

/**
 * Registra el comprobante en SAE (`/v1/pagos/reportes`).
 * No vuelve a enviarlo si ya existe `sae_registro_at`.
 * Sin `force`, un pendiente o un error previo no se reintenta solo.
 */
export const registerSaePayment = async (
  supabase: SupabaseClient,
  payment: CrmPayment,
  options?: { force?: boolean; cuenta?: SaeCuentaBancaria | null },
): Promise<CrmPayment> => {
  const snapshot = readSaePaymentSnapshot(payment.receipt_metadata);
  if (snapshot.conciliadoAt || snapshot.stage === "conciliada") return payment;
  if (snapshot.registroAt) return payment;
  if (
    !options?.force &&
    (snapshot.stage === "pendiente_contrato" ||
      snapshot.stage === "pendiente_cuenta" ||
      snapshot.stage === "error")
  ) {
    return payment;
  }
  if (blockedStatus(payment)) {
    throw new SaePaymentSyncError("Este pago no se puede registrar", 409);
  }
  if (!isReadyToReport(payment)) {
    throw new SaePaymentSyncError(
      "Faltan monto, referencia, fecha o cédula para registrar el pago",
    );
  }

  const facts = readPaymentFacts(payment);
  const config = await loadSaeConfig(payment.organization_id);
  const attemptAt = new Date().toISOString();

  let idContrato = snapshot.idContrato;
  let abonadoId = snapshot.abonadoId;
  if (!idContrato) {
    const found = await searchSaeAbonados(config, {
      cedula: payment.cedula,
      limit: 20,
    });
    const picked = pickSaeContract(found.data || [], payment.cedula || "");
    if (!picked) {
      return writeSaeMetadata(supabase, payment.id, {
        sae_stage: "pendiente_contrato",
        sae_registro_attempt_at: attemptAt,
        sae_registro_result: null,
        sae_registro_error:
          (found.data || []).length > 1
            ? "Hay más de un contrato para esta cédula. No se registró el pago."
            : "No se encontró un contrato para esta cédula.",
      });
    }
    idContrato = picked.idContrato;
    abonadoId = picked.abonadoId;
  }

  let cuenta = options?.cuenta ?? null;
  if (!cuenta) {
    const catalog = await getSaeCuentasBancarias(config);
    if (snapshot.idCuba) {
      cuenta = catalog.find((item) => item.id_cuba === snapshot.idCuba) ?? null;
    }
    if (!cuenta) {
      const matches = matchSaeCuentas(payment.bank, catalog);
      if (matches.length === 1) {
        cuenta = matches[0];
      } else {
        return writeSaeMetadata(supabase, payment.id, {
          sae_stage: "pendiente_cuenta",
          sae_id_contrato: idContrato,
          sae_abonado_id: abonadoId,
          sae_registro_attempt_at: attemptAt,
          sae_registro_result: null,
          sae_registro_error:
            matches.length > 1
              ? "Hay varias cuentas de ese banco. Elige la cuenta al conciliar."
              : "Ninguna cuenta coincide con el banco del comprobante. Elige la cuenta al conciliar.",
        });
      }
    }
  }

  try {
    const response = await postSaePagoReporte(config, {
      id_contrato: idContrato,
      id_cuba: cuenta.id_cuba,
      monto: facts.monto!,
      referencia: facts.referencia,
      fecha: facts.fecha,
      observacion: `Registrado CRM #${payment.id.slice(0, 8)}`,
      cambio: readCambio(payment),
      telefono: payment.phone_id
        ? String(payment.phone_id).trim().slice(0, 30)
        : null,
    });

    return writeSaeMetadata(supabase, payment.id, {
      sae_stage: "registrada",
      sae_id_contrato: idContrato,
      sae_abonado_id: abonadoId,
      sae_id_cuba: cuenta.id_cuba,
      sae_registro_id_cuba: cuenta.id_cuba,
      sae_banco: cuenta.banco,
      sae_numero_cuenta: cuenta.numero_cuenta,
      sae_registro_at: new Date().toISOString(),
      sae_registro_attempt_at: attemptAt,
      sae_registro_result: response.data?.resultado || "ok",
      sae_registro_error: null,
    });
  } catch (error) {
    return writeSaeMetadata(supabase, payment.id, {
      sae_stage: "error",
      sae_id_contrato: idContrato,
      sae_abonado_id: abonadoId,
      sae_id_cuba: cuenta.id_cuba,
      sae_banco: cuenta.banco,
      sae_numero_cuenta: cuenta.numero_cuenta,
      sae_registro_attempt_at: attemptAt,
      sae_registro_error: saeErrorMessage(
        error,
        "No se pudo registrar el pago",
      ),
    });
  }
};

/** Alta automática: solo si la organización tiene SAE conectado. No rompe el guardado del CRM. */
export const syncSaeRegistrationIfConnected = async (
  supabase: SupabaseClient,
  payment: CrmPayment,
) => {
  if (blockedStatus(payment) || payment.status === "APROBADO") return payment;
  if (!isReadyToReport(payment)) return payment;

  try {
    const connected = await isIntegrationConnected(
      supabase,
      payment.organization_id,
      "sae",
    );
    if (!connected) return payment;
    return await registerSaePayment(supabase, payment);
  } catch (error) {
    console.warn("[SAE_PAYMENT] register_soft_failed", {
      paymentId: payment.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return payment;
  }
};

/**
 * Concilia un pago ya guardado. Si todavía no está registrado en SAE,
 * primero lo reporta con la cuenta elegida del catálogo.
 */
export const conciliateSaePayment = async (
  supabase: SupabaseClient,
  payment: CrmPayment,
  idCuba: string,
) => {
  if (blockedStatus(payment)) {
    throw new SaePaymentSyncError("Este pago no se puede conciliar", 409);
  }

  const initial = readSaePaymentSnapshot(payment.receipt_metadata);
  if (initial.conciliadoAt || initial.stage === "conciliada") return payment;

  const config = await loadSaeConfig(payment.organization_id);
  const catalog = await getSaeCuentasBancarias(config);
  const cuenta = catalog.find((item) => item.id_cuba === idCuba.trim());
  if (!cuenta) {
    throw new SaePaymentSyncError(
      "La cuenta elegida no está en el catálogo",
    );
  }

  let current = payment;
  if (!readSaePaymentSnapshot(current.receipt_metadata).registroAt) {
    current = await registerSaePayment(supabase, current, {
      force: true,
      cuenta,
    });
    const afterRegister = readSaePaymentSnapshot(current.receipt_metadata);
    if (!afterRegister.registroAt) {
      throw new SaePaymentSyncError(
        afterRegister.error || "El pago no quedó registrado",
        409,
        current,
      );
    }
  }

  const facts = readPaymentFacts(current);
  const idContrato = readSaePaymentSnapshot(current.receipt_metadata).idContrato;
  if (!facts.monto || !facts.referencia || !/^\d{4}-\d{2}-\d{2}$/.test(facts.fecha)) {
    throw new SaePaymentSyncError(
      "Faltan monto, referencia o fecha para conciliar el pago",
    );
  }
  if (!idContrato) {
    throw new SaePaymentSyncError("El pago no tiene contrato");
  }

  try {
    const response = await postSaePagoConciliado(config, {
      id_contrato: idContrato,
      id_cuba: cuenta.id_cuba,
      monto: facts.monto,
      referencia: facts.referencia,
      fecha: facts.fecha,
      observacion: `Conciliado CRM #${current.id.slice(0, 8)}`,
      cambio: readCambio(current),
    });

    return writeSaeMetadata(supabase, current.id, {
      sae_stage: "conciliada",
      sae_id_cuba: cuenta.id_cuba,
      sae_banco: cuenta.banco,
      sae_numero_cuenta: cuenta.numero_cuenta,
      sae_conciliado_at: new Date().toISOString(),
      sae_conciliado_result: response.data?.resultado || "ok",
      sae_conciliado_error: null,
    });
  } catch (error) {
    const message = saeErrorMessage(error, "No se pudo conciliar el pago");
    const updated = await writeSaeMetadata(supabase, current.id, {
      sae_stage: "error",
      sae_id_cuba: cuenta.id_cuba,
      sae_banco: cuenta.banco,
      sae_numero_cuenta: cuenta.numero_cuenta,
      sae_conciliado_error: message,
    });
    throw new SaePaymentSyncError(
      message,
      error instanceof SaeApiError ? error.status : 502,
      updated,
    );
  }
};
