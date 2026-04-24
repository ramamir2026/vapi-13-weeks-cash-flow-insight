import { ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const ALLOWED_DOMAIN = "vapi.ai";

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const email = user?.email?.toLowerCase() ?? null;
  const isAllowed = email?.endsWith(`@${ALLOWED_DOMAIN}`) ?? false;

  // If signed in with a non-vapi.ai email, sign out immediately
  useEffect(() => {
    if (!loading && user && !isAllowed) {
      supabase.auth.signOut();
    }
  }, [loading, user, isAllowed]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  if (!isAllowed) {
    return <Navigate to="/auth?error=domain" replace />;
  }

  return <>{children}</>;
};
