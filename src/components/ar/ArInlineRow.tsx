import { useEffect, useState } from "react";
import { Lock, Trash2, Unlock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { ArEntry } from "@/hooks/useFinanceData";

export type ArRowDraft = {
  id?: string;
  customer_name: string;
  invoice_number: string;
  invoice_amount: number;
  invoice_date: string; // YYYY-MM-DD
  expected_collection_date: string;
  notes: string;
  prob_override: number | null; // 0..100 or null
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const probabilityForAging = (days: number): number => {
  if (days <= 30) return 0.9;
  if (days <= 60) return 0.75;
  if (days <= 90) return 0.5;
  return 0.2;
};

const agingDays = (invoiceDateIso: string): number => {
  if (!invoiceDateIso) return 0;
  const ms = Date.now() - new Date(invoiceDateIso).getTime();
  return Math.max(0, Math.round(ms / 86400000));
};

const weekFromExpected = (expectedIso: string, forecastStartIso: string): number => {
  if (!expectedIso) return 1;
  const diffDays = Math.round(
    (new Date(expectedIso).getTime() - new Date(forecastStartIso).getTime()) / 86400000
  );
  return Math.min(13, Math.max(1, Math.floor(diffDays / 7) + 1));
};

const expectedFromWeek = (week: number, forecastStartIso: string): string => {
  const d = new Date(forecastStartIso);
  d.setDate(d.getDate() + (week - 1) * 7);
  return d.toISOString().slice(0, 10);
};

// Notes encoding: keep user notes plain, append "__prob_override:NN" suffix
export const parseNotes = (raw: string | null): { text: string; override: number | null } => {
  if (!raw) return { text: "", override: null };
  const m = raw.match(/^(.*?)(?:\s*__prob_override:(\d{1,3}))?$/s);
  if (!m) return { text: raw, override: null };
  const text = (m[1] ?? "").trimEnd();
  const ov = m[2] ? Math.min(100, Math.max(0, parseInt(m[2], 10))) : null;
  return { text, override: ov };
};

export const encodeNotes = (text: string, override: number | null): string => {
  const t = (text ?? "").trim();
  if (override == null) return t;
  return `${t}${t ? " " : ""}__prob_override:${Math.round(override)}`;
};

type Props = {
  entry?: ArEntry;
  forecastStartIso: string;
  onSave: (
    draft: ArRowDraft & { id?: string }
  ) => Promise<void> | void;
  onDelete?: () => void;
  isNew?: boolean;
  onCancelNew?: () => void;
  isApprover?: boolean;
  onOverrideLock?: () => void;
};

export const ArInlineRow = ({
  entry,
  forecastStartIso,
  onSave,
  onDelete,
  isNew,
  onCancelNew,
  isApprover,
  onOverrideLock,
}: Props) => {
  const initial = (() => {
    if (entry) {
      const { text, override } = parseNotes(entry.notes);
      return {
        id: entry.id,
        customer_name: entry.customer_name,
        invoice_number: entry.invoice_number ?? "",
        invoice_amount: Number(entry.invoice_amount),
        invoice_date: entry.invoice_date,
        expected_collection_date: entry.expected_collection_date,
        notes: text,
        prob_override: override,
      } as ArRowDraft;
    }
    return {
      customer_name: "",
      invoice_number: "",
      invoice_amount: 0,
      invoice_date: todayIso(),
      expected_collection_date: expectedFromWeek(1, forecastStartIso),
      notes: "",
      prob_override: null,
    } as ArRowDraft;
  })();

  const [draft, setDraft] = useState<ArRowDraft>(initial);

  // Sync external entry updates back into local state
  useEffect(() => {
    if (entry) {
      const { text, override } = parseNotes(entry.notes);
      setDraft({
        id: entry.id,
        customer_name: entry.customer_name,
        invoice_number: entry.invoice_number ?? "",
        invoice_amount: Number(entry.invoice_amount),
        invoice_date: entry.invoice_date,
        expected_collection_date: entry.expected_collection_date,
        notes: text,
        prob_override: override,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  const aging = agingDays(draft.invoice_date);
  const autoProb = Math.round(probabilityForAging(aging) * 100);
  const probDisplay = draft.prob_override ?? autoProb;
  const week = weekFromExpected(draft.expected_collection_date, forecastStartIso);
  const weighted = draft.invoice_amount * (probDisplay / 100);
  const locked = !!entry?.import_locked;
  const lockTip = locked ? `Imported from ${entry?.import_filename ?? "CSV"} — approver override required` : undefined;
  const lockTint = locked ? "bg-muted/60" : "";

  const persist = async (next: ArRowDraft) => {
    if (locked) return;
    if (isNew && (!next.customer_name.trim() || !next.invoice_amount)) return;
    await onSave({
      id: next.id,
      customer_name: next.customer_name.trim(),
      invoice_number: next.invoice_number.trim(),
      invoice_amount: next.invoice_amount,
      invoice_date: next.invoice_date,
      expected_collection_date: next.expected_collection_date,
      notes: next.notes,
      prob_override: next.prob_override,
    } as any);
  };

  const blurSave = () => {
    void persist(draft);
  };

  return (
    <TableRow>
      <TableCell className={cn("p-2", lockTint)} title={lockTip}>
        <Input
          value={draft.customer_name}
          onChange={(e) => setDraft({ ...draft, customer_name: e.target.value })}
          onBlur={blurSave}
          placeholder="Customer name"
          className="h-8"
          disabled={locked}
        />
      </TableCell>
      <TableCell className={cn("p-2", lockTint)}>
        <Input
          value={draft.invoice_number}
          onChange={(e) => setDraft({ ...draft, invoice_number: e.target.value })}
          onBlur={blurSave}
          placeholder="—"
          className="h-8"
          disabled={locked}
        />
      </TableCell>
      <TableCell className={cn("p-2", lockTint)}>
        <Input
          type="number"
          value={draft.invoice_amount || ""}
          onChange={(e) =>
            setDraft({ ...draft, invoice_amount: parseFloat(e.target.value) || 0 })
          }
          onBlur={blurSave}
          className="h-8 text-right tabular-nums"
          disabled={locked}
        />
      </TableCell>
      <TableCell className={cn("p-2", lockTint)}>
        <Input
          type="date"
          value={draft.invoice_date}
          onChange={(e) => setDraft({ ...draft, invoice_date: e.target.value })}
          onBlur={blurSave}
          className="h-8"
          disabled={locked}
        />
        <div className="mt-1 text-right text-[10px] text-muted-foreground">
          {aging}d aging
        </div>
      </TableCell>
      <TableCell className={cn("p-2", lockTint)}>
        <Input
          type="number"
          min={0}
          max={100}
          value={probDisplay}
          onChange={(e) => {
            const v = e.target.value === "" ? null : Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0));
            setDraft({ ...draft, prob_override: v });
          }}
          onBlur={blurSave}
          className="h-8 text-right tabular-nums"
          disabled={locked}
        />
        {draft.prob_override != null && (
          <div className="mt-1 text-right text-[10px] text-muted-foreground">
            override (auto {autoProb}%)
          </div>
        )}
      </TableCell>
      <TableCell className={cn("p-2", lockTint)}>
        <Select
          value={String(week)}
          disabled={locked}
          onValueChange={(v) => {
            const w = parseInt(v, 10);
            const next = { ...draft, expected_collection_date: expectedFromWeek(w, forecastStartIso) };
            setDraft(next);
            void persist(next);
          }}
        >
          <SelectTrigger className="h-8 w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 13 }, (_, k) => k + 1).map((w) => (
              <SelectItem key={w} value={String(w)}>
                W{w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className={cn("p-2", lockTint)}>
        <Input
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          onBlur={blurSave}
          placeholder="—"
          className="h-8"
          disabled={locked}
        />
      </TableCell>
      <TableCell className={cn("p-2 text-right text-xs tabular-nums text-muted-foreground", lockTint)}>
        {formatCurrency(weighted)}
      </TableCell>
      <TableCell className="p-2">
        {isNew ? (
          <Button variant="ghost" size="sm" onClick={onCancelNew}>
            Cancel
          </Button>
        ) : locked ? (
          isApprover ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onOverrideLock}
              title={lockTip}
              className="h-8 gap-1"
            >
              <Unlock className="h-3.5 w-3.5" />
              Override
            </Button>
          ) : (
            <Lock className="h-4 w-4 text-muted-foreground" aria-label="Imported (read-only)" />
          )
        ) : (
          <Button variant="ghost" size="icon" onClick={onDelete} className="h-8 w-8">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
};
