import * as React from "react";
import { Map, CheckSquare, Mic, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "maps", label: "الخرائط", icon: Map },
  { key: "check", label: "التشيك", icon: CheckSquare },
  { key: "record", label: "التسجيل", icon: Mic },
  { key: "sort", label: "الفرز", icon: ListChecks },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

export function BottomNav({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (key: TabKey) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2 py-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-xs font-bold transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-14 items-center justify-center rounded-full",
                  isActive && "bg-secondary"
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
