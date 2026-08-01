import { cn } from "@/lib/utils";

interface StatPillProps {
  label: string;
  value: number;
  tone: "rose" | "red" | "green";
}

const TONE_CLASSES: Record<StatPillProps["tone"], string> = {
  rose: "bg-rose-50 text-rose-600",
  red: "bg-red-50 text-red-600",
  green: "bg-emerald-50 text-emerald-700",
};

export function StatPill({ label, value, tone }: StatPillProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-3",
        TONE_CLASSES[tone]
      )}
    >
      <span className="text-xs font-bold">{label}</span>
      <span className="text-xl font-black">{value}</span>
    </div>
  );
}
