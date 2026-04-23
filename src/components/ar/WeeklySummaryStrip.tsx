import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";

type Props = {
  weightedWeeks: number[]; // length 13
  rawWeeks: number[]; // length 13
  weighted: boolean;
  onWeightedChange: (v: boolean) => void;
  delayDays: number;
  outOfHorizon: number;
};

export const WeeklySummaryStrip = ({
  weightedWeeks,
  rawWeeks,
  weighted,
  onWeightedChange,
  delayDays,
  outOfHorizon,
}: Props) => {
  const display = weighted ? weightedWeeks : rawWeeks;
  const total = display.reduce((s, v) => s + v, 0);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-foreground">
              Weekly Expected Collections
            </div>
            <div className="text-xs text-muted-foreground">
              Shifted by {Math.round(delayDays / 7)} week(s) from A/R delay ({delayDays}d)
              {outOfHorizon > 0 && (
                <> · {formatCurrency(outOfHorizon)} beyond W13</>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="weighted-toggle"
                checked={weighted}
                onCheckedChange={onWeightedChange}
              />
              <Label htmlFor="weighted-toggle" className="text-sm">
                Use probability-weighted
              </Label>
            </div>
            <span className="text-xs italic text-muted-foreground">
              Display toggle only — model always uses probability-weighted amounts.
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                {display.map((_, i) => (
                  <th key={i} className="px-2 py-1 text-right font-medium">
                    W{i + 1}
                  </th>
                ))}
                <th className="px-2 py-1 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {display.map((v, i) => (
                  <td key={i} className="px-2 py-1 text-right tabular-nums text-foreground">
                    {v > 0 ? formatCurrency(v, { compact: true }) : "—"}
                  </td>
                ))}
                <td className="px-2 py-1 text-right font-semibold tabular-nums text-foreground">
                  {formatCurrency(total, { compact: true })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
