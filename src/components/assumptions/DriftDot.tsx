import { useMemo } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useVarianceSnapshots } from "@/hooks/useAlerts";
import { driftLevel } from "@/lib/variance";
import { cn } from "@/lib/utils";

interface Props {
  assumptionKey: string;
  modeled: number;
}

const DOT_CLASS: Record<string, string> = {
  green: "bg-[hsl(var(--success))]",
  amber: "bg-[hsl(var(--warning))]",
  red: "bg-destructive",
  none: "bg-muted-foreground/30",
};

const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

export const DriftDot = ({ assumptionKey, modeled }: Props) => {
  const { data: snapshots = [] } = useVarianceSnapshots(assumptionKey);

  const { level, avgActual, points } = useMemo(() => {
    const last4 = snapshots.slice(0, 4);
    if (last4.length === 0) return { level: "none" as const, avgActual: 0, points: [] as number[] };
    const avg = last4.reduce((s, r) => s + Number(r.actual), 0) / last4.length;
    return {
      level: driftLevel(modeled, avg),
      avgActual: avg,
      points: [...last4].reverse().map((r) => Number(r.actual)),
    };
  }, [snapshots, modeled]);

  if (snapshots.length === 0) {
    return <span className={cn("inline-block h-2 w-2 rounded-full", DOT_CLASS.none)} aria-hidden />;
  }

  // Build inline sparkline path
  const w = 100;
  const h = 24;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = points.length > 1 ? w / (points.length - 1) : 0;
  const path = points
    .map((p, i) => {
      const x = i * stepX;
      const y = h - ((p - min) / span) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const message =
    level === "green"
      ? "Actual within 5% of assumption"
      : level === "amber"
      ? `Based on last 4 weeks, actual avg is ${fmt(avgActual)}`
      : "Assumption may need updating";

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-block h-2 w-2 rounded-full transition-transform hover:scale-125",
            DOT_CLASS[level]
          )}
          aria-label={`Drift indicator: ${level}`}
        />
      </HoverCardTrigger>
      <HoverCardContent className="w-64 space-y-2" side="left">
        <div className="text-xs font-medium">{message}</div>
        <div className="text-xs text-muted-foreground">
          Modeled: {fmt(modeled)} · 4-wk avg: {fmt(avgActual)}
        </div>
        {points.length >= 2 && (
          <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-full">
            <path
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-foreground/60"
            />
          </svg>
        )}
      </HoverCardContent>
    </HoverCard>
  );
};
