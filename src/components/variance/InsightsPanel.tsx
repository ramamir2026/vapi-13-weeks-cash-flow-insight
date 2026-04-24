import { Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Props {
  insights: string[];
}

export const InsightsPanel = ({ insights }: Props) => {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Auto-generated insights</h2>
      </div>
      {insights.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No insights yet — need at least 2 completed weeks of actuals with line-item detail.
        </p>
      ) : (
        <ul className="space-y-2">
          {insights.map((text, i) => (
            <li key={i} className="flex gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
              <span className="text-foreground">{text}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};
