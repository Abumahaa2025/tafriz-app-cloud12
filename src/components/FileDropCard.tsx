import * as React from "react";
import { FileSpreadsheet, Search, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { pickSpreadsheetFile } from "@/lib/pick-spreadsheet";

interface FileDropCardProps {
  label: string;
  file: File | { name: string } | null;
  progress: number | null;
  accept?: string;
  onSelect: (file: File) => void;
  onClear: () => void;
}

export function FileDropCard({
  label,
  file,
  progress,
  onSelect,
  onClear,
}: FileDropCardProps) {
  const [picking, setPicking] = React.useState(false);
  const [pickError, setPickError] = React.useState<string | null>(null);

  async function openPicker() {
    if (picking) return;
    setPickError(null);
    setPicking(true);
    try {
      const chosen = await pickSpreadsheetFile();
      if (!chosen) return;
      onSelect(chosen);
    } finally {
      setPicking(false);
    }
  }

  return (
    <div>
      {!file ? (
        <button
          type="button"
          onClick={() => void openPicker()}
          disabled={picking}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 py-8 text-muted-foreground transition-colors hover:border-primary hover:bg-secondary/40 disabled:opacity-60"
          )}
        >
          <Search className="h-6 w-6" />
          <span className="text-sm font-bold">{picking ? "جارٍ فتح الملفات..." : label}</span>
          <span className="px-4 text-center text-[11px] leading-4">
            يفتح ملفات الجهاز والتطبيقات (التنزيلات، Drive، واتساب…) — وليس الكاميرا
          </span>
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
          <button
            type="button"
            onClick={() => void openPicker()}
            className="flex flex-1 flex-col items-end gap-0.5 text-right"
          >
            <span className="truncate text-sm font-bold">{file.name}</span>
            <span className="text-xs text-muted-foreground">اضغط لاختيار ملف آخر من الملفات/التطبيقات</span>
          </button>
          <button
            type="button"
            onClick={() => void openPicker()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background"
            aria-label="اختيار ملف"
          >
            <FileSpreadsheet className="h-5 w-5 text-primary" />
          </button>
        </div>
      )}

      {pickError && (
        <p className="mt-1 text-center text-[11px] text-amber-700 dark:text-amber-300">{pickError}</p>
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