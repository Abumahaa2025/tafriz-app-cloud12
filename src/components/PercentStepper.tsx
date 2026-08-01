import * as React from "react";
import { Plus, Minus } from "lucide-react";

interface PercentStepperProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
}

export function PercentStepper({ value, onChange, step = 10 }: PercentStepperProps) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-background p-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - step))}
        className="flex h-8 w-8 items-center justify-center rounded-full text-primary hover:bg-secondary"
        aria-label="تقليل"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-14 text-center text-sm font-bold text-primary">{value}%</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(100, value + step))}
        className="flex h-8 w-8 items-center justify-center rounded-full text-primary hover:bg-secondary"
        aria-label="زيادة"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
