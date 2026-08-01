import * as React from "react";
import { FileSpreadsheet, Search, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface FileDropCardProps {
  label: string;
  file: File | { name: string } | null;
  progress: number | null; // null = not uploading, 0-100 = uploading
  accept?: string;
  onSelect: (file: File) => void;
  onClear: () => void;
}

export function FileDropCard({
  label,
  file,
  progress,
  accept = ".xlsx,.xls,.csv",
  onSelect,
  onClear,
}: FileDropCardProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f);
          e.target.value = "";
        }}
      />

      {!file ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 py-8 text-muted-foreground transition-colors hover:border-primary hover:bg-secondary/40"
          )}
        >
          <Search className="h-6 w-6" />
          <span className="text-sm font-bold">{label}</span>
        </button>
      ) : (
        <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-secondary/40 px-4 py-3">
          <button
            type="button"
            onClick={onClear}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
            aria-label="إزالة الملف"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex flex-1 flex-col items-end gap-0.5 text-right">
            <span className="truncate text-sm font-bold">{file.name}</span>
            <span className="text-xs text-muted-foreground">اضغط هنا لاختيار ملف آخر</span>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background"
          >
            <FileSpreadsheet className="h-5 w-5 text-primary" />
          </button>
        </div>
      )}

      {progress !== null && (
        <div className="mt-2 flex items-center gap-3">
          <span className="w-12 shrink-0 text-xs text-muted-foreground">
            {progress < 100 ? "يرفع..." : "تم"}
          </span>
          <Progress value={progress} className="flex-1" />
        </div>
      )}
    </div>
  );
}
