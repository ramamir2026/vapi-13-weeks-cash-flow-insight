import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { ingestFile, pickSheetByName } from "@/lib/ingest";

type Props = {
  onFile: (text: string, fileName: string) => void;
  /** Regex matched against worksheet names when ingesting Excel. Defaults to the A/R aging sheets. */
  sheetPattern?: RegExp;
  /** Override the dropzone copy (defaults to A/R messaging). */
  title?: string;
  subtitle?: string;
};

const DEFAULT_SHEET_PATTERN = /aging summary|ar aging/i;

export const CsvDropzone = ({ onFile, sheetPattern, title, subtitle }: Props) => {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pattern = sheetPattern ?? DEFAULT_SHEET_PATTERN;

  const readFile = useCallback(
    async (file: File) => {
      try {
        const ing = await ingestFile(file);
        const sheet = pickSheetByName(ing, pattern) ?? ing.sheets[0];
        onFile(sheet?.csv ?? ing.text, file.name);
      } catch {
        // Fallback to plain text
        const reader = new FileReader();
        reader.onload = (e) => onFile((e.target?.result as string) ?? "", file.name);
        reader.readAsText(file);
      }
    },
    [onFile, pattern]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void readFile(file);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 px-6 py-8 text-center transition-colors hover:bg-muted/50",
        dragOver && "border-primary bg-primary/5"
      )}
    >
      <Upload className="h-6 w-6 text-muted-foreground" />
      <div className="text-sm font-medium text-foreground">
        {title ?? "Drop QuickBooks A/R Aging CSV or Excel here"}
      </div>
      <div className="text-xs text-muted-foreground">
        {subtitle ?? "or click to browse · auto-fills probability & expected week"}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt,.xlsx,.xls,.pdf,text/csv,text/tab-separated-values,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void readFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
};
