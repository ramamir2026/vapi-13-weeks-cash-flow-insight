import { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Settings2,
  Receipt,
  UserPlus,
  LogOut,
  ScrollText,
  ShieldCheck,
  Banknote,
  ListOrdered,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentRole } from "@/hooks/useControls";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import vapiLogo from "@/assets/vapi-logo.svg";

const baseNavItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/assumptions", label: "Assumptions", icon: Settings2 },
  { to: "/ar-schedule", label: "A/R Schedule", icon: Receipt },
  { to: "/future-hires", label: "Future Hires", icon: UserPlus },
  { to: "/bank-imports", label: "Bank Imports", icon: Banknote },
  { to: "/transactions", label: "Transactions", icon: ListOrdered },
  { to: "/audit-log", label: "Audit Log", icon: ScrollText },
];
const adminNavItem = { to: "/admin-settings", label: "Admin Settings", icon: ShieldCheck };

const ROLE_LABEL: Record<string, string> = {
  approver: "Approver",
  editor: "Editor",
  viewer: "Viewer",
};

const ROLE_TONE: Record<string, string> = {
  approver: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30",
  editor: "bg-primary/15 text-primary border-primary/30",
  viewer: "bg-muted text-muted-foreground border-border",
};

export const AppLayout = ({ children }: { children: ReactNode }) => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const { data: role } = useCurrentRole();
  const navItems = role === "approver" ? [...baseNavItems, adminNavItem] : baseNavItems;
  const currentPage = navItems.find((n) => n.to === location.pathname)?.label ?? "Dashboard";

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex flex-col border-b border-sidebar-border p-4">
          <img
            src={vapiLogo}
            alt="Vapi"
            className="h-auto w-20"
          />
          <div className="mt-2 text-xs text-sidebar-foreground/60">Cash Flow · Internal finance</div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 flex items-center justify-between gap-2 px-3">
            <div className="truncate text-xs text-sidebar-foreground/60">{user?.email}</div>
            {role && (
              <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wide", ROLE_TONE[role])}>
                {ROLE_LABEL[role]}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={signOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
          <h1 className="text-lg font-semibold text-foreground">{currentPage}</h1>
          <div className="md:hidden">
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Mobile nav */}
        <nav className="flex border-b border-border bg-card md:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex flex-1 flex-col items-center gap-1 py-2 text-xs",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <main className="flex-1 overflow-auto bg-background p-6">{children}</main>
      </div>
    </div>
  );
};
