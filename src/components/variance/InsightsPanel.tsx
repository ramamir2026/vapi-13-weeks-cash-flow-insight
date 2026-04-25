import { useEffect, useState } from "react";
import { Lightbulb, RefreshCw, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentRole } from "@/hooks/useControls";
import { toast } from "sonner";

interface AiAnalysis {
  id: string;
  generated_at: string;
  analysis_text: string;
  is_fallback: boolean;
  source: string;
}

interface Props {
  insights: string[];
}

export const InsightsPanel = ({ insights }: Props) => {
  const { data: role } = useCurrentRole();
  const isApprover = role === "approver";
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("ai_analyses")
      .select("id, generated_at, analysis_text, is_fallback, source")
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setAnalysis((data as AiAnalysis) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const regenerate = async () => {
    setRegenerating(true);
    const t = toast.loading("Regenerating analysis…");
    try {
      const { error } = await supabase.functions.invoke("weekly-report", { body: {} });
      if (error) throw error;
      await load();
      toast.success("Analysis regenerated", { id: t });
    } catch (e) {
      toast.error((e as Error).message, { id: t });
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Auto-generated insights</h2>
          {analysis?.is_fallback && (
            <Badge variant="outline" className="text-[10px] font-normal">
              AI analysis unavailable
            </Badge>
          )}
          {analysis && !analysis.is_fallback && (
            <Badge variant="secondary" className="gap-1 text-[10px] font-normal">
              <Sparkles className="h-3 w-3" /> AI
            </Badge>
          )}
        </div>
        {isApprover && (
          <Button
            size="sm"
            variant="outline"
            onClick={regenerate}
            disabled={regenerating}
          >
            <RefreshCw className={`mr-2 h-3 w-3 ${regenerating ? "animate-spin" : ""}`} />
            Regenerate Analysis
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading analysis…</p>
      ) : analysis ? (
        <div className="space-y-2">
          <div className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
            {analysis.analysis_text}
          </div>
          <div className="text-xs text-muted-foreground">
            Generated{" "}
            {new Date(analysis.generated_at).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </div>
          {analysis.is_fallback && insights.length > 0 && (
            <ul className="mt-3 space-y-2">
              {insights.map((text, i) => (
                <li
                  key={i}
                  className="flex gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                  <span className="text-foreground">{text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : insights.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No insights yet — need at least 2 completed weeks of actuals with line-item detail.
        </p>
      ) : (
        <ul className="space-y-2">
          {insights.map((text, i) => (
            <li
              key={i}
              className="flex gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
            >
              <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
              <span className="text-foreground">{text}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};
