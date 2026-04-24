import { useEffect, useState } from "react";
import { CalendarIcon, Lock, Trash2, Unlock } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { FutureHire } from "@/hooks/useFinanceData";
import type { HireStatus } from "@/lib/parseHiresCsv";

export type HireRowDraft = {
  id?: string;
  name: string;
  role: string;
  annual_salary: number;
  start_date: string; // YYYY-MM-DD
  status: HireStatus;
  notes: string;
};

const STATUS_LABEL: Record<HireStatus, string> = {
  confirmed: "Confirmed",
  offer_sent: "Offer Sent",
  interviewing: "Interviewing",
};

const STATUS_DOT: Record<HireStatus, string> = {
  confirmed: "bg-green-500",
  offer_sent: "bg-amber-500",
  interviewing: "bg-gray-400",
};

const StatusDot = ({ status }: { status: HireStatus }) => (
  <span className="inline-flex items-center gap-2">
    <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[status])} />
    <span className="text-sm">{STATUS_LABEL[status]}</span>
  </span>
);

type Props = {
  hire?: FutureHire & { status?: HireStatus };
  onSave: (draft: HireRowDraft) => Promise<void> | void;
  onDelete?: () => void;
  isNew?: boolean;
  onCancelNew?: () => void;
  isApprover?: boolean;
  onOverrideLock?: () => void;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const initialFromHire = (h?: Props["hire"]): HireRowDraft => ({
  id: h?.id,
  name: h?.name ?? "",
  role: h?.role ?? "",
  annual_salary: Number(h?.annual_salary ?? 0),
  start_date: h?.start_date ?? todayIso(),
  status: (h?.status as HireStatus) ?? "interviewing",
  notes: h?.notes ?? "",
});

export const HireInlineRow = ({ hire, onSave, onDelete, isNew, onCancelNew, isApprover, onOverrideLock }: Props) => {
  const [draft, setDraft] = useState<HireRowDraft>(initialFromHire(hire));

  useEffect(() => {
    if (hire) setDraft(initialFromHire(hire));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hire?.id]);

  const locked = !!hire?.import_locked;
  const lockTip = locked ? `Imported from ${hire?.import_filename ?? "CSV"} — approver override required` : undefined;
  const lockTint = locked ? "bg-muted/60" : "";

  const persist = async (next: HireRowDraft) => {
    if (locked) return;
    if (isNew) {
      if (!next.name.trim() || !next.role.trim() || !next.annual_salary || !next.start_date) return;
    }
    await onSave({
      id: next.id,
      name: next.name.trim(),
      role: next.role.trim(),
      annual_salary: next.annual_salary,
      start_date: next.start_date,
      status: next.status,
      notes: next.notes,
    });
  };

  const blurSave = () => {
    void persist(draft);
  };

  const startDateObj = draft.start_date
    ? (() => {
        const [y, m, d] = draft.start_date.split("-").map(Number);
        return new Date(y, m - 1, d);
      })()
    : undefined;

  return (
    <TableRow>
      <TableCell className={cn("p-2", lockTint)} title={lockTip}>
        <Input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onBlur={blurSave}
          placeholder="Name"
          className="h-8"
          disabled={locked}
        />
      </TableCell>
      <TableCell className={cn("p-2", lockTint)}>
        <Input
          value={draft.role}
          onChange={(e) => setDraft({ ...draft, role: e.target.value })}
          onBlur={blurSave}
          placeholder="Role"
          className="h-8"
          disabled={locked}
        />
      </TableCell>
      <TableCell className={cn("p-2", lockTint)}>
        <Input
          type="number"
          value={draft.annual_salary || ""}
          onChange={(e) =>
            setDraft({ ...draft, annual_salary: parseFloat(e.target.value) || 0 })
          }
          onBlur={blurSave}
          className="h-8 text-right tabular-nums"
          disabled={locked}
        />
      </TableCell>
      <TableCell className={cn("p-2", lockTint)}>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-8 w-full justify-start text-left font-normal"
              disabled={locked}
            >
              <CalendarIcon className="mr-2 h-3.5 w-3.5" />
              {startDateObj ? format(startDateObj, "MMM d, yyyy") : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={startDateObj}
              onSelect={(d) => {
                if (!d) return;
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                const next = { ...draft, start_date: iso };
                setDraft(next);
                void persist(next);
              }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </TableCell>
      <TableCell className={cn("p-2", lockTint)}>
        <Select
          value={draft.status}
          disabled={locked}
          onValueChange={(v) => {
            const next = { ...draft, status: v as HireStatus };
            setDraft(next);
            void persist(next);
          }}
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue>
              <StatusDot status={draft.status} />
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_LABEL) as HireStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                <StatusDot status={s} />
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
