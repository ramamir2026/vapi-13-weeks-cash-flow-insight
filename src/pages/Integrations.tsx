import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";

const INTEGRATION_LABEL: Record<string, string> = {
  brex: "Brex",
  svb_plaid: "SVB (Plaid)",
  quickbooks: "QuickBooks",
  ramp: "Ramp",
};

const fmtDateTime = (d: string | null) =>
  d
    ? new Date(d).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

const Integrations = () => {
  const { data: integrations } = useQuery({
    queryKey: ["integration_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_settings")
        .select("*")
        .order("integration_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: syncs } = useQuery({
    queryKey: ["sync_log_recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_log")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connected integrations</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Integration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>API key</TableHead>
                <TableHead>Last synced</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(integrations ?? []).map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">
                    {INTEGRATION_LABEL[i.integration_name] ?? i.integration_name}
                  </TableCell>
                  <TableCell>
                    {i.is_connected ? (
                      <Badge
                        variant="outline"
                        className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30"
                      >
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Connected
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        <XCircle className="mr-1 h-3 w-3" /> Not connected
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {i.api_key_set ? (
                      <span className="text-sm text-foreground">Set</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Missing</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDateTime(i.last_synced_at)}
                  </TableCell>
                </TableRow>
              ))}
              {(integrations ?? []).length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No integrations configured.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sync history (last 10)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Integration</TableHead>
                <TableHead>Rows</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(syncs ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-sm">
                    {fmtDateTime(s.started_at)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {INTEGRATION_LABEL[s.integration_name ?? ""] ??
                      s.integration_name ??
                      "—"}
                  </TableCell>
                  <TableCell>{s.rows_synced}</TableCell>
                  <TableCell>
                    {s.status === "success" ? (
                      <Badge
                        variant="outline"
                        className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30"
                      >
                        Success
                      </Badge>
                    ) : s.status === "error" ? (
                      <Badge variant="destructive">
                        <AlertCircle className="mr-1 h-3 w-3" /> Error
                      </Badge>
                    ) : (
                      <Badge variant="outline">{s.status}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                    {s.error_message ?? ""}
                  </TableCell>
                </TableRow>
              ))}
              {(syncs ?? []).length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No sync runs yet. The first sync will run Monday at 7am ET.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Integrations;
