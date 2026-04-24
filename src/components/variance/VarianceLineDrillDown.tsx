import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { JoinedWeek } from "@/lib/varianceAnalysis";

interface Props {
  week: JoinedWeek;
}

const rowTone = (pct: number) => {
  const a = Math.abs(pct);
  if (a > 25) return "bg-destructive/10";
  if (a > 10) return "bg-warning/10";
  return "";
};

export const VarianceLineDrillDown = ({ week }: Props) => {
  if (week.lines.length === 0) {
    return (
      <div className="px-6 py-4 text-xs text-muted-foreground">
        No line-item actuals were entered for this week.
      </div>
    );
  }

  // Group lines by group label for readability.
  const grouped = week.lines.reduce<Record<string, typeof week.lines>>((acc, l) => {
    (acc[l.group] ??= []).push(l);
    return acc;
  }, {});

  return (
    <div className="px-6 py-4">
      <Table>
        <TableHeader>
          <TableRow className="border-border">
            <TableHead className="h-8 text-xs">Line item</TableHead>
            <TableHead className="h-8 text-right text-xs">Modeled</TableHead>
            <TableHead className="h-8 text-right text-xs">Actual</TableHead>
            <TableHead className="h-8 text-right text-xs">Variance $</TableHead>
            <TableHead className="h-8 text-right text-xs">Variance %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Object.entries(grouped).map(([group, lines]) => (
            <>
              <TableRow key={`g-${group}`} className="border-0 hover:bg-transparent">
                <TableCell colSpan={5} className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </TableCell>
              </TableRow>
              {lines.map((l) => {
                const positive = l.delta >= 0;
                return (
                  <TableRow key={`${group}-${l.key}`} className={cn("border-border/60", rowTone(l.pct))}>
                    <TableCell className="py-1.5 text-sm">{l.label}</TableCell>
                    <TableCell className="py-1.5 text-right text-sm tabular-nums">{formatCurrency(l.modeled)}</TableCell>
                    <TableCell className="py-1.5 text-right text-sm tabular-nums">{formatCurrency(l.actual)}</TableCell>
                    <TableCell
                      className={cn(
                        "py-1.5 text-right text-sm tabular-nums",
                        positive ? "text-[hsl(var(--success))]" : "text-destructive"
                      )}
                    >
                      {positive ? "+" : ""}
                      {formatCurrency(l.delta)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "py-1.5 text-right text-sm tabular-nums",
                        positive ? "text-[hsl(var(--success))]" : "text-destructive"
                      )}
                    >
                      {positive ? "+" : ""}
                      {formatPercent(l.pct)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
