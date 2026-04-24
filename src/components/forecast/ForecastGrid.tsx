import { format } from "date-fns";
import { Check, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ActualsCell } from "./ActualsCell";
import type { ForecastResult } from "@/lib/forecast";
import type { WeekSignoff } from "@/hooks/useControls";

const fmt = (v: number) => {
  if (!v || Math.abs(v) < 0.5) return "—";
  const compact = formatCurrency(Math.abs(v), { compact: true });
  return v < 0 ? `(${compact})` : compact;
};

interface Props {
  forecast: ForecastResult;
  actuals: Record<string, number>;
  onActualChange: (rowKey: string, value: number) => void;
  signoffs?: Record<string, WeekSignoff>; // keyed by week_start_date ISO
  isApprover?: boolean;
  onSignOff?: (weekStartIso: string) => void;
  onUnsign?: (weekStartIso: string) => void;
}

const STICKY = "sticky left-0 z-10 bg-card";
const STICKY_HEAD = "sticky left-0 z-20 bg-card";

const inputBg = "bg-[hsl(var(--input-blue))] text-[hsl(var(--input-blue-fg))]";
const estimateBg = "bg-[hsl(var(--estimate-yellow))] text-[hsl(var(--estimate-yellow-fg))]";
const linkText = "text-[hsl(var(--link-green))]";
const inflowFill = "bg-[hsl(var(--inflow-green))] text-[hsl(var(--inflow-green-fg))]";
const outflowFill = "bg-[hsl(var(--outflow-red))] text-[hsl(var(--outflow-red-fg))]";
const lockedTint = "bg-[hsl(var(--success))]/5";

export const ForecastGrid = ({
  forecast,
  actuals,
  onActualChange,
  signoffs = {},
  isApprover = false,
  onSignOff,
  onUnsign,
}: Props) => {
  const { weeks, cogsRows, opexRows, rentRow, minCashThreshold } = forecast;

  const weekIsoOf = (i: number) => weeks[i].weekStartDate.toISOString().slice(0, 10);
  const lockedAt = (i: number) => Boolean(signoffs[weekIsoOf(i)]);

  const total = (arr: number[]) => arr.reduce((s, v) => s + v, 0);

  const renderRow = (
    label: string,
    weekVals: number[],
    opts: {
      actualKey?: string;
      labelClass?: string;
      cellClass?: string;
      stickyClass?: string;
      bold?: boolean;
      italic?: boolean;
    } = {}
  ) => {
    const { actualKey, labelClass, cellClass, stickyClass, bold, italic } = opts;
    return (
      <TableRow key={label}>
        <TableCell
          className={cn(
            STICKY,
            "whitespace-nowrap min-w-[220px]",
            stickyClass,
            bold && "font-semibold",
            italic && "italic",
            labelClass
          )}
        >
          {label}
        </TableCell>
        <TableCell className={cn("min-w-[120px] p-1", inputBg)}>
          {actualKey ? (
            <ActualsCell
              value={actuals[actualKey] ?? 0}
              onCommit={(v) => onActualChange(actualKey, v)}
              format={(n) => formatCurrency(n, { compact: true })}
            />
          ) : null}
        </TableCell>
        {weekVals.map((v, i) => (
          <TableCell
            key={i}
            className={cn(
              "text-right tabular-nums min-w-[110px]",
              cellClass,
              bold && "font-semibold",
              italic && "italic",
              lockedAt(i) && lockedTint
            )}
          >
            {fmt(v)}
          </TableCell>
        ))}
        <TableCell
          className={cn("text-right tabular-nums min-w-[120px] font-semibold", cellClass, italic && "italic")}
        >
          {fmt(total(weekVals))}
        </TableCell>
      </TableRow>
    );
  };

  const renderTextRow = (
    label: string,
    cellTexts: string[],
    opts: { labelClass?: string; cellClass?: string; italic?: boolean } = {}
  ) => (
    <TableRow key={label}>
      <TableCell className={cn(STICKY, "whitespace-nowrap min-w-[220px]", opts.labelClass, opts.italic && "italic")}>
        {label}
      </TableCell>
      <TableCell className={cn("min-w-[120px]", inputBg)}>—</TableCell>
      {cellTexts.map((t, i) => (
        <TableCell key={i} className={cn("text-right text-xs min-w-[110px]", opts.cellClass, opts.italic && "italic", lockedAt(i) && lockedTint)}>
          {t}
        </TableCell>
      ))}
      <TableCell className={cn("text-right text-xs min-w-[120px]", opts.cellClass, opts.italic && "italic")}>—</TableCell>
    </TableRow>
  );

  const sectionHeader = (label: string, tone: "in" | "out" | "neutral" | "analytics") => {
    const cls =
      tone === "in"
        ? inflowFill
        : tone === "out"
          ? outflowFill
          : tone === "analytics"
            ? "bg-muted text-muted-foreground italic"
            : "bg-muted text-foreground";
    return (
      <TableRow key={`section-${label}`}>
        <TableCell colSpan={weeks.length + 3} className={cn("font-semibold uppercase tracking-wide text-xs py-2", cls)}>
          {label}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table className="text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className={cn(STICKY_HEAD, "min-w-[220px]")}>Line item</TableHead>
            <TableHead className={cn("text-right min-w-[120px]", inputBg)}>
              Actuals
              <div className="font-normal text-xs opacity-70">prior wk</div>
            </TableHead>
            {weeks.map((w, i) => {
              const iso = weekIsoOf(i);
              const so = signoffs[iso];
              return (
                <TableHead
                  key={w.weekIndex}
                  className={cn("text-right min-w-[110px] align-top", so && lockedTint)}
                >
                  <div>W{w.weekIndex + 1}</div>
                  <div className="font-normal text-xs text-muted-foreground">
                    {format(w.weekStartDate, "MMM d")}
                  </div>
                  <div className="mt-1">
                    {so ? (
                      <button
                        type="button"
                        onClick={() => isApprover && onUnsign?.(iso)}
                        title={`Approved by ${so.approved_by_email} · ${format(new Date(so.approved_at), "MMM d, h:mma")}`}
                        className={cn(
                          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                          "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]",
                          isApprover && "hover:bg-[hsl(var(--success))]/25 cursor-pointer"
                        )}
                      >
                        <Check className="h-3 w-3" />
                        Approved
                      </button>
                    ) : isApprover ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onSignOff?.(iso)}
                        className="h-5 px-1.5 text-[10px] font-normal text-muted-foreground hover:text-foreground"
                      >
                        <ShieldCheck className="mr-1 h-3 w-3" />
                        Sign off
                      </Button>
                    ) : null}
                  </div>
                </TableHead>
              );
            })}
            <TableHead className="text-right min-w-[120px] font-semibold">13-Wk Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* INFLOWS */}
          {sectionHeader("Inflows", "in")}
          {renderRow("Opening Balance", weeks.map((w) => w.openingBalance), { actualKey: "openingBalance" })}
          {renderRow("Stripe Revenue", weeks.map((w) => w.stripeRevenue), { actualKey: "stripeRevenue" })}
          {renderRow("Enterprise ACH", weeks.map((w) => w.enterpriseRevenue), { actualKey: "enterpriseRevenue" })}
          {renderRow("A/R Collections", weeks.map((w) => w.arCollections), {
            actualKey: "arCollections",
            cellClass: linkText,
          })}
          {renderRow("TOTAL INFLOWS", weeks.map((w) => w.totalInflows), {
            actualKey: "totalInflows",
            bold: true,
            cellClass: inflowFill,
            stickyClass: inflowFill,
          })}

          {/* OUTFLOWS */}
          {sectionHeader("Outflows", "out")}
          {renderRow("Payroll", weeks.map((w) => w.payroll), { actualKey: "payroll" })}

          {cogsRows.map((row) =>
            renderRow(row.label, row.weeks, {
              actualKey: `cogs_${row.key}`,
              cellClass: estimateBg,
            })
          )}
          {renderRow("TOTAL COGS", weeks.map((w) => w.cogsTotal), { bold: true })}

          {renderRow("Brex Card Payment", weeks.map((w) => w.brexCard), { actualKey: "brexCard" })}

          {opexRows.map((row) =>
            renderRow(row.label, row.weeks, {
              actualKey: `opex_${row.key}`,
              cellClass: estimateBg,
            })
          )}
          {renderRow("Rent", rentRow, { actualKey: "rent" })}

          {renderRow("TOTAL OUTFLOWS", weeks.map((w) => w.totalOutflows), {
            actualKey: "totalOutflows",
            bold: true,
            cellClass: outflowFill,
            stickyClass: outflowFill,
          })}

          {/* NET & CLOSING */}
          {sectionHeader("Net & Closing", "neutral")}
          {renderRow("Net Cash Flow", weeks.map((w) => w.netChange), { actualKey: "netChange" })}
          {renderRow("Closing Balance", weeks.map((w) => w.closingBalance), {
            actualKey: "closingBalance",
            bold: true,
          })}

          {/* ANALYTICS */}
          {sectionHeader("Analytics", "analytics")}
          {renderTextRow(
            `Below $${(minCashThreshold / 1e6).toFixed(0)}M Floor?`,
            weeks.map((w) => (w.belowFloor ? "⚠ YES" : "")),
            {
              cellClass: "text-[hsl(var(--warn-amber))] font-semibold",
              italic: true,
            }
          )}
          {renderRow(
            `Cash Headroom vs $${(minCashThreshold / 1e6).toFixed(0)}M Floor`,
            weeks.map((w) => w.headroom),
            { italic: true, cellClass: "text-muted-foreground" }
          )}
          {renderTextRow(
            "Net Monthly Burn",
            weeks.map((w) =>
              w.trailingMonthlyBurn == null ? "CF Positive" : formatCurrency(w.trailingMonthlyBurn, { compact: true })
            ),
            { italic: true, cellClass: "text-muted-foreground" }
          )}
          {renderTextRow(
            "Runway (months)",
            weeks.map((w) =>
              w.runwayMonths == null ? "CF Positive" : `${w.runwayMonths.toFixed(1)} mo`
            ),
            { italic: true, cellClass: "text-muted-foreground" }
          )}
          {renderTextRow(
            "Projected Cash-Out Date",
            weeks.map((w) => w.cashOutDate ?? "CF Positive"),
            { italic: true, cellClass: "text-muted-foreground" }
          )}
        </TableBody>
      </Table>
    </div>
  );
};
