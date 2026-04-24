import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatWeekRange } from "@/lib/format";
import type { CashFlowBreakdown, JoinedWeek } from "@/lib/varianceAnalysis";

interface Props {
  weeks: JoinedWeek[];
}

const tickShort = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const moneyShort = (n: number) => formatCurrency(n, { compact: true });

const COLOR_INFLOW = "hsl(var(--success))";
const COLOR_OUTFLOW = "hsl(var(--destructive))";
const COLOR_NAVY = "hsl(var(--sidebar-background))";
const COLOR_AMBER = "hsl(var(--warning))";

interface Datum {
  week: string;
  fullWeek: string;
  actualInflow: number;
  // Outflow rendered as negative so it sits below the zero line.
  actualOutflow: number;
  modeledInflow: number;
  modeledOutflow: number;
  net: number;
  actualBreakdown: CashFlowBreakdown;
  modeledBreakdown: CashFlowBreakdown;
}

const InflowRows = ({ b, color }: { b: CashFlowBreakdown; color: string }) => (
  <>
    <span className="text-muted-foreground" style={{ color }}>Stripe</span>
    <span className="text-right tabular-nums">{formatCurrency(b.stripe)}</span>
    <span className="text-muted-foreground" style={{ color }}>Enterprise ACH</span>
    <span className="text-right tabular-nums">{formatCurrency(b.enterprise)}</span>
    <span className="text-muted-foreground" style={{ color }}>A/R</span>
    <span className="text-right tabular-nums">{formatCurrency(b.ar)}</span>
  </>
);

const OutflowRows = ({ b, color }: { b: CashFlowBreakdown; color: string }) => (
  <>
    <span className="text-muted-foreground" style={{ color }}>Payroll</span>
    <span className="text-right tabular-nums">{formatCurrency(b.payroll)}</span>
    <span className="text-muted-foreground" style={{ color }}>COGS</span>
    <span className="text-right tabular-nums">{formatCurrency(b.cogs)}</span>
    <span className="text-muted-foreground" style={{ color }}>Card</span>
    <span className="text-right tabular-nums">{formatCurrency(b.card)}</span>
    <span className="text-muted-foreground" style={{ color }}>OpEx</span>
    <span className="text-right tabular-nums">{formatCurrency(b.opex)}</span>
    <span className="text-muted-foreground" style={{ color }}>Rent</span>
    <span className="text-right tabular-nums">{formatCurrency(b.rent)}</span>
  </>
);

const ChartTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as Datum;
  // Which bar/line is being hovered? Recharts gives us the dataKey.
  const hoveredKey: string | undefined = payload[0]?.dataKey;
  const showInflow = hoveredKey === "actualInflow" || hoveredKey === "modeledInflow";
  const showOutflow = hoveredKey === "actualOutflow" || hoveredKey === "modeledOutflow";
  const showBoth = !showInflow && !showOutflow; // net line or general hover

  return (
    <div className="min-w-[220px] rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <div className="mb-2 font-semibold">{d.fullWeek}</div>

      {(showInflow || showBoth) && (
        <div className="mb-2">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: COLOR_INFLOW }}>
            Inflows · {formatCurrency(d.actualInflow)} actual
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <InflowRows b={d.actualBreakdown} color={COLOR_INFLOW} />
          </div>
        </div>
      )}

      {(showOutflow || showBoth) && (
        <div className="mb-2">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: COLOR_OUTFLOW }}>
            Outflows · {formatCurrency(Math.abs(d.actualOutflow))} actual
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <OutflowRows b={d.actualBreakdown} color={COLOR_OUTFLOW} />
          </div>
        </div>
      )}

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-border pt-2">
        <span className="text-muted-foreground">Modeled In</span>
        <span className="text-right tabular-nums">{formatCurrency(d.modeledInflow)}</span>
        <span className="text-muted-foreground">Modeled Out</span>
        <span className="text-right tabular-nums">{formatCurrency(Math.abs(d.modeledOutflow))}</span>
        <span className="font-medium">Net</span>
        <span
          className="text-right font-medium tabular-nums"
          style={{ color: d.net >= 0 ? COLOR_INFLOW : COLOR_AMBER }}
        >
          {d.net >= 0 ? "+" : ""}
          {formatCurrency(d.net)}
        </span>
      </div>
    </div>
  );
};

export const CashInOutChart = ({ weeks }: Props) => {
  if (weeks.length === 0) return null;

  const data: Datum[] = weeks.map((w) => ({
    week: tickShort(w.weekStart),
    fullWeek: formatWeekRange(new Date(w.weekStart)),
    actualInflow: w.actualInflows,
    actualOutflow: -w.actualOutflows,
    modeledInflow: w.modeledInflows,
    modeledOutflow: -w.modeledOutflows,
    net: w.actualInflows - w.actualOutflows,
    actualBreakdown: w.actualBreakdown,
    modeledBreakdown: w.modeledBreakdown,
  }));

  const last = weeks[weeks.length - 1];
  const lastNet = last.actualInflows - last.actualOutflows;
  const modeledNet = last.modeledInflows - last.modeledOutflows;
  const vsModel = lastNet - modeledNet;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Cash In vs Cash Out</h2>
          <p className="text-xs text-muted-foreground">
            Solid bars = actual, dotted outlines = modeled. Navy line tracks net cash flow.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_INFLOW }} />
            Actual In
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_OUTFLOW }} />
            Actual Out
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm border-2"
              style={{ borderColor: COLOR_INFLOW, borderStyle: "dashed" }}
            />
            Modeled In
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm border-2"
              style={{ borderColor: COLOR_OUTFLOW, borderStyle: "dashed" }}
            />
            Modeled Out
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4" style={{ background: COLOR_NAVY }} />
            Net
          </span>
        </div>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }} barGap={2} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={moneyShort}
              stroke="hsl(var(--muted-foreground))"
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
            <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.4} />

            {/* Solid actual bars */}
            <Bar dataKey="actualInflow" name="Actual In" fill={COLOR_INFLOW} radius={[3, 3, 0, 0]} />
            <Bar dataKey="actualOutflow" name="Actual Out" fill={COLOR_OUTFLOW} radius={[0, 0, 3, 3]} />

            {/* Dotted-outline modeled bars (transparent fill, dashed stroke) */}
            <Bar
              dataKey="modeledInflow"
              name="Modeled In"
              fill="transparent"
              stroke={COLOR_INFLOW}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              radius={[3, 3, 0, 0]}
            />
            <Bar
              dataKey="modeledOutflow"
              name="Modeled Out"
              fill="transparent"
              stroke={COLOR_OUTFLOW}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              radius={[0, 0, 3, 3]}
            />

            {/* Net cash flow line — navy, amber when below zero */}
            <Line
              type="monotone"
              dataKey="net"
              name="Net"
              stroke={COLOR_NAVY}
              strokeWidth={2}
              dot={(props: any) => {
                const { cx, cy, payload, index } = props;
                const fill = (payload?.net ?? 0) < 0 ? COLOR_AMBER : COLOR_NAVY;
                return <circle key={`net-dot-${index}`} cx={cx} cy={cy} r={3.5} fill={fill} stroke={fill} />;
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 text-sm text-foreground">
        <span className="font-medium">Last week:</span>{" "}
        <span className="tabular-nums" style={{ color: COLOR_INFLOW }}>
          {formatCurrency(last.actualInflows, { compact: true })} in
        </span>
        {", "}
        <span className="tabular-nums" style={{ color: COLOR_OUTFLOW }}>
          {formatCurrency(last.actualOutflows, { compact: true })} out
        </span>
        {", net "}
        <span
          className="font-medium tabular-nums"
          style={{ color: lastNet >= 0 ? COLOR_INFLOW : COLOR_AMBER }}
        >
          {lastNet >= 0 ? "+" : ""}
          {formatCurrency(lastNet, { compact: true })}
        </span>{" "}
        — {vsModel >= 0 ? "above" : "below"} model by{" "}
        <span className="font-medium tabular-nums">{formatCurrency(Math.abs(vsModel), { compact: true })}</span>.
      </div>
    </Card>
  );
};

// Silence unused-import warning in some bundlers when Cell is only conditionally referenced.
void Cell;
