import * as React from "react";
import { Copy, Check } from "lucide-react";
import { SortResultRow } from "@/lib/sort-logic";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 80;

export function ResultsTable({ rows }: { rows: SortResultRow[] }) {
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);

  React.useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [rows]);

  // Duplicate plate numbers are highlighted, same as the reference app.
  const plateCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((r) => counts.set(r.plate, (counts.get(r.plate) ?? 0) + 1));
    return counts;
  }, [rows]);

  const visibleRows = rows.length > visibleCount ? rows.slice(0, visibleCount) : rows;

  function handleCopy(row: SortResultRow, index: number) {
    navigator.clipboard?.writeText(row.plate).catch(() => {});
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex((i) => (i === index ? null : i)), 1200);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-2 bg-muted text-sm font-bold">
        <div className="border-s border-border px-3 py-2 text-foreground">الشارع</div>
        <div className="px-3 py-2 text-foreground">رقم اللوحة</div>
      </div>
      <div className="divide-y divide-border/60">
        {visibleRows.map((row, i) => {
          const isDuplicate = (plateCounts.get(row.plate) ?? 0) > 1;
          // تلوين شكلي كالمرجع: وردي / أزرق بالتناوب
          const stripe = i % 2 === 0
            ? "bg-rose-50 dark:bg-rose-950/35"
            : "bg-sky-50 dark:bg-sky-950/35";
          return (
            <div
              key={`${row.plate}-${i}`}
              className={cn(
                "grid grid-cols-2 items-center text-sm",
                stripe,
                isDuplicate && "ring-1 ring-inset ring-sky-300/70 dark:ring-sky-700/60"
              )}
            >
              <div className="truncate border-s border-border/50 px-3 py-3 font-medium text-foreground">
                {row.street}
              </div>
              <div className="flex items-center justify-between gap-2 px-3 py-3">
                <span
                  className={cn(
                    "font-black tabular-nums tracking-wide",
                    isDuplicate
                      ? "text-sky-800 dark:text-sky-200"
                      : "text-foreground"
                  )}
                >
                  {row.plate}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(row, i)}
                  className="shrink-0 text-muted-foreground hover:text-primary"
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
      {rows.length > visibleCount && (
        <div className="border-t border-border p-2">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          >
            عرض المزيد ({visibleCount} / {rows.length})
          </Button>
        </div>
      )}
    </div>
  );
}
