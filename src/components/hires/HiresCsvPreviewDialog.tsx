import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import type { HireStatus, ParsedHireRow } from "@/lib/parseHiresCsv";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: ParsedHireRow[];
  fileName: string;
  onConfirm: (rows: ParsedHireRow[]) => void;
  importing?: boolean;
};

const STATUS_LABELS: Record<HireStatus, string> = {
  confirmed: "Confirmed",
  offer_sent: "Offer Sent",
  interviewing: "Interviewing",
};

export const HiresCsvPreviewDialog = ({
  open,
  onOpenChange,
  rows,
  fileName,
  onConfirm,
  importing,
}: Props) => {
  const [selected, setSelected] = useState<boolean[]>([]);
  const [edited, setEdited] = useState<ParsedHireRow[]>([]);

  useEffect(() => {
    setSelected(rows.map(() => true));
    setEdited(rows.map((r) => ({ ...r })));
  }, [rows]);

  const allChecked = selected.length > 0 && selected.every(Boolean);
  const totalSelected = selected.filter(Boolean).length;
  const totalSalary = edited.reduce(
    (s, r, i) => (selected[i] ? s + r.annualSalary : s),
    0
  );

  const setStatus = (idx: number, status: HireStatus) => {
    setEdited((prev) => prev.map((r, i) => (i === idx ? { ...r, status } : r)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Preview hires import</DialogTitle>
          <DialogDescription>
            {fileName} · {rows.length} rows parsed · adjust status if needed
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={(v) => setSelected(rows.map(() => !!v))}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Salary</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {edited.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Checkbox
                      checked={!!selected[i]}
                      onCheckedChange={(v) =>
                        setSelected((prev) => prev.map((s, j) => (j === i ? !!v : s)))
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.role}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(r.annualSalary)}
                  </TableCell>
                  <TableCell>{formatDate(r.startDate)}</TableCell>
                  <TableCell>
                    <Select
                      value={r.status}
                      onValueChange={(v) => setStatus(i, v as HireStatus)}
                    >
                      <SelectTrigger className="h-8 w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(STATUS_LABELS) as HireStatus[]).map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="text-sm text-muted-foreground">
          {totalSelected} of {rows.length} selected · {formatCurrency(totalSalary)} annual
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(edited.filter((_, i) => selected[i]))}
            disabled={importing || totalSelected === 0}
          >
            {importing ? "Importing…" : `Import ${totalSelected} hires`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
