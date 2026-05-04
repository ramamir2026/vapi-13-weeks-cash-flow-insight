import ExcelJS from "exceljs";
import { format, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { ForecastResult } from "./forecast";

// ---- Color palette (ARGB hex without leading #, with FF alpha) ----
const C = {
  navy: "FF1F3864",
  darkBlue: "FF2F5496",
  lightGray: "FFD9D9D9",
  lightBlue: "FFD9E1F2",
  lightGreen: "FFE2EFDA",
  altRow: "FFF2F2F2",
  white: "FFFFFFFF",
  red: "FFC00000",
};

const MONEY_FMT = '$#,##0;($#,##0);"-"';
const RUNWAY_FMT = "0.0";

// Vendor labels per spec (override forecast row labels)
const COGS_DISPLAY: Record<string, string> = {
  cogs_anthropic: "Anthropic (7% MoM growth)",
  cogs_pump_aws: "Pump / AWS Reserved",
  cogs_azure: "Microsoft Azure (7% MoM growth)",
  cogs_openai: "OpenAI",
  cogs_elevenlabs: "ElevenLabs",
  cogs_deepgram: "Deepgram (Apr only — no Q2 renewal)",
  cogs_twilio: "Twilio & Telecom ($140K/mo)",
  cogs_other: "Other COGS",
};
// Display order per spec
const COGS_ORDER = [
  "cogs_anthropic",
  "cogs_pump_aws",
  "cogs_azure",
  "cogs_openai",
  "cogs_elevenlabs",
  "cogs_deepgram",
  "cogs_twilio",
  "cogs_other",
];

const OPEX_DISPLAY: Record<string, string> = {
  opex_sm: "Sales & Marketing",
  opex_software: "Software & Engineering Tools",
  opex_legal: "Legal & Compliance",
  opex_deel: "Contractors — Deel",
  opex_hr_te: "HR / T&E",
  opex_recruiting: "Recruiting Agencies",
  opex_ga: "G&A & Other",
};
const OPEX_ORDER = [
  "opex_sm",
  "opex_software",
  "opex_legal",
  "opex_deel",
  "opex_hr_te",
  "opex_recruiting",
  "opex_ga",
];

// Excel column letter from 1-based index
const colLetter = (n: number): string => {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const fillSolid = (argb: string) => ({
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb },
});

export const exportForecastToExcel = async (
  forecast: ForecastResult,
  actuals: Record<string, number> = {},
  extras?: {
    assumptions?: Array<{ key: string; value: string | number; category: string }>;
    arEntries?: Array<{
      customer: string;
      invoice_amount: number;
      due_date?: string;
      expected_collection_date?: string;
      status?: string;
      probability?: number;
    }>;
    futureHires?: Array<{
      role: string;
      department?: string;
      start_date?: string;
      annual_salary?: number;
    }>;
  }
) => {
  const { weeks, cogsRows, opexRows, rentRow, minCashThreshold } = forecast;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Vapi Cash Flow";
  wb.created = new Date();

  const ws = wb.addWorksheet("13-Week Forecast", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 6 }],
  });

  // Columns: 1 = label, 2 = ACTUALS, 3..(2+W) = W1..Wn, last = 13-Wk Total
  const W = weeks.length;
  const totalCols = 2 + W + 1; // label + actuals + W weeks + total
  const TOTAL_COL = totalCols;
  const FIRST_WEEK_COL = 3;
  const LAST_WEEK_COL = 2 + W;

  // Column widths
  ws.getColumn(1).width = 38;
  ws.getColumn(2).width = 14;
  for (let c = FIRST_WEEK_COL; c <= LAST_WEEK_COL; c++) ws.getColumn(c).width = 12;
  ws.getColumn(TOTAL_COL).width = 14;

  // ===================== Header rows 1–4 =====================
  const startDate = weeks[0].weekStartDate;
  const endDate = addDays(weeks[W - 1].weekStartDate, 6);
  const openingM = (weeks[0].openingBalance / 1_000_000).toFixed(1);

  // Row 1 — Title
  ws.mergeCells(1, 1, 1, totalCols);
  const r1 = ws.getCell(1, 1);
  r1.value = "VAPI, INC. | 13-Week Rolling Cash Flow";
  r1.font = { name: "Calibri", size: 14, bold: true, color: { argb: C.white } };
  r1.alignment = { horizontal: "center", vertical: "middle" };
  r1.fill = fillSolid(C.navy);
  ws.getRow(1).height = 22;

  // Row 2 — Subtitle
  ws.mergeCells(2, 1, 2, totalCols);
  const r2 = ws.getCell(2, 1);
  r2.value = `Forecast Period: ${format(startDate, "MMM d")} – ${format(endDate, "MMM d, yyyy")} | Opening Balance: $${openingM}M | Actuals: prior week pre-filled`;
  r2.font = { name: "Calibri", size: 11, color: { argb: C.white } };
  r2.alignment = { horizontal: "center", vertical: "middle" };
  r2.fill = fillSolid(C.darkBlue);
  ws.getRow(2).height = 18;

  // Row 3 — Legend
  ws.mergeCells(3, 1, 3, totalCols);
  const r3 = ws.getCell(3, 1);
  r3.value = "Blue = hardcoded input | Black = formula | Green = cross-sheet link | Yellow = estimate/flag";
  r3.font = { name: "Calibri", size: 10, italic: true };
  r3.alignment = { horizontal: "center", vertical: "middle" };
  r3.fill = fillSolid(C.lightGray);
  ws.getRow(3).height = 16;

  // Row 4 — spacer
  ws.getRow(4).height = 6;

  // Row 5 — Column headers
  const headerRow = ws.getRow(5);
  headerRow.height = 22;
  const headerCells = ["", "ACTUALS (prior wk)", ...weeks.map((_, i) => `W${i + 1}`), "13-Wk Total"];
  headerCells.forEach((v, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = v;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: C.white } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = fillSolid(C.navy);
  });

  // Row 6 — Week date ranges
  const dateRow = ws.getRow(6);
  dateRow.height = 18;
  dateRow.getCell(1).value = "";
  dateRow.getCell(1).fill = fillSolid(C.darkBlue);
  dateRow.getCell(2).value = "prior week";
  weeks.forEach((w, i) => {
    const start = w.weekStartDate;
    const end = addDays(start, 4); // Mon–Fri label
    dateRow.getCell(FIRST_WEEK_COL + i).value = `${format(start, "MMM d")}–${format(end, "MMM d")}`;
  });
  dateRow.getCell(TOTAL_COL).value = "Total";
  for (let c = 2; c <= TOTAL_COL; c++) {
    const cell = dateRow.getCell(c);
    cell.font = { name: "Calibri", size: 10, color: { argb: C.white } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = fillSolid(C.darkBlue);
  }

  // ===================== Row builders =====================
  let rowIndex = 6; // last used row; data starts at 7
  let altToggle = false; // for alt row striping on plain data rows

  const writeBlank = () => {
    rowIndex += 1;
    ws.getRow(rowIndex).height = 6;
  };

  const applyMoneyRow = (rowNum: number) => {
    for (let c = 2; c <= TOTAL_COL; c++) {
      ws.getCell(rowNum, c).numFmt = MONEY_FMT;
      ws.getCell(rowNum, c).alignment = { horizontal: "right" };
    }
    ws.getCell(rowNum, 1).alignment = { horizontal: "left", indent: 1 };
  };

  // Write a numeric data row with weekly values + actuals + SUM total formula.
  // Returns the row number used.
  const writeDataRow = (
    label: string,
    weekVals: number[],
    actualKey?: string,
    opts?: { bold?: boolean; fill?: string; alt?: boolean }
  ): number => {
    rowIndex += 1;
    const r = rowIndex;
    const row = ws.getRow(r);
    row.getCell(1).value = label;
    row.getCell(2).value = actualKey ? Math.round(actuals[actualKey] ?? 0) : null;
    weekVals.forEach((v, i) => {
      row.getCell(FIRST_WEEK_COL + i).value = Math.round(v);
    });
    // Total = SUM(W1:Wlast) on this row
    const startL = colLetter(FIRST_WEEK_COL);
    const endL = colLetter(LAST_WEEK_COL);
    row.getCell(TOTAL_COL).value = { formula: `SUM(${startL}${r}:${endL}${r})` };

    applyMoneyRow(r);

    const fillColor = opts?.fill ?? (opts?.alt && altToggle ? C.altRow : null);
    if (fillColor) {
      for (let c = 1; c <= TOTAL_COL; c++) row.getCell(c).fill = fillSolid(fillColor);
    }
    if (opts?.bold) {
      for (let c = 1; c <= TOTAL_COL; c++) row.getCell(c).font = { ...row.getCell(c).font, bold: true };
    }
    if (opts?.alt) altToggle = !altToggle;
    return r;
  };

  // Subtotal row — SUM down a contiguous block of data rows for each column
  const writeSubtotalRow = (
    label: string,
    fromRow: number,
    toRow: number,
    fill: string,
    actualKey?: string
  ): number => {
    rowIndex += 1;
    const r = rowIndex;
    const row = ws.getRow(r);
    row.getCell(1).value = label;
    row.getCell(2).value = actualKey ? Math.round(actuals[actualKey] ?? 0) : null;
    for (let c = FIRST_WEEK_COL; c <= LAST_WEEK_COL; c++) {
      const L = colLetter(c);
      row.getCell(c).value = { formula: `SUM(${L}${fromRow}:${L}${toRow})` };
    }
    const startL = colLetter(FIRST_WEEK_COL);
    const endL = colLetter(LAST_WEEK_COL);
    row.getCell(TOTAL_COL).value = { formula: `SUM(${startL}${r}:${endL}${r})` };
    applyMoneyRow(r);
    for (let c = 1; c <= TOTAL_COL; c++) {
      row.getCell(c).fill = fillSolid(fill);
      row.getCell(c).font = { ...row.getCell(c).font, bold: true };
    }
    return r;
  };

  // Section header (▸ label across full width)
  const writeSectionHeader = (label: string) => {
    rowIndex += 1;
    const r = rowIndex;
    ws.mergeCells(r, 1, r, TOTAL_COL);
    const cell = ws.getCell(r, 1);
    cell.value = label;
    cell.fill = fillSolid(C.darkBlue);
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: C.white } };
    cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    ws.getRow(r).height = 18;
    altToggle = false;
  };

  // ===================== Opening Balance =====================
  rowIndex += 1;
  {
    const r = rowIndex;
    const row = ws.getRow(r);
    row.getCell(1).value = "Opening Cash Balance";
    row.getCell(2).value = Math.round(actuals["openingBalance"] ?? weeks[0].openingBalance);
    weeks.forEach((w, i) => {
      row.getCell(FIRST_WEEK_COL + i).value = Math.round(w.openingBalance);
    });
    row.getCell(TOTAL_COL).value = "";
    applyMoneyRow(r);
    for (let c = 1; c <= TOTAL_COL; c++) {
      row.getCell(c).fill = fillSolid(C.lightBlue);
      row.getCell(c).font = { ...row.getCell(c).font, bold: true };
    }
  }

  writeBlank();

  // ===================== INFLOWS =====================
  writeSectionHeader("▸ INFLOWS");
  const inflowStart = rowIndex + 1;
  writeDataRow("Stripe / Usage Revenue", weeks.map((w) => w.stripeRevenue), "stripeRevenue", { alt: true });
  writeDataRow("Enterprise ACH Collections", weeks.map((w) => w.enterpriseRevenue), "enterpriseRevenue", { alt: true });
  const inflowLast = writeDataRow("A/R Collections (from AR Schedule)", weeks.map((w) => w.arCollections), "arCollections", { alt: true });
  writeBlank();
  const totalInflowsRow = writeSubtotalRow("TOTAL INFLOWS", inflowStart, inflowLast, C.lightBlue, "totalInflows");

  writeBlank();

  // ===================== OUTFLOWS =====================
  writeSectionHeader("▸ OUTFLOWS");
  const outflowStart = rowIndex + 1;

  // Payroll
  writeDataRow("Payroll (semi-monthly withdrawal)", weeks.map((w) => w.payroll), "payroll", { alt: true });
  writeBlank();

  // COGS vendors in spec order
  const cogsByKey = new Map(cogsRows.map((r) => [r.key, r] as const));
  const cogsStart = rowIndex + 1;
  let cogsLast = cogsStart;
  for (const key of COGS_ORDER) {
    const row = cogsByKey.get(key);
    if (!row) continue;
    cogsLast = writeDataRow(
      COGS_DISPLAY[key] ?? row.label,
      row.weeks,
      `cogs_${key.replace(/^cogs_/, "")}`,
      { alt: true }
    );
  }
  const totalCogsRow = writeSubtotalRow("Total AI COGS", cogsStart, cogsLast, C.lightBlue);

  writeBlank();

  // Brex card
  writeDataRow("Brex Card Payment (~2% MoM growth)", weeks.map((w) => w.brexCard), "brexCard", { alt: true });
  writeBlank();

  // OPEX rows in spec order
  const opexByKey = new Map(opexRows.map((r) => [r.key, r] as const));
  const opexStart = rowIndex + 1;
  for (const key of OPEX_ORDER) {
    const row = opexByKey.get(key);
    if (!row) continue;
    // Insert "Office Rent" before G&A per spec
    if (key === "opex_ga") {
      writeDataRow("Office Rent", rentRow, "rent", { alt: true });
    }
    writeDataRow(OPEX_DISPLAY[key] ?? row.label, row.weeks, `opex_${key.replace(/^opex_/, "")}`, { alt: true });
  }
  const opexLast = rowIndex; // last opex/rent row
  writeBlank();

  // TOTAL OUTFLOWS — sum of payroll row through opex_last (formula across the contiguous block)
  const totalOutflowsRow = writeSubtotalRow("TOTAL OUTFLOWS", outflowStart, opexLast, C.lightBlue, "totalOutflows");

  writeBlank();

  // ===================== Net + Closing =====================
  // Net Cash Flow = Inflows - Outflows (per week)
  rowIndex += 1;
  const netRow = rowIndex;
  {
    const row = ws.getRow(netRow);
    row.getCell(1).value = "Net Cash Flow";
    row.getCell(2).value = actuals["netChange"] != null ? Math.round(actuals["netChange"]) : null;
    for (let c = FIRST_WEEK_COL; c <= LAST_WEEK_COL; c++) {
      const L = colLetter(c);
      row.getCell(c).value = { formula: `${L}${totalInflowsRow}-${L}${totalOutflowsRow}` };
    }
    const sL = colLetter(FIRST_WEEK_COL);
    const eL = colLetter(LAST_WEEK_COL);
    row.getCell(TOTAL_COL).value = { formula: `SUM(${sL}${netRow}:${eL}${netRow})` };
    applyMoneyRow(netRow);
    for (let c = 1; c <= TOTAL_COL; c++) {
      row.getCell(c).fill = fillSolid(C.lightGreen);
      row.getCell(c).font = { ...row.getCell(c).font, bold: true };
    }
  }

  // Closing Cash Balance — hardcoded from forecast (preserves opening-balance chain)
  rowIndex += 1;
  const closingRow = rowIndex;
  {
    const row = ws.getRow(closingRow);
    row.getCell(1).value = "Closing Cash Balance";
    row.getCell(2).value = actuals["closingBalance"] != null ? Math.round(actuals["closingBalance"]) : null;
    weeks.forEach((w, i) => {
      row.getCell(FIRST_WEEK_COL + i).value = Math.round(w.closingBalance);
    });
    row.getCell(TOTAL_COL).value = "";
    applyMoneyRow(closingRow);
    for (let c = 1; c <= TOTAL_COL; c++) {
      row.getCell(c).fill = fillSolid(C.lightGreen);
      row.getCell(c).font = { ...row.getCell(c).font, bold: true };
    }
  }

  writeBlank();

  // ===================== Analytics =====================
  // Below Minimum Cash?
  rowIndex += 1;
  {
    const r = rowIndex;
    const row = ws.getRow(r);
    row.getCell(1).value = "⚠ Below Minimum Cash?";
    row.getCell(2).value = "";
    weeks.forEach((w, i) => {
      const cell = row.getCell(FIRST_WEEK_COL + i);
      if (w.belowFloor) {
        cell.value = "⚠ YES";
        cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: C.red } };
      } else {
        cell.value = "—";
      }
      cell.alignment = { horizontal: "center" };
    });
    row.getCell(1).alignment = { horizontal: "left", indent: 1 };
    row.getCell(1).font = { ...row.getCell(1).font, bold: true };
  }

  // Cash Headroom
  rowIndex += 1;
  {
    const r = rowIndex;
    const row = ws.getRow(r);
    row.getCell(1).value = `Cash Headroom vs. $${(minCashThreshold / 1_000_000).toFixed(0)}M Floor`;
    weeks.forEach((w, i) => {
      row.getCell(FIRST_WEEK_COL + i).value = Math.round(w.headroom);
    });
    applyMoneyRow(r);
  }

  // Net Monthly Burn
  rowIndex += 1;
  {
    const r = rowIndex;
    const row = ws.getRow(r);
    row.getCell(1).value = "Net Monthly Burn (4-wk rolling avg)";
    weeks.forEach((w, i) => {
      const cell = row.getCell(FIRST_WEEK_COL + i);
      if (w.trailingMonthlyBurn == null) {
        cell.value = "CF Positive";
        cell.alignment = { horizontal: "center" };
      } else {
        cell.value = Math.round(w.trailingMonthlyBurn);
        cell.numFmt = MONEY_FMT;
        cell.alignment = { horizontal: "right" };
      }
    });
    row.getCell(1).alignment = { horizontal: "left", indent: 1 };
  }

  // Runway
  rowIndex += 1;
  {
    const r = rowIndex;
    const row = ws.getRow(r);
    row.getCell(1).value = "Expected Runway (months)";
    weeks.forEach((w, i) => {
      const cell = row.getCell(FIRST_WEEK_COL + i);
      if (w.runwayMonths == null) {
        cell.value = "CF Positive";
        cell.alignment = { horizontal: "center" };
      } else {
        cell.value = Number(w.runwayMonths.toFixed(1));
        cell.numFmt = RUNWAY_FMT;
        cell.alignment = { horizontal: "right" };
      }
    });
    row.getCell(1).alignment = { horizontal: "left", indent: 1 };
  }

  // ===================== Variance sheet =====================
  const varSheet = wb.addWorksheet("Variance");
  varSheet.columns = [
    { header: "Week", key: "week", width: 12 },
    { header: "Line item", key: "key", width: 28 },
    { header: "Modeled", key: "modeled", width: 14 },
    { header: "Actual", key: "actual", width: 14 },
    { header: "Variance $", key: "dollar", width: 14 },
    { header: "Variance %", key: "pct", width: 12 },
    { header: "Severity", key: "severity", width: 12 },
  ];
  // Style header
  varSheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: C.white } };
    cell.fill = fillSolid(C.navy);
    cell.alignment = { horizontal: "center" };
  });

  const varEnd = addDays(weeks[W - 1].weekStartDate, 7);
  const { data: snaps } = await supabase
    .from("variance_snapshots")
    .select("*")
    .gte("week_start_date", weeks[0].weekStartDate.toISOString().slice(0, 10))
    .lt("week_start_date", varEnd.toISOString().slice(0, 10))
    .order("week_start_date", { ascending: true });

  for (const s of (snaps ?? []) as Array<{
    week_start_date: string;
    assumption_key: string;
    modeled: number;
    actual: number;
  }>) {
    const modeled = Number(s.modeled);
    const actual = Number(s.actual);
    const dollar = actual - modeled;
    const pct = modeled === 0 ? 0 : (dollar / Math.abs(modeled)) * 100;
    const absD = Math.abs(dollar);
    const absP = Math.abs(pct);
    let severity = "ok";
    if (absP > 10 && absD >= 5000) {
      severity = absP > 50 || absD > 100_000 ? "critical" : absP > 20 || absD > 10_000 ? "warning" : "info";
    }
    const row = varSheet.addRow({
      week: s.week_start_date,
      key: s.assumption_key,
      modeled: Math.round(modeled),
      actual: Math.round(actual),
      dollar: Math.round(dollar),
      pct: Number(pct.toFixed(1)),
      severity,
    });
    row.getCell("modeled").numFmt = MONEY_FMT;
    row.getCell("actual").numFmt = MONEY_FMT;
    row.getCell("dollar").numFmt = MONEY_FMT;
    row.getCell("pct").numFmt = "0.0";
  }

  // ===================== Assumptions sheet =====================
  if (extras?.assumptions && extras.assumptions.length > 0) {
    const aSheet = wb.addWorksheet("Assumptions", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    aSheet.columns = [
      { header: "Category", key: "category", width: 20 },
      { header: "Key", key: "key", width: 35 },
      { header: "Value", key: "value", width: 18 },
    ];
    aSheet.getRow(1).font = { bold: true };
    const sortedA = [...extras.assumptions].sort((a, b) => {
      const c = (a.category ?? "").localeCompare(b.category ?? "");
      return c !== 0 ? c : a.key.localeCompare(b.key);
    });
    for (const r of sortedA) {
      aSheet.addRow({ category: r.category, key: r.key, value: r.value });
    }
  }

  // ===================== AR Schedule sheet =====================
  if (extras?.arEntries && extras.arEntries.length > 0) {
    const arSheet = wb.addWorksheet("AR Schedule", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    arSheet.columns = [
      { header: "Customer", key: "customer", width: 30 },
      { header: "Invoice Amount", key: "invoice_amount", width: 16 },
      { header: "Due Date", key: "due_date", width: 14 },
      { header: "Expected Collection", key: "expected_collection_date", width: 20 },
      { header: "Status", key: "status", width: 14 },
      { header: "Probability", key: "probability", width: 12 },
    ];
    arSheet.getRow(1).font = { bold: true };
    const sortedAr = [...extras.arEntries].sort((a, b) =>
      (a.expected_collection_date ?? "").localeCompare(b.expected_collection_date ?? "")
    );
    for (const r of sortedAr) {
      const prob =
        r.probability == null
          ? null
          : r.probability > 1
          ? r.probability / 100
          : r.probability;
      const row = arSheet.addRow({
        customer: r.customer,
        invoice_amount: Number(r.invoice_amount) || 0,
        due_date: r.due_date ?? "",
        expected_collection_date: r.expected_collection_date ?? "",
        status: r.status ?? "",
        probability: prob,
      });
      row.getCell("invoice_amount").numFmt = "$#,##0";
      row.getCell("probability").numFmt = "0%";
    }
  }

  // ===================== Future Hires sheet =====================
  if (extras?.futureHires && extras.futureHires.length > 0) {
    const hSheet = wb.addWorksheet("Future Hires", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    hSheet.columns = [
      { header: "Role", key: "role", width: 30 },
      { header: "Department", key: "department", width: 20 },
      { header: "Start Date", key: "start_date", width: 14 },
      { header: "Annual Salary", key: "annual_salary", width: 16 },
      { header: "Monthly Cost", key: "monthly_cost", width: 16 },
    ];
    hSheet.getRow(1).font = { bold: true };
    const sortedH = [...extras.futureHires].sort((a, b) =>
      (a.start_date ?? "").localeCompare(b.start_date ?? "")
    );
    for (const r of sortedH) {
      const annual = Number(r.annual_salary) || 0;
      const row = hSheet.addRow({
        role: r.role,
        department: r.department ?? "",
        start_date: r.start_date ?? "",
        annual_salary: annual,
        monthly_cost: annual / 12,
      });
      row.getCell("annual_salary").numFmt = "$#,##0";
      row.getCell("monthly_cost").numFmt = "$#,##0";
    }
  }

  // ===================== Save =====================
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vapi-cash-flow-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
