// Reconciliation banner for the single-file import preview.
// - mismatch  → amber banner + explicit "Reviewed" checkbox required to import
// - no_balance → neutral info note (no block)
// - partial    → neutral info note (no block)
// - ok         → renders nothing
import { AlertTriangle, Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { ReconciliationResult } from "@/lib/bankParsers/reconcile";

interface Props {
  recon: ReconciliationResult;
  ack: boolean;
  onAckChange: (v: boolean) => void;
}

const warnText = "text-[hsl(var(--warn-amber))]";
const warnBg = "bg-[hsl(var(--warn-amber))]/10";
const warnBorder = "border-[hsl(var(--warn-amber))]/40";

export const ReconciliationBanner = ({ recon, ack, onAckChange }: Props) => {
  if (recon.status === "ok") return null;

  if (recon.status === "mismatch") {
    return (
      <div
        className={cn(
          "rounded-md border p-3 text-sm",
          warnBorder,
          warnBg,
          warnText,
        )}
      >
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-2">
            <div className="font-medium">
              Parsed transactions don't reconcile to the statement balance —
              review before importing.
            </div>
            <div className="text-xs">
              Recent window {recon.windowStartDate} → {recon.lastDate} (
              {recon.windowRowCount} rows). Recorded movement{" "}
              <span className="font-medium">
                {formatCurrency(recon.expectedDelta ?? 0)}
              </span>
              , summed transactions{" "}
              <span className="font-medium">
                {formatCurrency(recon.computedDelta ?? 0)}
              </span>
              , diff{" "}
              <span className="font-medium">
                {formatCurrency(recon.diff ?? 0)}
              </span>{" "}
              (tolerance {formatCurrency(recon.tolerance)}).
            </div>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={ack}
                onCheckedChange={(c) => onAckChange(Boolean(c))}
              />
              <span>
                I've reviewed this discrepancy and want to import anyway.
              </span>
            </label>
          </div>
        </div>
      </div>
    );
  }

  // no_balance + partial → neutral info note
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>{recon.message}</div>
      </div>
    </div>
  );
};
