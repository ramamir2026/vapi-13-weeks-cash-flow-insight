import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Wallet, AlertCircle } from "lucide-react";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

const ALLOWED_DOMAIN = "vapi.ai";

const Auth = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, loading } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "domain" ? "Access restricted to Vapi team members" : null
  );

  // If already signed in with a valid email, bounce to dashboard
  useEffect(() => {
    if (!loading && user?.email?.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) {
      navigate("/", { replace: true });
    }
  }, [user, loading, navigate]);

  const handleGoogleSignIn = async () => {
    setError(null);
    setSigningIn(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth/callback`,
        extraParams: {
          hd: ALLOWED_DOMAIN,
          prompt: "select_account",
        },
      });
      if (result.error) {
        setError("Sign in failed. Please try again.");
        setSigningIn(false);
        return;
      }
      // If redirected, browser will navigate away
    } catch (e) {
      setError("Sign in failed. Please try again.");
      setSigningIn(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Wallet className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Vapi Cash Flow</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with your @vapi.ai Google account
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={handleGoogleSignIn}
          disabled={signingIn || loading}
          className="w-full"
          size="lg"
        >
          {signingIn ? "Redirecting…" : "Continue with Google"}
        </Button>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Only @vapi.ai email addresses are permitted.
        </p>
      </Card>
    </div>
  );
};

export default Auth;
