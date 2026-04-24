import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  onCommit: (next: number) => void;
  className?: string;
  format?: (v: number) => string;
  locked?: boolean;
  lockReason?: string;
}

export const ActualsCell = ({ value, onCommit, className, format, locked, lockReason }: Props) => {
  const [text, setText] = useState(value ? String(value) : "");

  useEffect(() => {
    setText(value ? String(value) : "");
  }, [value]);

  const commit = () => {
    if (locked) return;
    const parsed = parseFloat(text.replace(/[, $]/g, "")) || 0;
    if (parsed !== value) onCommit(parsed);
  };

  if (locked) {
    return (
      <div
        title={lockReason ?? "Locked"}
        className={cn(
          "flex w-full items-center justify-end gap-1 rounded px-1 py-0.5 text-right tabular-nums text-muted-foreground",
          "bg-[hsl(var(--success))]/10",
          className
        )}
      >
        <Lock className="h-3 w-3 opacity-60" />
        <span>{format ? format(value) : value || "—"}</span>
      </div>
    );
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      placeholder={format ? format(0) : "—"}
      className={cn(
        "w-full bg-transparent text-right tabular-nums outline-none focus:ring-1 focus:ring-primary rounded px-1 py-0.5",
        className
      )}
    />
  );
};
