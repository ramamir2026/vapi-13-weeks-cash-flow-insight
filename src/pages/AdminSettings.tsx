import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentRole, type AppRole } from "@/hooks/useControls";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2 } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type RoleOption = "viewer" | "editor" | "approver";
const ROLE_OPTIONS: RoleOption[] = ["viewer", "editor", "approver"];

type Row = {
  user_id: string;
  email: string;
  role: AppRole;
  created_at: string;
};

const useUserRoleList = () =>
  useQuery({
    queryKey: ["admin_user_roles"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.rpc("admin_list_user_roles");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

const AdminSettings = () => {
  const { data: role, isLoading: roleLoading } = useCurrentRole();
  const qc = useQueryClient();
  const { data: rows, isLoading } = useUserRoleList();
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<RoleOption>("editor");

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: RoleOption }) => {
      const { error } = await supabase.rpc("admin_set_user_role", {
        p_user_id: userId,
        p_role: role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_user_roles"] });
      qc.invalidateQueries({ queryKey: ["current_user_role"] });
      toast.success("Role updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addUser = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: RoleOption }) => {
      const { error } = await supabase.rpc("admin_add_user_role", {
        p_email: email.trim(),
        p_role: role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_user_roles"] });
      setNewEmail("");
      setNewRole("editor");
      toast.success("User role assigned");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRole = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_user_roles"] });
      toast.success("Access removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (roleLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  if (role !== "approver") {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-10">
          <ShieldAlert className="h-5 w-5 text-muted-foreground" />
          <div>
            <div className="font-medium">Approvers only</div>
            <div className="text-sm text-muted-foreground">
              You don't have permission to manage user access.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly report</CardTitle>
          <CardDescription>
            Posts the cash flow summary to the Slack #cash-flow channel every Monday at
            7am ET via incoming webhook. Webhook URL is stored as the{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">SLACK_WEBHOOK_URL</code>{" "}
            secret. To rotate it, go to api.slack.com/apps → your app → Incoming
            Webhooks → copy a new URL and update the secret.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={async () => {
              const t = toast.loading("Posting test report to Slack…");
              const { data, error } = await supabase.functions.invoke(
                "weekly-report",
                { body: {} },
              );
              toast.dismiss(t);
              if (error) {
                toast.error(error.message);
                return;
              }
              if ((data as { error?: string })?.error) {
                toast.error((data as { error: string }).error);
                return;
              }
              toast.success("Test report posted to Slack");
            }}
          >
            <Send className="mr-2 h-4 w-4" />
            Send test report
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add user access</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newEmail.trim()) return;
              addUser.mutate({ email: newEmail, role: newRole });
            }}
          >
            <Input
              type="email"
              placeholder="user@vapi.ai"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="sm:max-w-xs"
              required
            />
            <Select value={newRole} onValueChange={(v) => setNewRole(v as RoleOption)}>
              <SelectTrigger className="sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={addUser.isPending || !newEmail.trim()}>
              Add
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            The user must sign in once before a role can be assigned.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">User access ({rows?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-48">Role</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows ?? []).map((row) => {
                  const current: RoleOption =
                    row.role === "approver"
                      ? "approver"
                      : row.role === "viewer"
                      ? "viewer"
                      : "editor";
                  return (
                    <TableRow key={row.user_id}>
                      <TableCell className="font-medium">{row.email}</TableCell>
                      <TableCell>
                        <Select
                          value={current}
                          onValueChange={(v) =>
                            setRole.mutate({ userId: row.user_id, role: v as RoleOption })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((r) => (
                              <SelectItem key={r} value={r} className="capitalize">
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive"
                              aria-label={`Remove ${row.email}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove access?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {row.email} will lose all access to the app until a role is reassigned.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteRole.mutate(row.user_id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(rows ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                      No users yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSettings;
