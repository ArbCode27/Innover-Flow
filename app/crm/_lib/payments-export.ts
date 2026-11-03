import type { CrmPayment, CrmPaymentBankStat } from "./payments.ts";
import {
  CRM_PAYMENT_STATUS_LABELS,
  buildPaymentBankStats,
  normalizeReceptorBank,
} from "./payments.ts";

/**
 * Escapa rigurosamente caracteres XML reservados para evitar que el archivo
 * .xls generado en XML Spreadsheet 2003 se corrompa con entradas de usuario.
 */
export const escapeXml = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

/**
 * Genera el nombre de archivo descriptivo según las especificaciones.
 * Ejemplos:
 * - Un banco: pagos_bancamiga_2026-11-01_a_2026-11-02.xls
 * - Varios bancos: pagos_2_bancos_2026-11-01_a_2026-11-02.xls
 * - Todos: pagos_todos_los_bancos_2026-11-01_a_2026-11-02.xls
 */
export const buildExportFilename = (
  selectedBanks: string[],
  from: string | null,
  to: string | null,
  extension: "xls" | "csv",
): string => {
  const fromStr = from || "inicio";
  const toStr = to || "hoy";
  const datePart = `${fromStr}_a_${toStr}`;

  if (selectedBanks.length === 1) {
    const bankClean = selectedBanks[0]
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return `pagos_${bankClean}_${datePart}.${extension}`;
  }

  if (selectedBanks.length > 1 && selectedBanks.length <= 2) {
    return `pagos_${selectedBanks.length}_bancos_${datePart}.${extension}`;
  }

  return `pagos_todos_los_bancos_${datePart}.${extension}`;
};

export type GeneratePaymentsExportOptions = {
  selectedBanks?: string[];
  from?: string | null;
  to?: string | null;
  organizationName?: string;
  generatedAt?: Date;
};

const formatEmissionDate = (date: Date): string =>
  new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);

/**
 * Genera un libro de Excel en formato Microsoft XML Spreadsheet 2003 nativo (.xls).
 * Permite compatibilidad 100% con Excel sin dependencias externas pesadas,
 * incluyendo estilos corporativos, tabla resumen, subtotales por banco,
 * total general y paneles congelados (FreezePanes).
 */
export const generatePaymentsXmlSpreadsheet = (
  payments: CrmPayment[],
  options: GeneratePaymentsExportOptions = {},
): string => {
  const generatedAt = options.generatedAt || new Date();
  const selectedBanks = options.selectedBanks || [];
  const orgName = options.organizationName || "INNOVER CORP";

  // Filtrar por bancos seleccionados si se especificaron
  const filteredPayments =
    selectedBanks.length > 0
      ? payments.filter((p) => {
          const norm = normalizeReceptorBank(p.bank) || "Otro";
          return selectedBanks.includes(norm) || selectedBanks.includes(p.bank || "");
        })
      : payments;

  // Agrupación y estadísticas para el resumen ejecutivo
  const bankStats = buildPaymentBankStats(
    filteredPayments.map((p) => ({
      bank: p.bank,
      amount: p.amount,
      status: p.status,
    })),
  );

  // Considerar solo bancos que tengan movimientos o que hayan sido seleccionados
  const relevantStats = bankStats.filter(
    (s) =>
      s.totalPayments > 0 ||
      (selectedBanks.length > 0 && selectedBanks.includes(s.bank)),
  );

  // Totales generales
  let grandTotalPayments = 0;
  let grandTotalAmount = 0;
  let grandApprovedCount = 0;
  let grandApprovedAmount = 0;
  let grandInProcessCount = 0;
  let grandInProcessAmount = 0;

  for (const stat of relevantStats) {
    grandTotalPayments += stat.totalPayments;
    grandTotalAmount += stat.totalAmount;
    grandApprovedCount += stat.approvedCount;
    grandApprovedAmount += stat.approvedAmount;
    grandInProcessCount += stat.inProcessCount;
    grandInProcessAmount += stat.inProcessAmount;
  }

  // Agrupar movimientos por banco receptor
  const paymentsByBank = new Map<string, CrmPayment[]>();
  for (const payment of filteredPayments) {
    const bank = normalizeReceptorBank(payment.bank) || "Otro";
    const list = paymentsByBank.get(bank) || [];
    list.push(payment);
    paymentsByBank.set(bank, list);
  }

  const periodText =
    options.from && options.to
      ? `${options.from} al ${options.to}`
      : options.from
        ? `Desde ${options.from}`
        : options.to
          ? `Hasta ${options.to}`
          : "Todos los registros";

  const banksText =
    selectedBanks.length > 0 ? selectedBanks.join(", ") : "Todos los bancos";

  const emissionText = formatEmissionDate(generatedAt);

  // Construcción de filas XML
  const rowsXml: string[] = [];
  let currentRowIndex = 0;

  const addRow = (content: string, height?: number) => {
    currentRowIndex += 1;
    const heightAttr = height ? ` ss:Height="${height}"` : "";
    rowsXml.push(`    <Row${heightAttr}>${content}</Row>`);
  };

  // 1. Encabezado Corporativo
  addRow(
    `<Cell ss:StyleID="Title" ss:MergeAcross="9"><Data ss:Type="String">${escapeXml(orgName)} · REPORTE DE PAGOS RECIBIDOS</Data></Cell>`,
    30,
  );
  addRow("");

  // Metadatos
  addRow(
    `<Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Período analizado:</Data></Cell>` +
      `<Cell ss:StyleID="MetaValue" ss:MergeAcross="3"><Data ss:Type="String">${escapeXml(periodText)}</Data></Cell>` +
      `<Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Fecha de emisión:</Data></Cell>` +
      `<Cell ss:StyleID="MetaValue" ss:MergeAcross="3"><Data ss:Type="String">${escapeXml(emissionText)}</Data></Cell>`,
    20,
  );

  addRow(
    `<Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Bancos receptores:</Data></Cell>` +
      `<Cell ss:StyleID="MetaValue" ss:MergeAcross="3"><Data ss:Type="String">${escapeXml(banksText)}</Data></Cell>` +
      `<Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Total recaudado:</Data></Cell>` +
      `<Cell ss:StyleID="MetaValueCurrency" ss:MergeAcross="3"><Data ss:Type="Number">${grandTotalAmount.toFixed(2)}</Data></Cell>`,
    20,
  );

  addRow(
    `<Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Total movimientos:</Data></Cell>` +
      `<Cell ss:StyleID="MetaValue" ss:MergeAcross="3"><Data ss:Type="String">${grandTotalPayments} transacciones</Data></Cell>` +
      `<Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Estado:</Data></Cell>` +
      `<Cell ss:StyleID="MetaValue" ss:MergeAcross="3"><Data ss:Type="String">${grandApprovedCount} aprobados · ${grandInProcessCount} en proceso</Data></Cell>`,
    20,
  );

  addRow("");

  // 2. Resumen Ejecutivo por Banco Receptor
  addRow(
    `<Cell ss:StyleID="SectionHeader" ss:MergeAcross="6"><Data ss:Type="String">RESUMEN EJECUTIVO POR CUENTA / BANCO RECEPTOR</Data></Cell>`,
    24,
  );

  addRow(
    `<Cell ss:StyleID="SummaryHeader"><Data ss:Type="String">Banco Receptor</Data></Cell>` +
      `<Cell ss:StyleID="SummaryHeader"><Data ss:Type="String">Movimientos</Data></Cell>` +
      `<Cell ss:StyleID="SummaryHeader"><Data ss:Type="String">Aprobados (Cant)</Data></Cell>` +
      `<Cell ss:StyleID="SummaryHeader"><Data ss:Type="String">Aprobados ($)</Data></Cell>` +
      `<Cell ss:StyleID="SummaryHeader"><Data ss:Type="String">En Proceso (Cant)</Data></Cell>` +
      `<Cell ss:StyleID="SummaryHeader"><Data ss:Type="String">En Proceso ($)</Data></Cell>` +
      `<Cell ss:StyleID="SummaryHeader"><Data ss:Type="String">Total Recaudado (USD)</Data></Cell>`,
    22,
  );

  if (relevantStats.length === 0) {
    addRow(
      `<Cell ss:StyleID="SummaryCellCenter" ss:MergeAcross="6"><Data ss:Type="String">No se encontraron movimientos para los filtros seleccionados</Data></Cell>`,
      20,
    );
  } else {
    for (const stat of relevantStats) {
      addRow(
        `<Cell ss:StyleID="SummaryCellLeft"><Data ss:Type="String">${escapeXml(stat.bank)}</Data></Cell>` +
          `<Cell ss:StyleID="SummaryCellNumber"><Data ss:Type="Number">${stat.totalPayments}</Data></Cell>` +
          `<Cell ss:StyleID="SummaryCellNumber"><Data ss:Type="Number">${stat.approvedCount}</Data></Cell>` +
          `<Cell ss:StyleID="SummaryCellCurrency"><Data ss:Type="Number">${stat.approvedAmount.toFixed(2)}</Data></Cell>` +
          `<Cell ss:StyleID="SummaryCellNumber"><Data ss:Type="Number">${stat.inProcessCount}</Data></Cell>` +
          `<Cell ss:StyleID="SummaryCellCurrency"><Data ss:Type="Number">${stat.inProcessAmount.toFixed(2)}</Data></Cell>` +
          `<Cell ss:StyleID="SummaryCellCurrency"><Data ss:Type="Number">${stat.totalAmount.toFixed(2)}</Data></Cell>`,
        20,
      );
    }
  }

  // Fila Total Resumen
  addRow(
    `<Cell ss:StyleID="SummaryTotalLabel"><Data ss:Type="String">TOTAL GENERAL</Data></Cell>` +
      `<Cell ss:StyleID="SummaryTotalNumber"><Data ss:Type="Number">${grandTotalPayments}</Data></Cell>` +
      `<Cell ss:StyleID="SummaryTotalNumber"><Data ss:Type="Number">${grandApprovedCount}</Data></Cell>` +
      `<Cell ss:StyleID="SummaryTotalCurrency"><Data ss:Type="Number">${grandApprovedAmount.toFixed(2)}</Data></Cell>` +
      `<Cell ss:StyleID="SummaryTotalNumber"><Data ss:Type="Number">${grandInProcessCount}</Data></Cell>` +
      `<Cell ss:StyleID="SummaryTotalCurrency"><Data ss:Type="Number">${grandInProcessAmount.toFixed(2)}</Data></Cell>` +
      `<Cell ss:StyleID="SummaryTotalCurrency"><Data ss:Type="Number">${grandTotalAmount.toFixed(2)}</Data></Cell>`,
    22,
  );

  addRow("");
  addRow("");

  // 3. Detalle de Movimientos Bancarios
  addRow(
    `<Cell ss:StyleID="SectionHeader" ss:MergeAcross="9"><Data ss:Type="String">DETALLE DE MOVIMIENTOS BANCARIOS</Data></Cell>`,
    24,
  );

  // Freeze panes point: congele justo antes de que empiecen los movimientos
  const freezeRowIndex = currentRowIndex;

  addRow(
    `<Cell ss:StyleID="DetailHeader"><Data ss:Type="String">N°</Data></Cell>` +
      `<Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Fecha</Data></Cell>` +
      `<Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Banco Receptor</Data></Cell>` +
      `<Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Cédula / RIF</Data></Cell>` +
      `<Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Cliente / Titular</Data></Cell>` +
      `<Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Referencia</Data></Cell>` +
      `<Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Estado</Data></Cell>` +
      `<Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Monto (USD)</Data></Cell>` +
      `<Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Monto en Bs</Data></Cell>` +
      `<Cell ss:StyleID="DetailHeader"><Data ss:Type="String">Comentario / Nota</Data></Cell>`,
    22,
  );

  if (filteredPayments.length === 0) {
    addRow(
      `<Cell ss:StyleID="DetailCenter" ss:MergeAcross="9"><Data ss:Type="String">No se registraron movimientos en este período</Data></Cell>`,
      20,
    );
  } else {
    let globalCounter = 0;

    // Iterar grupos por banco receptor
    const sortedBankNames = Array.from(paymentsByBank.keys()).sort((a, b) => {
      // Priorizar bancos canónicos
      const rankA = a === "Venezuela" ? 1 : a === "Banplus" ? 2 : a === "Bancamiga" ? 3 : 4;
      const rankB = b === "Venezuela" ? 1 : b === "Banplus" ? 2 : b === "Bancamiga" ? 3 : 4;
      if (rankA !== rankB) return rankA - rankB;
      return a.localeCompare(b);
    });

    for (const bankName of sortedBankNames) {
      const bankPayments = paymentsByBank.get(bankName) || [];
      const bankSubtotalAmount = bankPayments.reduce(
        (acc, cur) => acc + (typeof cur.amount === "number" ? cur.amount : 0),
        0,
      );

      // Fila divisoria de grupo de banco (azul claro)
      addRow(
        `<Cell ss:StyleID="BankGroupHeader" ss:MergeAcross="9"><Data ss:Type="String">BANCO: ${escapeXml(bankName)} (${bankPayments.length} movimientos · Subtotal: $${bankSubtotalAmount.toFixed(2)} USD)</Data></Cell>`,
        24,
      );

      for (const p of bankPayments) {
        globalCounter += 1;
        const pDate = p.payment_date ? p.payment_date.slice(0, 10) : "";
        const pCedula = p.cedula || "—";
        const pClient = p.client_name || "—";
        const pRef = p.transaction_code || "—";
        const pStatusLabel = CRM_PAYMENT_STATUS_LABELS[p.status] || p.status;
        const pAmount = typeof p.amount === "number" ? p.amount : 0;
        const pAmountBs = p.amount_raw ? escapeXml(p.amount_raw) : "—";
        const pComment = p.comment ? escapeXml(p.comment) : "";

        let statusStyle = "StatusOther";
        if (p.status === "APROBADO") statusStyle = "StatusApproved";
        else if (p.status === "EN_PROCESO" || p.status === "RECIBIDO")
          statusStyle = "StatusInProcess";

        addRow(
          `<Cell ss:StyleID="DetailCenter"><Data ss:Type="Number">${globalCounter}</Data></Cell>` +
            `<Cell ss:StyleID="DetailCenter"><Data ss:Type="String">${escapeXml(pDate)}</Data></Cell>` +
            `<Cell ss:StyleID="DetailBank"><Data ss:Type="String">${escapeXml(bankName)}</Data></Cell>` +
            `<Cell ss:StyleID="DetailCenter"><Data ss:Type="String">${escapeXml(pCedula)}</Data></Cell>` +
            `<Cell ss:StyleID="DetailLeft"><Data ss:Type="String">${escapeXml(pClient)}</Data></Cell>` +
            `<Cell ss:StyleID="DetailCenter"><Data ss:Type="String">${escapeXml(pRef)}</Data></Cell>` +
            `<Cell ss:StyleID="${statusStyle}"><Data ss:Type="String">${escapeXml(pStatusLabel)}</Data></Cell>` +
            `<Cell ss:StyleID="DetailCurrency"><Data ss:Type="Number">${pAmount.toFixed(2)}</Data></Cell>` +
            `<Cell ss:StyleID="DetailBs"><Data ss:Type="String">${pAmountBs}</Data></Cell>` +
            `<Cell ss:StyleID="DetailComment"><Data ss:Type="String">${pComment}</Data></Cell>`,
          20,
        );
      }

      // Fila de Subtotal al pie de cada grupo bancario
      addRow(
        `<Cell ss:StyleID="SubtotalLabel" ss:MergeAcross="6"><Data ss:Type="String">SUBTOTAL ${escapeXml(bankName.toUpperCase())} (${bankPayments.length} pagos)</Data></Cell>` +
          `<Cell ss:StyleID="SubtotalCurrency"><Data ss:Type="Number">${bankSubtotalAmount.toFixed(2)}</Data></Cell>` +
          `<Cell ss:StyleID="SubtotalEmpty" ss:MergeAcross="1"/>`,
        22,
      );
    }
  }

  // 4. Fila Final de Cierre (Dorado corporativo con doble borde)
  addRow(
    `<Cell ss:StyleID="GrandTotalFinalLabel" ss:MergeAcross="6"><Data ss:Type="String">TOTAL GENERAL DE PAGOS RECIBIDOS (${grandTotalPayments} pagos)</Data></Cell>` +
      `<Cell ss:StyleID="GrandTotalFinalCurrency"><Data ss:Type="Number">${grandTotalAmount.toFixed(2)}</Data></Cell>` +
      `<Cell ss:StyleID="GrandTotalFinalEmpty" ss:MergeAcross="1"/>`,
    25,
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Author>${escapeXml(orgName)}</Author>
    <Created>${generatedAt.toISOString()}</Created>
    <Company>${escapeXml(orgName)}</Company>
  </DocumentProperties>
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Borders/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="10" ss:Color="#0F172A"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>

    <!-- Encabezados Generales -->
    <Style ss:ID="Title">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="15" ss:Bold="1" ss:Color="#0F172A"/>
      <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#CBD5E1"/>
      </Borders>
    </Style>

    <Style ss:ID="MetaLabel">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Bold="1" ss:Color="#475569"/>
      <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>

    <Style ss:ID="MetaValue">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Color="#0F172A"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>

    <Style ss:ID="MetaValueCurrency">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Bold="1" ss:Color="#047857"/>
      <NumberFormat ss:Format="&quot;$&quot;#,##0.00"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>

    <Style ss:ID="SectionHeader">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#0F172A"/>
      <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#94A3B8"/>
      </Borders>
    </Style>

    <!-- Resumen Ejecutivo -->
    <Style ss:ID="SummaryHeader">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
      <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
      </Borders>
    </Style>

    <Style ss:ID="SummaryCellLeft">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Bold="1" ss:Color="#0F172A"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>

    <Style ss:ID="SummaryCellCenter">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Color="#0F172A"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>

    <Style ss:ID="SummaryCellNumber">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Color="#0F172A"/>
      <NumberFormat ss:Format="#,##0"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>

    <Style ss:ID="SummaryCellCurrency">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Color="#0F172A"/>
      <NumberFormat ss:Format="&quot;$&quot;#,##0.00"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>

    <Style ss:ID="SummaryTotalLabel">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#78350F"/>
      <Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D97706"/>
        <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#B45309"/>
      </Borders>
    </Style>

    <Style ss:ID="SummaryTotalNumber">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#78350F"/>
      <Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="#,##0"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D97706"/>
        <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#B45309"/>
      </Borders>
    </Style>

    <Style ss:ID="SummaryTotalCurrency">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#78350F"/>
      <Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="&quot;$&quot;#,##0.00"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D97706"/>
        <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#B45309"/>
      </Borders>
    </Style>

    <!-- Detalle de Movimientos -->
    <Style ss:ID="BankGroupHeader">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10.5" ss:Bold="1" ss:Color="#1E3A8A"/>
      <Interior ss:Color="#DBEAFE" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#93C5FD"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#93C5FD"/>
      </Borders>
    </Style>

    <Style ss:ID="DetailHeader">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#334155" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#1E293B"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#1E293B"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#475569"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#475569"/>
      </Borders>
    </Style>

    <Style ss:ID="DetailCenter">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Color="#0F172A"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>

    <Style ss:ID="DetailLeft">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Color="#0F172A"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>

    <Style ss:ID="DetailBank">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Bold="1" ss:Color="#0F172A"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>

    <Style ss:ID="StatusApproved">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9" ss:Bold="1" ss:Color="#15803D"/>
      <Interior ss:Color="#DCFCE7" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#86EFAC"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#86EFAC"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#86EFAC"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#86EFAC"/>
      </Borders>
    </Style>

    <Style ss:ID="StatusInProcess">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9" ss:Bold="1" ss:Color="#C2410C"/>
      <Interior ss:Color="#FFEDD5" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDBA74"/>
      </Borders>
    </Style>

    <Style ss:ID="StatusOther">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9" ss:Color="#475569"/>
      <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
      </Borders>
    </Style>

    <Style ss:ID="DetailCurrency">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Bold="1" ss:Color="#0F172A"/>
      <NumberFormat ss:Format="&quot;$&quot;#,##0.00"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>

    <Style ss:ID="DetailBs">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9" ss:Color="#475569"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>

    <Style ss:ID="DetailComment">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="8.5" ss:Color="#475569"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>

    <!-- Subtotales y Totales Finales -->
    <Style ss:ID="SubtotalLabel">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Bold="1" ss:Color="#1E3A8A"/>
      <Interior ss:Color="#EFF6FF" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#93C5FD"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#93C5FD"/>
      </Borders>
    </Style>

    <Style ss:ID="SubtotalCurrency">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9.5" ss:Bold="1" ss:Color="#1E3A8A"/>
      <Interior ss:Color="#EFF6FF" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="&quot;$&quot;#,##0.00"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#93C5FD"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#93C5FD"/>
      </Borders>
    </Style>

    <Style ss:ID="SubtotalEmpty">
      <Interior ss:Color="#EFF6FF" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#93C5FD"/>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#93C5FD"/>
      </Borders>
    </Style>

    <Style ss:ID="GrandTotalFinalLabel">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#78350F"/>
      <Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D97706"/>
        <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#B45309"/>
      </Borders>
    </Style>

    <Style ss:ID="GrandTotalFinalCurrency">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#78350F"/>
      <Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="&quot;$&quot;#,##0.00"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D97706"/>
        <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#B45309"/>
      </Borders>
    </Style>

    <Style ss:ID="GrandTotalFinalEmpty">
      <Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D97706"/>
        <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#B45309"/>
      </Borders>
    </Style>
  </Styles>

  <Worksheet ss:Name="Reporte de Pagos">
    <Table>
      <!-- Columnas del reporte -->
      <Column ss:Width="36"/>  <!-- N° -->
      <Column ss:Width="82"/>  <!-- Fecha -->
      <Column ss:Width="115"/> <!-- Banco Receptor -->
      <Column ss:Width="95"/>  <!-- Cédula / RIF -->
      <Column ss:Width="185"/> <!-- Cliente -->
      <Column ss:Width="105"/> <!-- Referencia -->
      <Column ss:Width="95"/>  <!-- Estado -->
      <Column ss:Width="95"/>  <!-- Monto USD -->
      <Column ss:Width="95"/>  <!-- Monto Bs -->
      <Column ss:Width="210"/> <!-- Comentario -->

${rowsXml.join("\n")}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <PageSetup>
        <Layout x:Orientation="Landscape"/>
      </PageSetup>
      <Selected/>
      <FreezePanes/>
      <FrozenNoSplit/>
      <SplitHorizontal>${freezeRowIndex}</SplitHorizontal>
      <TopRowBottomPane>${freezeRowIndex}</TopRowBottomPane>
      <ActivePane>2</ActivePane>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`;
};

/**
 * Generador complementario CSV con prefijo UTF-8 BOM (\uFEFF)
 * para compatibilidad total con acentos y tildes en Excel en español.
 */
export const generatePaymentsCsv = (
  payments: CrmPayment[],
  options: GeneratePaymentsExportOptions = {},
): string => {
  const selectedBanks = options.selectedBanks || [];

  const filteredPayments =
    selectedBanks.length > 0
      ? payments.filter((p) => {
          const norm = normalizeReceptorBank(p.bank) || "Otro";
          return selectedBanks.includes(norm) || selectedBanks.includes(p.bank || "");
        })
      : payments;

  const escapeCsvField = (value: unknown): string => {
    if (value === null || value === undefined) return '""';
    const str = String(value).replace(/"/g, '""');
    return `"${str}"`;
  };

  const headers = [
    "N°",
    "Fecha",
    "Banco Receptor",
    "Cédula / RIF",
    "Cliente / Titular",
    "Referencia",
    "Estado",
    "Monto (USD)",
    "Monto en Bs",
    "Comentario",
  ];

  const rows: string[] = [headers.map(escapeCsvField).join(",")];

  filteredPayments.forEach((p, idx) => {
    const bank = normalizeReceptorBank(p.bank) || "Otro";
    const date = p.payment_date ? p.payment_date.slice(0, 10) : "";
    const statusLabel = CRM_PAYMENT_STATUS_LABELS[p.status] || p.status;
    const amountUsd =
      typeof p.amount === "number" ? p.amount.toFixed(2) : "0.00";

    const row = [
      idx + 1,
      date,
      bank,
      p.cedula || "",
      p.client_name || "",
      p.transaction_code || "",
      statusLabel,
      amountUsd,
      p.amount_raw || "",
      p.comment || "",
    ];

    rows.push(row.map(escapeCsvField).join(","));
  });

  // UTF-8 BOM al inicio
  return "\uFEFF" + rows.join("\r\n");
};
