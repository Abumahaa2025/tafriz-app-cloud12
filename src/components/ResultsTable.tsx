import * as React from "react";
import { Copy, Check } from "lucide-react";
import { SortResultRow } from "@/lib/sort-logic";
import { cn } from "@/lib/utils";

export function ResultsTable({ rows }: { rows: SortResultRow[] }) {
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);

  // Duplicate plate numbers are highlighted, same as the reference app.
  const plateCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((r) => counts.set(r.plate, (counts.get(r.plate) ?? 0) + 1));
    return counts;
  }, [rows]);

  function handleCopy(row: SortResultRow, index: number) {
    navigator.clipboard?.writeText(row.plate).catch(() => {});
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex((i) => (i === index ? null : i)), 1200);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-2 bg-muted text-sm font-bold">
        <div className="border-s border-border px-3 py-2">الشارع</div>
        <div className="px-3 py-2">رقم اللوحة</div>
      </div>
      <div className="divide-y divide-border">
        {rows.map((row, i) => {
          const isDuplicate = (plateCounts.get(row.plate) ?? 0) > 1;
          return (
            <div
              key={`${row.plate}-${i}`}
              className={cn(
                "grid grid-cols-2 items-center text-sm",
                isDuplicate && "bg-sky-50"
              )}
            >
              <div className="truncate border-s border-border px-3 py-3 text-muted-foreground">
                {row.street}
              </div>
              <div className="flex items-center justify-between gap-2 px-3 py-3">
                <span className="font-bold">{row.plate}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(row, i)}
                  className="text-muted-foreground hover:text-primary"
                  aria-label="نسخ رقم اللوحة"
                >
                  {copiedIndex === i ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            لا توجد نتائج بعد — ارفع الملفين واضغط فرز كلي
          </div>
        )}
      </div>
    </div>
  );
}
