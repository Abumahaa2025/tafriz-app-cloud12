import { cn } from "@/lib/utils";

interface StatPillProps {
  label: string;
  value: number;
  tone: "muted" | "rose" | "red" | "green";
}

/** ألوان شكلية فقط — كما في مرجع نتائج الفرز */
const TONE_CLASSES: Record<
  StatPillProps["tone"],
  { card: string; label: string; value: string }
> = {
  green: {
    card: "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40",
    label: "text-emerald-800/75 dark:text-emerald-200/80",
    value: "text-emerald-800 dark:text-emerald-200",
  },
  red: {
    card: "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40",
    label: "text-rose-800/75 dark:text-rose-200/80",
    value: "text-rose-700 dark:text-rose-300",
  },
  rose: {
    card: "border-stone-200 bg-stone-100 dark:border-stone-700 dark:bg-stone-900/50",
    label: "text-stone-600 dark:text-stone-300/80",
    value: "text-stone-800 dark:text-stone-100",
  },
  muted: {
    card: "border-stone-200 bg-stone-100 dark:border-stone-700 dark:bg-stone-900/50",
    label: "text-stone-600 dark:text-stone-300/80",
    value: "text-stone-800 dark:text-stone-100",
  },
};

export function StatPill({ label, value, tone }: StatPillProps) {
  const t = TONE_CLASSES[tone];
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl border px-1.5 py-3 shadow-sm",
        t.card
      )}
    >
      <span className={cn("text-center text-[10px] font-bold leading-tight sm:text-xs", t.label)}>
        {label}
      </span>
      <span
        className={cn(
          "text-2xl font-black tabular-nums leading-none tracking-tight sm:text-3xl",
          t.value
        )}
      >
        {value}
      </span>
    </div>
  );
}
