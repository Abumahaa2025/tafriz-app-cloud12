import * as React from "react";
import { FileSpreadsheet, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  isSpreadsheetFile,
  SPREADSHEET_ACCEPT_MOBILE,
  spreadsheetAcceptForDevice,
} from "@/lib/pick-spreadsheet";

interface FileDropCardProps {
  label: string;
  /** نص توضيحي تحت العنوان */
  hint?: string;
  file: File | { name: string } | null;
  progress: number | null;
  accept?: string;
  onSelect: (file: File) => void;
  onClear: () => void;
}

/**
 * استيراد Excel عبر <label> مرتبط بـ input —
 * أوثق على سامسونج/أندرويد من input.click() البرمجي الذي يفتح الكاميرا أحيانًا.
 */
export function FileDropCard({
  label,
  hint = "اضغط لاختيار Excel من الملفات أو التنزيلات أو Drive",
  file,
  progress,
  onSelect,
  onClear,
}: FileDropCardProps) {
  const inputId = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pickError, setPickError] = React.useState<string | null>(null);
  const accept = spreadsheetAcceptForDevice() || SPREADSHEET_ACCEPT_MOBILE;

  function applyFile(chosen: File | null) {
    if (!chosen) return;
    if (!isSpreadsheetFile(chosen)) {
      setPickError("اختر ملف Excel (.xlsx / .xls) أو CSV فقط — وليس صورة أو فيديو");
      return;
    }
    setPickError(null);
    onSelect(chosen);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    e.target.value = "";
    applyFile(f);
  }

  const fileInput = (
    <input
      id={inputId}
      ref={inputRef}
      type="file"
      accept={accept}
      className="sr-only"
      // لا تستخدم capture أبدًا
      onChange={onInputChange}
    />
  );

  return (
    <div>
      {!file ? (
        <label
          htmlFor={inputId}
          className={cn(
            "flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 py-8 text-muted-foreground transition-colors hover:border-primary hover:bg-secondary/40"
          )}
        >
          {fileInput}
          <FileSpreadsheet className="h-7 w-7 text-primary" />
          <span className="text-sm font-bold">{label}</span>
          <span className="px-4 text-center text-[11px] leading-4">{hint}</span>
        </label>
      ) : (
        <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-secondary/40 px-4 py-3">
          {fileInput}
          <button
            type="button"
            onClick={onClear}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
            aria-label="إزالة الملف"
          >
            <X className="h-4 w-4" />
          </button>
          <label
            htmlFor={inputId}
            className="flex min-w-0 flex-1 cursor-pointer flex-col items-end gap-0.5 text-right"
          >
            <span className="w-full truncate text-sm font-bold">{file.name}</span>
            <span className="text-xs text-muted-foreground">اضغط لاختيار ملف Excel آخر</span>
          </label>
          <label
            htmlFor={inputId}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-background"
            aria-label="اختيار ملف"
          >
            <FileSpreadsheet className="h-5 w-5 text-primary" />
          </label>
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
