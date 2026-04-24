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
import type { JoinedWeek } from "@/lib/varianceAnalysis";

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
}

const ChartTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as Datum;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold">{d.fullWeek}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-muted-foreground">Actual In</span>
        <span className="text-right tabular-nums" style={{ color: COLOR_INFLOW }}>
          {formatCurrency(d.actualInflow)}
        </span>
        <span className="text-muted-foreground">Actual Out</span>
        <span className="text-right tabular-nums" style={{ color: COLOR_OUTFLOW }}>
          {formatCurrency(Math.abs(d.actualOutflow))}
        </span>
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
