import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseSaeSecret,
  serializeSaeSecret,
  verifySae,
  searchSaeAbonados,
  postSaePagoReporte,
  postSaePagoConciliado,
  getSaeAbonadoSaldo,
  getSaeAbonadoServicios,
  getSaeAbonadoEstadoCuenta,
  type SaeConfig,
} from "./sae.ts";

describe("SAE Plus Secrets & Config", () => {
  it("serializa y deserializa credenciales JSON de SAE correctamente", () => {
    const creds = {
      apiToken: "tok_secret_12345",
      apiConnect: "EMP-9988",
    };
    const serialized = serializeSaeSecret(creds);
    const parsed = parseSaeSecret(serialized);

    assert.equal(parsed.apiToken, "tok_secret_12345");
    assert.equal(parsed.apiConnect, "EMP-9988");
  });

  it("tolera secretos legacy en texto plano como solo apiToken", () => {
    const plain = "tok_legacy_abcde";
    const parsed = parseSaeSecret(plain);

    assert.equal(parsed.apiToken, "tok_legacy_abcde");
    assert.equal(parsed.apiConnect, "");
  });
});

describe("SAE Plus API Client", () => {
  const fakeConfig: SaeConfig = {
    baseUrl: "https://apiservice.saeplus.com",
    apiToken: "test_token_xyz",
    apiConnect: "EMP_001",
    defaultMode: "reportes",
  };

  it("envía encabezados requeridos Api-Token y Api-Connect en verifySae", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      } as Response;
    }) as typeof fetch;

    try {
      const result = await verifySae(
        "token_123",
        "connect_456",
        "https://apiservice.saeplus.com/",
      );

      assert.equal(result.status, "connected");
      assert.equal(result.base_url, "https://apiservice.saeplus.com");
      assert.match(capturedUrl, /https:\/\/apiservice\.saeplus\.com\/v1\/abonados\?limit=1/);
      assert.equal(capturedHeaders["Api-Token"], "token_123");
      assert.equal(capturedHeaders["Api-Connect"], "connect_456");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("construye parámetros correctos al buscar abonados", async () => {
    let capturedUrl = "";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              abonadoId: "ABO-100",
              nroContrato: "20440",
              nombreAbonado: "JUAN PEREZ",
              cedula: "12345678",
              estadoContrato: "ACTIVO",
            },
          ],
        }),
      } as Response;
    }) as typeof fetch;

    try {
      const res = await searchSaeAbonados(fakeConfig, {
        cedula: "V-12.345.678",
        nombre: "Juan",
        nroContrato: "20440",
        limit: 10,
      });

      assert.equal(res.data.length, 1);
      assert.equal(res.data[0].abonadoId, "ABO-100");
      assert.match(capturedUrl, /cedula=12345678/);
      assert.match(capturedUrl, /nombre=Juan/);
      assert.match(capturedUrl, /nroContrato=20440/);
      assert.match(capturedUrl, /limit=10/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("envía reporte de pago a /v1/pagos/reportes con el body esperado", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> = {};

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body || "{}"));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            resultado: "ok",
            info: "Su pago está pendiente por conciliar",
          },
        }),
      } as Response;
    }) as typeof fetch;

    try {
      const res = await postSaePagoReporte(fakeConfig, {
        id_contrato: "20440",
        id_cuba: "1",
        monto: 1350.5,
        referencia: "0052147885",
        fecha: "2026-11-23",
        observacion: "QA-PRUEBA",
        cambio: "820.2753",
        telefono: "04120000000",
      });

      assert.equal(res.success, true);
      assert.equal(res.data.resultado, "ok");
      assert.match(capturedUrl, /\/v1\/pagos\/reportes$/);
      assert.equal(capturedBody.id_contrato, "20440");
      assert.equal(capturedBody.id_cuba, "1");
      assert.equal(capturedBody.monto, 1350.5);
      assert.equal(capturedBody.referencia, "0052147885");
      assert.equal(capturedBody.fecha, "2026-11-23");
      assert.equal(capturedBody.cambio, "820.2753");
      assert.equal(capturedBody.telefono, "04120000000");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("envía pago conciliado directo a /v1/pagos/conciliados", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> = {};

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body || "{}"));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            resultado: "ok",
            info: null,
          },
        }),
      } as Response;
    }) as typeof fetch;

    try {
      const res = await postSaePagoConciliado(fakeConfig, {
        id_contrato: "20440",
        id_cuba: "2",
        monto: 2377.85,
        referencia: "0077441258",
        fecha: "2026-11-23",
        observacion: "QA-Conciliado",
        cambio: "897.6566",
      });

      assert.equal(res.success, true);
      assert.equal(res.data.resultado, "ok");
      assert.match(capturedUrl, /\/v1\/pagos\/conciliados$/);
      assert.equal(capturedBody.id_contrato, "20440");
      assert.equal(capturedBody.id_cuba, "2");
      assert.equal(capturedBody.monto, 2377.85);
      assert.equal(capturedBody.referencia, "0077441258");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("consulta saldo consolidado de un abonado", async () => {
    let capturedUrl = "";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            abonadoId: "ABO-99",
            saldoActual: 45.2,
            suscripcion: 30,
            montoPendienteConciliar: 15.2,
            fechaCorte: "2026-11-30",
          },
        }),
      } as Response;
    }) as typeof fetch;

    try {
      const res = await getSaeAbonadoSaldo(fakeConfig, "ABO-99");
      assert.equal(res.data.abonadoId, "ABO-99");
      assert.equal(res.data.saldoActual, 45.2);
      assert.equal(res.data.montoPendienteConciliar, 15.2);
      assert.match(capturedUrl, /\/v1\/abonados\/ABO-99\/saldo$/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
