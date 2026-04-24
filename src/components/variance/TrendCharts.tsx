import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatWeekRange } from "@/lib/format";
import { topVarianceDrivers, type JoinedWeek } from "@/lib/varianceAnalysis";

interface Props {
  weeks: JoinedWeek[];
}

const tickShort = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const moneyShort = (n: number) => formatCurrency(n, { compact: true });

const ChartCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Card className="p-4">
    <div className="mb-2 text-sm font-semibold text-foreground">{title}</div>
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children as any}
      </ResponsiveContainer>
    </div>
  </Card>
);

export const TrendCharts = ({ weeks }: Props) => {
  const series = weeks.map((w) => ({
    week: tickShort(w.weekStart),
    fullWeek: formatWeekRange(new Date(w.weekStart)),
    modeledClosing: w.modeledClosing,
    actualClosing: w.actualClosing,
    modeledBurn: w.modeledBurn,
    actualBurn: w.actualBurn,
    actualRunway: w.actualRunwayMonths ?? 0,
  }));

  const drivers = topVarianceDrivers(weeks, 3).map((d) => ({
    name: d.label,
    pct: Number(d.averagePct.toFixed(1)),
  }));

  const lineColors = {
    actual: "hsl(var(--primary))",
    modeled: "hsl(var(--muted-foreground))",
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard title="Closing Balance — Modeled vs Actual">
        <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={moneyShort} stroke="hsl(var(--muted-foreground))" />
          <Tooltip
            formatter={(v: number) => formatCurrency(v)}
            labelFormatter={(_, p) => (p?.[0]?.payload as any)?.fullWeek ?? ""}
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
          />
          <Line type="monotone" dataKey="modeledClosing" name="Modeled" stroke={lineColors.modeled} strokeDasharray="4 4" dot={false} />
          <Line type="monotone" dataKey="actualClosing" name="Actual" stroke={lineColors.actual} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ChartCard>

      <ChartCard title="Weekly Burn Rate — Modeled vs Actual">
        <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={moneyShort} stroke="hsl(var(--muted-foreground))" />
          <Tooltip
            formatter={(v: number) => formatCurrency(v)}
            labelFormatter={(_, p) => (p?.[0]?.payload as any)?.fullWeek ?? ""}
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
          />
          <Line type="monotone" dataKey="modeledBurn" name="Modeled" stroke={lineColors.modeled} strokeDasharray="4 4" dot={false} />
          <Line type="monotone" dataKey="actualBurn" name="Actual" stroke={lineColors.actual} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ChartCard>

      <ChartCard title="Runway (Months) — Actual">
        <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <Tooltip
            formatter={(v: number) => `${v.toFixed(1)} mo`}
            labelFormatter={(_, p) => (p?.[0]?.payload as any)?.fullWeek ?? ""}
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
          />
          <Line type="monotone" dataKey="actualRunway" name="Runway" stroke={lineColors.actual} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ChartCard>

      <ChartCard title="Top 3 Variance Drivers (Avg %)">
        {drivers.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Not enough line-item actuals yet.
          </div>
        ) : (
          <BarChart data={drivers} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} stroke="hsl(var(--muted-foreground))" />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} stroke="hsl(var(--muted-foreground))" />
            <Tooltip
              formatter={(v: number) => `${v}%`}
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
            />
            <Bar dataKey="pct" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
          </BarChart>
        )}
      </ChartCard>
    </div>
  );
};
