import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { getStoredTheme, toggleTheme, AppTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** زر هلال أعلى يمين الشاشة — يبدّل بين نهاري وليلي */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = React.useState<AppTheme>("light");

  React.useEffect(() => {
    setTheme(getStoredTheme());
  }, []);

  return (
    <button
      type="button"
      onClick={() => setTheme(toggleTheme())}
      className={cn(
        "fixed top-3 right-3 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur transition hover:bg-secondary",
        className
      )}
      aria-label={theme === "dark" ? "التبديل إلى النهاري" : "التبديل إلى الليلي"}
      title={theme === "dark" ? "نهاري" : "ليلي"}
    >
      {theme === "dark" ? <Sun className="h-5 w-5 text-primary" /> : <Moon className="h-5 w-5 text-primary" />}
    </button>
  );
}
