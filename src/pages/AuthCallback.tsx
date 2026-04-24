import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ALLOWED_DOMAIN = "vapi.ai";

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const finalize = async () => {
      // Wait briefly for the session to be hydrated by the auth listener
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user.email?.toLowerCase() ?? null;

      if (cancelled) return;

      if (!email) {
        navigate("/auth", { replace: true });
        return;
      }

      if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
        await supabase.auth.signOut();
        navigate("/auth?error=domain", { replace: true });
        return;
      }

      navigate("/", { replace: true });
    };

    finalize();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Signing you in…</span>
      </div>
    </div>
  );
};

export default AuthCallback;
