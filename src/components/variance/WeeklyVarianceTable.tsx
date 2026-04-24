import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent, formatWeekRange } from "@/lib/format";
import { statusFromPct, type JoinedWeek } from "@/lib/varianceAnalysis";
import { VarianceLineDrillDown } from "./VarianceLineDrillDown";

interface Props {
  weeks: JoinedWeek[];
}

const STATUS_TONE: Record<string, string> = {
  on_track: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30",
  watch: "bg-warning/15 text-warning border-warning/30",
  off_track: "bg-destructive/15 text-destructive border-destructive/30",
};
const STATUS_LABEL: Record<string, string> = {
  on_track: "On Track",
  watch: "Watch",
  off_track: "Off Track",
};

export const WeeklyVarianceTable = ({ weeks }: Props) => {
  const [openWeek, setOpenWeek] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      weeks.map((w) => {
        const delta = w.actualClosing - w.modeledClosing;
        const pct = w.modeledClosing === 0 ? 0 : (delta / Math.abs(w.modeledClosing)) * 100;
        const status = statusFromPct(pct);
        return { w, delta, pct, status };
      }),
    [weeks]
  );

  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground" />
        <div className="text-sm font-medium">No completed weeks yet</div>
        <p className="text-xs text-muted-foreground">
          Enter actuals on the Dashboard for a past week, and save a forecast snapshot, to see variance here.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Week</TableHead>
            <TableHead className="text-right">Modeled Closing</TableHead>
            <TableHead className="text-right">Actual Closing</TableHead>
            <TableHead className="text-right">Variance $</TableHead>
            <TableHead className="text-right">Variance %</TableHead>
            <TableHead className="text-right">Modeled Burn</TableHead>
            <TableHead className="text-right">Actual Burn</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ w, delta, pct, status }) => {
            const isOpen = openWeek === w.weekStart;
            const positive = delta >= 0;
            return (
              <>
                <TableRow
                  key={w.weekStart}
                  className="cursor-pointer"
                  onClick={() => setOpenWeek(isOpen ? null : w.weekStart)}
                >
                  <TableCell className="w-8 px-3">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{formatWeekRange(new Date(w.weekStart))}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(w.modeledClosing)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(w.actualClosing)}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums font-medium",
                      positive ? "text-[hsl(var(--success))]" : "text-destructive"
                    )}
                  >
                    {positive ? "+" : ""}
                    {formatCurrency(delta)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums font-medium",
                      positive ? "text-[hsl(var(--success))]" : "text-destructive"
                    )}
                  >
                    {positive ? "+" : ""}
                    {formatPercent(pct)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(w.modeledBurn)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(w.actualBurn)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wide", STATUS_TONE[status])}>
                      {STATUS_LABEL[status]}
                    </Badge>
                  </TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow key={`${w.weekStart}-detail`} className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={9} className="p-0">
                      <VarianceLineDrillDown week={w} />
                    </TableCell>
                  </TableRow>
                )}
              </>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
};
