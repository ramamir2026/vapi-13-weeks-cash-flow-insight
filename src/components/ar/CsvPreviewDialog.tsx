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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import type { ParsedArRow } from "@/lib/parseArCsv";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: ParsedArRow[];
  fileName: string;
  onConfirm: (rows: ParsedArRow[]) => void;
  importing?: boolean;
};

export const CsvPreviewDialog = ({
  open,
  onOpenChange,
  rows,
  fileName,
  onConfirm,
  importing,
}: Props) => {
  const [selected, setSelected] = useState<boolean[]>([]);
  const [edited, setEdited] = useState<ParsedArRow[]>([]);

  useEffect(() => {
    setSelected(rows.map(() => true));
    setEdited(rows.map((r) => ({ ...r })));
  }, [rows]);

  const allChecked = selected.every(Boolean);
  const totalSelected = selected.filter(Boolean).length;
  const totalAmount = edited.reduce(
    (s, r, i) => (selected[i] ? s + r.amount : s),
    0
  );

  const setWeek = (idx: number, week: number) => {
    setEdited((prev) => prev.map((r, i) => (i === idx ? { ...r, expectedWeek: week } : r)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Preview CSV import</DialogTitle>
          <DialogDescription>
            {fileName} · {rows.length} rows parsed · adjust expected week if needed
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
                <TableHead>Customer</TableHead>
                <TableHead>Bucket</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead className="text-right">Aging</TableHead>
                <TableHead className="text-right">Prob %</TableHead>
                <TableHead>Expected Week</TableHead>
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
                  <TableCell className="font-medium">{r.customer}</TableCell>
                  <TableCell className="text-muted-foreground">{r.bucketLabel || (r.invoiceNumber || "—")}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(r.amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.agingDays}d</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Math.round(r.probability * 100)}%
                  </TableCell>
                  <TableCell>
                    <Select
                      value={String(r.expectedWeek)}
                      onValueChange={(v) => setWeek(i, parseInt(v, 10))}
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="text-sm text-muted-foreground">
          {totalSelected} of {rows.length} selected · {formatCurrency(totalAmount)}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(edited.filter((_, i) => selected[i]))}
            disabled={importing || totalSelected === 0}
          >
            {importing ? "Importing…" : `Import ${totalSelected} invoices`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
