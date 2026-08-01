import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SegmentedToggleProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}

export function SegmentedToggle({ options, value, onChange }: SegmentedToggleProps) {
  return (
    <div className="flex overflow-hidden rounded-full border border-border bg-muted p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-bold transition-colors",
              active
                ? "bg-secondary text-primary shadow-sm"
                : "bg-transparent text-muted-foreground"
            )}
          >
            {active && <Check className="h-4 w-4" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
