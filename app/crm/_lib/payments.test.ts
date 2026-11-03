import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPaymentBankStats,
  getReceptorBankMeta,
  normalizeReceptorBank,
  type CrmPayment,
} from "./payments.ts";
import {
  buildExportFilename,
  escapeXml,
  generatePaymentsCsv,
  generatePaymentsXmlSpreadsheet,
} from "./payments-export.ts";

describe("normalizeReceptorBank", () => {
  it("prioritizes destination bank after prepositions and arrows", () => {
    assert.equal(normalizeReceptorBank("Banesco a Bancamiga"), "Bancamiga");
    assert.equal(
      normalizeReceptorBank("Desde Mercantil hacia Banco de Venezuela"),
      "Venezuela",
    );
    assert.equal(normalizeReceptorBank("Destino: BDV"), "Venezuela");
    assert.equal(normalizeReceptorBank("Provincial -> Banplus"), "Banplus");
    assert.equal(normalizeReceptorBank("Banesco => Banplus"), "Banplus");
    assert.equal(normalizeReceptorBank("De Mercantil para Bancamiga"), "Bancamiga");
    assert.equal(
      normalizeReceptorBank("Acreditado a Banco de Venezuela"),
      "Venezuela",
    );
    assert.equal(normalizeReceptorBank("Destinatario: BDV"), "Venezuela");
    assert.equal(normalizeReceptorBank("Cuenta destino Banplus"), "Banplus");
  });

  it("normalizes variations of canonical banks", () => {
    assert.equal(normalizeReceptorBank("BDV"), "Venezuela");
    assert.equal(normalizeReceptorBank("Banco de Venezuela"), "Venezuela");
    assert.equal(normalizeReceptorBank("Banco Venezuela"), "Venezuela");
    assert.equal(normalizeReceptorBank("Bancamiga"), "Bancamiga");
    assert.equal(normalizeReceptorBank("Banco Bancamiga"), "Bancamiga");
    assert.equal(
      normalizeReceptorBank("Bancamiga Banco Universal"),
      "Bancamiga",
    );
    assert.equal(normalizeReceptorBank("Banplus"), "Banplus");
    assert.equal(normalizeReceptorBank("Banco Banplus"), "Banplus");
    assert.equal(normalizeReceptorBank("Banplus Banco Universal"), "Banplus");
  });

  it("preserves other valid banks with title case formatting", () => {
    assert.equal(normalizeReceptorBank("Banesco"), "Banesco");
    assert.equal(normalizeReceptorBank("Banco Mercantil"), "Mercantil");
    assert.equal(normalizeReceptorBank("BBVA Provincial"), "Provincial");
    assert.equal(
      normalizeReceptorBank("Banco Bicentenario"),
      "Bicentenario",
    );
  });

  it("returns null for empty, null or undefined input", () => {
    assert.equal(normalizeReceptorBank(null), null);
    assert.equal(normalizeReceptorBank(undefined), null);
    assert.equal(normalizeReceptorBank(""), null);
    assert.equal(normalizeReceptorBank("   "), null);
  });
});

describe("getReceptorBankMeta", () => {
  it("provides correct visual metadata for canonical banks", () => {
    const vdv = getReceptorBankMeta("Venezuela");
    assert.equal(vdv.displayName, "Banco de Venezuela");
    assert.equal(vdv.colorScheme, "red");

    const bam = getReceptorBankMeta("Bancamiga");
    assert.equal(bam.displayName, "Bancamiga");
    assert.equal(bam.colorScheme, "emerald");

    const bpl = getReceptorBankMeta("Banplus");
    assert.equal(bpl.displayName, "Banplus");
    assert.equal(bpl.colorScheme, "blue");
  });
});

describe("buildPaymentBankStats", () => {
  it("seeds canonical banks with 0 even when input is empty", () => {
    const stats = buildPaymentBankStats([]);
    assert.equal(stats.length, 3);
    assert.deepEqual(
      stats.map((s) => s.bank),
      ["Venezuela", "Banplus", "Bancamiga"],
    );
    assert.equal(stats[0].totalPayments, 0);
    assert.equal(stats[0].totalAmount, 0);
    assert.equal(stats[0].approvedCount, 0);
    assert.equal(stats[0].inProcessCount, 0);
  });

  it("accurately aggregates subtotals and totals by receptor bank", () => {
    const rows = [
      { bank: "Banesco a Bancamiga", amount: 50.25, status: "APROBADO" },
      { bank: "Bancamiga", amount: 20.0, status: "EN_PROCESO" },
      { bank: "Banco de Venezuela", amount: 100.5, status: "APROBADO" },
      { bank: "BDV", amount: 30.0, status: "RECIBIDO" },
      { bank: "Banplus", amount: 80.0, status: "RECHAZADO" },
    ];

    const stats = buildPaymentBankStats(rows);

    const bdv = stats.find((s) => s.bank === "Venezuela");
    assert.ok(bdv);
    assert.equal(bdv.totalPayments, 2);
    assert.equal(bdv.totalAmount, 130.5);
    assert.equal(bdv.approvedCount, 1);
    assert.equal(bdv.approvedAmount, 100.5);
    assert.equal(bdv.inProcessCount, 1);
    assert.equal(bdv.inProcessAmount, 30.0);

    const bam = stats.find((s) => s.bank === "Bancamiga");
    assert.ok(bam);
    assert.equal(bam.totalPayments, 2);
    assert.equal(bam.totalAmount, 70.25);
    assert.equal(bam.approvedCount, 1);
    assert.equal(bam.approvedAmount, 50.25);
    assert.equal(bam.inProcessCount, 1);
    assert.equal(bam.inProcessAmount, 20.0);

    const bpl = stats.find((s) => s.bank === "Banplus");
    assert.ok(bpl);
    assert.equal(bpl.totalPayments, 1);
    assert.equal(bpl.totalAmount, 80.0);
    assert.equal(bpl.approvedCount, 0);
    assert.equal(bpl.inProcessCount, 0);
  });
});

describe("escapeXml", () => {
  it("escapes all five XML reserved characters strictly", () => {
    const raw = `Tom & Jerry <test> "quotes" 'apostrophe'`;
    const escaped = escapeXml(raw);
    assert.equal(
      escaped,
      "Tom &amp; Jerry &lt;test&gt; &quot;quotes&quot; &apos;apostrophe&apos;",
    );
  });

  it("handles null, undefined and numbers safely", () => {
    assert.equal(escapeXml(null), "");
    assert.equal(escapeXml(undefined), "");
    assert.equal(escapeXml(1234.5), "1234.5");
  });
});

describe("buildExportFilename", () => {
  it("generates correct filename for single bank, multiple banks, and all banks", () => {
    assert.equal(
      buildExportFilename(["Bancamiga"], "2026-11-01", "2026-11-02", "xls"),
      "pagos_bancamiga_2026-11-01_a_2026-11-02.xls",
    );
    assert.equal(
      buildExportFilename(
        ["Venezuela", "Banplus"],
        "2026-11-01",
        "2026-11-02",
        "xls",
      ),
      "pagos_2_bancos_2026-11-01_a_2026-11-02.xls",
    );
    assert.equal(
      buildExportFilename(
        ["Venezuela", "Banplus", "Bancamiga"],
        "2026-11-01",
        "2026-11-02",
        "xls",
      ),
      "pagos_todos_los_bancos_2026-11-01_a_2026-11-02.xls",
    );
  });
});

describe("generatePaymentsXmlSpreadsheet", () => {
  const samplePayments: CrmPayment[] = [
    {
      id: "p-1",
      client_id: 1,
      conversation_id: 10,
      message_id: 100,
      submitted_by_agent_id: 2,
      wispro_client_id: "w-1",
      client_name: "Acme & Sons <Corp>",
      cedula: "12345678",
      phone_id: "04121234567",
      amount: 45.5,
      amount_raw: "Bs. 2.500,00",
      bank: "Banesco a Bancamiga",
      transaction_code: "987654",
      payment_date: "2026-11-02T12:00:00Z",
      comment: `Pago "mensualidad" & servicio`,
      status: "APROBADO",
      source: "ai",
      external_payment_id: "ext-1",
      external_api_status: 200,
      error_message: null,
      receipt_media_url: null,
      created_at: "2026-11-02T12:00:00Z",
      updated_at: "2026-11-02T12:05:00Z",
    },
    {
      id: "p-2",
      client_id: 2,
      conversation_id: 11,
      message_id: 101,
      submitted_by_agent_id: 2,
      wispro_client_id: "w-2",
      client_name: "Carlos Gomez",
      cedula: "87654321",
      phone_id: "04147654321",
      amount: 30.0,
      amount_raw: "Bs. 1.650,00",
      bank: "Banco de Venezuela",
      transaction_code: "123456",
      payment_date: "2026-11-02T13:00:00Z",
      comment: null,
      status: "EN_PROCESO",
      source: "advisor",
      external_payment_id: null,
      external_api_status: null,
      error_message: null,
      receipt_media_url: null,
      created_at: "2026-11-02T13:00:00Z",
      updated_at: "2026-11-02T13:00:00Z",
    },
  ];

  it("produces valid Microsoft XML Spreadsheet 2003 with escaped entities and structured tables", () => {
    const xml = generatePaymentsXmlSpreadsheet(samplePayments, {
      from: "2026-11-01",
      to: "2026-11-02",
      organizationName: "INNOVER CORP",
    });

    // Check XML preamble & root
    assert.ok(xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?>`));
    assert.ok(xml.includes(`<?mso-application progid="Excel.Sheet"?>`));
    assert.ok(xml.includes(`<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"`));

    // Check Corporate Title
    assert.ok(xml.includes("INNOVER CORP · REPORTE DE PAGOS RECIBIDOS"));

    // Check Executive Summary & Detail Sections
    assert.ok(xml.includes("RESUMEN EJECUTIVO POR CUENTA / BANCO RECEPTOR"));
    assert.ok(xml.includes("DETALLE DE MOVIMIENTOS BANCARIOS"));

    // Check strict entity escaping in data cells
    assert.ok(xml.includes("Acme &amp; Sons &lt;Corp&gt;"));
    assert.ok(xml.includes("Pago &quot;mensualidad&quot; &amp; servicio"));

    // Check Bank Subtotal and Grand Total
    assert.ok(xml.includes("BANCO: Bancamiga"));
    assert.ok(xml.includes("SUBTOTAL BANCAMIGA (1 pagos)"));
    assert.ok(xml.includes("TOTAL GENERAL DE PAGOS RECIBIDOS (2 pagos)"));

    // Check FreezePanes configuration
    assert.ok(xml.includes("<FreezePanes/>"));
    assert.ok(xml.includes("<FrozenNoSplit/>"));
    assert.ok(xml.includes("<SplitHorizontal>"));
  });

  it("generates CSV with UTF-8 BOM prefix", () => {
    const csv = generatePaymentsCsv(samplePayments, {
      from: "2026-11-01",
      to: "2026-11-02",
    });

    assert.ok(csv.startsWith("\uFEFF"));
    assert.ok(csv.includes('"Banco Receptor"'));
    assert.ok(csv.includes('"Bancamiga"'));
    assert.ok(csv.includes('"Acme & Sons <Corp>"'));
    assert.ok(csv.includes('"Pago ""mensualidad"" & servicio"'));
  });
});
