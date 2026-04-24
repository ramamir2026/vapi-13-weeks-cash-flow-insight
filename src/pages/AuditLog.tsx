import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Download, Filter } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuditLog, useAuditUsers, type AuditEntry } from "@/hooks/useControls";

const TABLES = ["assumptions", "ar_entries", "future_hires", "weekly_actuals", "model_weeks"];
const ACTIONS = ["insert", "update", "delete", "import", "override"];

const actionTone = (a: string) => {
  switch (a) {
    case "insert":
      return "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30";
    case "update":
      return "bg-primary/10 text-primary border-primary/30";
    case "delete":
      return "bg-destructive/10 text-destructive border-destructive/30";
    case "import":
      return "bg-muted text-muted-foreground border-border";
    case "override":
      return "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const truncate = (s: string | null, n = 60) =>
  !s ? "—" : s.length > n ? s.slice(0, n) + "…" : s;

export default function AuditLog() {
  const [user, setUser] = useState<string>("all");
  const [table, setTable] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(0);

  const { data: users } = useAuditUsers();

  const filters = useMemo(
    () => ({
      user: user !== "all" ? user : undefined,
      table: table !== "all" ? [table] : undefined,
      action: action !== "all" ? [action] : undefined,
      startDate: startDate || undefined,
      endDate: endDate ? `${endDate}T23:59:59` : undefined,
      page,
      pageSize: 50,
    }),
    [user, table, action, startDate, endDate, page]
  );

  const { data, isLoading } = useAuditLog(filters);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 50));

  const handleExport = async () => {
    let q = supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (filters.user) q = q.eq("user_email", filters.user);
    if (filters.table?.length) q = q.in("table_name", filters.table);
    if (filters.action?.length) q = q.in("action", filters.action);
    if (filters.startDate) q = q.gte("created_at", filters.startDate);
    if (filters.endDate) q = q.lte("created_at", filters.endDate);
    const { data: all, error } = await q;
    if (error) {
      return;
    }
    const data = (all ?? []) as AuditEntry[];
    const aoa = [
      ["Timestamp", "User", "Action", "Table", "Row ID", "Field", "Old", "New", "Source", "Import filename"],
      ...data.map((r) => [
        r.created_at,
        r.user_email ?? "",
        r.action,
        r.table_name,
        r.row_id ?? "",
        r.field_name ?? "",
        truncate(r.old_value, 200),
        truncate(r.new_value, 200),
        r.source,
        r.import_filename ?? "",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Audit Log");
    XLSX.writeFile(wb, `audit-log-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Audit Log</h2>
          <p className="text-sm text-muted-foreground">
            Append-only history of every change. Cannot be edited or deleted.
          </p>
        </div>
        <Button variant="outline" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Filter className="h-4 w-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">User</label>
            <Select value={user} onValueChange={(v) => { setUser(v); setPage(0); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {(users ?? []).map((u) => (
                  <SelectItem key={u} value={u}>{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Table</label>
            <Select value={table} onValueChange={(v) => { setTable(v); setPage(0); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tables</SelectItem>
                {TABLES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Action</label>
            <Select value={action} onValueChange={(v) => { setAction(v); setPage(0); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {ACTIONS.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">From</label>
            <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(0); }} className="h-9" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">To</label>
            <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(0); }} className="h-9" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">Timestamp</TableHead>
                  <TableHead className="w-48">User</TableHead>
                  <TableHead className="w-24">Action</TableHead>
                  <TableHead className="w-32">Table</TableHead>
                  <TableHead className="w-32">Field</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead className="w-32">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={7} className="p-8 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
                )}
                {!isLoading && rows.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="p-8 text-center text-sm text-muted-foreground">No audit entries match the current filters.</TableCell></TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums">
                      {format(new Date(r.created_at), "MMM d, yyyy h:mm:ss a")}
                    </TableCell>
                    <TableCell className="text-xs">{r.user_email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={actionTone(r.action)}>{r.action}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{r.table_name}</TableCell>
                    <TableCell className="text-xs">{r.field_name ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.field_name ? (
                        <span>
                          <span className="text-muted-foreground line-through">{truncate(r.old_value)}</span>
                          {" → "}
                          <span className="text-foreground">{truncate(r.new_value)}</span>
                        </span>
                      ) : r.action === "insert" || r.action === "import" ? (
                        <span className="text-muted-foreground">{truncate(r.new_value, 80)}</span>
                      ) : r.action === "delete" ? (
                        <span className="text-muted-foreground">{truncate(r.old_value, 80)}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="font-normal">
                        {r.source}
                        {r.import_filename ? ` · ${r.import_filename}` : ""}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t border-border p-3 text-xs text-muted-foreground">
            <div>
              Showing {rows.length === 0 ? 0 : page * 50 + 1}–{page * 50 + rows.length} of {total}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
