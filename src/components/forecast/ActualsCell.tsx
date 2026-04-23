import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  onCommit: (next: number) => void;
  className?: string;
  format?: (v: number) => string;
}

export const ActualsCell = ({ value, onCommit, className, format }: Props) => {
  const [text, setText] = useState(value ? String(value) : "");

  useEffect(() => {
    setText(value ? String(value) : "");
  }, [value]);

  const commit = () => {
    const parsed = parseFloat(text.replace(/[, $]/g, "")) || 0;
    if (parsed !== value) onCommit(parsed);
  };

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
