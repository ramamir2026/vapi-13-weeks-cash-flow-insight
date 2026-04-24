import * as XLSX from "xlsx";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { ForecastResult } from "./forecast";

const fmt = (n: number) => Math.round(n);

export const exportForecastToExcel = async (
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

  // Audit sheet — pull entries within the forecast window
  const startIso = weeks[0].weekStartDate.toISOString();
  const endDate = new Date(weeks[weeks.length - 1].weekStartDate);
  endDate.setDate(endDate.getDate() + 7);
  const { data: audit } = await supabase
    .from("audit_log")
    .select("*")
    .gte("created_at", startIso)
    .lt("created_at", endDate.toISOString())
    .order("created_at", { ascending: false })
    .limit(5000);
  const auditAoa = [
    ["Timestamp", "User", "Action", "Table", "Row ID", "Field", "Old", "New", "Source", "Import filename"],
    ...((audit ?? []) as any[]).map((r) => [
      r.created_at,
      r.user_email ?? "",
      r.action,
      r.table_name,
      r.row_id ?? "",
      r.field_name ?? "",
      (r.old_value ?? "").toString().slice(0, 200),
      (r.new_value ?? "").toString().slice(0, 200),
      r.source,
      r.import_filename ?? "",
    ]),
  ];
  const auditWs = XLSX.utils.aoa_to_sheet(auditAoa);
  auditWs["!cols"] = [{ wch: 22 }, { wch: 28 }, { wch: 12 }, { wch: 18 }, { wch: 36 }, { wch: 18 }, { wch: 32 }, { wch: 32 }, { wch: 16 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, auditWs, "Audit");

  // Variance sheet — pull latest snapshots within forecast window
  const { data: snaps } = await supabase
    .from("variance_snapshots")
    .select("*")
    .gte("week_start_date", weeks[0].weekStartDate.toISOString().slice(0, 10))
    .lt("week_start_date", endDate.toISOString().slice(0, 10))
    .order("week_start_date", { ascending: true });

  const varianceAoa: (string | number)[][] = [
    ["Week", "Line item", "Modeled", "Actual", "Variance $", "Variance %", "Severity"],
  ];
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
    varianceAoa.push([
      s.week_start_date,
      s.assumption_key,
      fmt(modeled),
      fmt(actual),
      fmt(dollar),
      Number(pct.toFixed(1)),
      severity,
    ]);
  }
  const varianceWs = XLSX.utils.aoa_to_sheet(varianceAoa);
  varianceWs["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, varianceWs, "Variance");

  const filename = `vapi-cash-flow-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
  XLSX.writeFile(wb, filename);
};
