import * as XLSX from "xlsx";
import { format } from "date-fns";
import type { ForecastResult } from "./forecast";

const fmt = (n: number) => Math.round(n);

export const exportForecastToExcel = (
  forecast: ForecastResult,
  actuals: Record<string, number> = {}
) => {
  const { weeks, cogsRows, opexRows, rentRow, minCashThreshold } = forecast;

  const headerRow = [
    "Line item",
    "Actuals (prior wk)",
    ...weeks.map((w) => `W${w.weekIndex + 1} ${format(w.weekStartDate, "MMM d")}`),
    "13-Wk Total",
  ];

  const rows: (string | number)[][] = [];

  const totalOf = (arr: number[]) => arr.reduce((s, v) => s + v, 0);

  const pushRow = (label: string, weekVals: number[], actualKey?: string) => {
    rows.push([
      label,
      actualKey ? fmt(actuals[actualKey] ?? 0) : "",
      ...weekVals.map(fmt),
      fmt(totalOf(weekVals)),
    ]);
  };

  // INFLOWS
  rows.push(["INFLOWS", "", ...new Array(weeks.length).fill(""), ""]);
  pushRow("Opening Balance", weeks.map((w) => w.openingBalance), "openingBalance");
  pushRow("Stripe Revenue", weeks.map((w) => w.stripeRevenue), "stripeRevenue");
  pushRow("Enterprise ACH", weeks.map((w) => w.enterpriseRevenue), "enterpriseRevenue");
  pushRow("A/R Collections", weeks.map((w) => w.arCollections), "arCollections");
  pushRow("TOTAL INFLOWS", weeks.map((w) => w.totalInflows), "totalInflows");

  // OUTFLOWS
  rows.push(["OUTFLOWS", "", ...new Array(weeks.length).fill(""), ""]);
  pushRow("Payroll", weeks.map((w) => w.payroll), "payroll");
  rows.push(["— COGS —", "", ...new Array(weeks.length).fill(""), ""]);
  for (const r of cogsRows) {
    pushRow(r.label, r.weeks, `cogs_${r.key}`);
  }
  pushRow("TOTAL COGS", weeks.map((w) => w.cogsTotal));
  pushRow("Brex Card Payment", weeks.map((w) => w.brexCard), "brexCard");
  rows.push(["— OPEX —", "", ...new Array(weeks.length).fill(""), ""]);
  for (const r of opexRows) {
    pushRow(r.label, r.weeks, `opex_${r.key}`);
  }
  pushRow("Rent", rentRow, "rent");
  pushRow("TOTAL OUTFLOWS", weeks.map((w) => w.totalOutflows), "totalOutflows");

  // NET & CLOSING
  rows.push(["NET & CLOSING", "", ...new Array(weeks.length).fill(""), ""]);
  pushRow("Net Cash Flow", weeks.map((w) => w.netChange), "netChange");
  pushRow("Closing Balance", weeks.map((w) => w.closingBalance), "closingBalance");

  // ANALYTICS
  rows.push(["ANALYTICS", "", ...new Array(weeks.length).fill(""), ""]);
  rows.push([
    "Below $15M Floor?",
    "",
    ...weeks.map((w) => (w.belowFloor ? "⚠ YES" : "")),
    "",
  ]);
  rows.push([
    `Headroom vs $${(minCashThreshold / 1e6).toFixed(0)}M`,
    "",
    ...weeks.map((w) => fmt(w.headroom)),
    "",
  ]);
  rows.push([
    "Net Monthly Burn",
    "",
    ...weeks.map((w) => (w.trailingMonthlyBurn == null ? "CF Positive" : fmt(w.trailingMonthlyBurn))),
    "",
  ]);
  rows.push([
    "Runway (months)",
    "",
    ...weeks.map((w) => (w.runwayMonths == null ? "CF Positive" : Number(w.runwayMonths.toFixed(1)))),
    "",
  ]);
  rows.push([
    "Projected Cash-Out",
    "",
    ...weeks.map((w) => w.cashOutDate ?? "CF Positive"),
    "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...rows]);

  // Column widths
  ws["!cols"] = [{ wch: 28 }, { wch: 16 }, ...weeks.map(() => ({ wch: 14 })), { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "13-Week Forecast");

  const filename = `vapi-cash-flow-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
  XLSX.writeFile(wb, filename);
};
