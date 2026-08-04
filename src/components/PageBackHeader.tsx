import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ترويسة صفحات القائمة (حساب / إدارة / قاعدة بيانات / خصوصية):
 * سهم رجوع واضح للصفحة الرئيسية — بعيدًا عن زر الثيم أعلى اليمين.
 */
export function PageBackHeader({
  title,
  onBack,
  icon,
  className,
}: {
  title: string;
  onBack: () => void;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        // pr-14 يُبقي السهم بعيدًا عن ThemeToggle (fixed top-3 right-3)
        "flex items-center gap-2 py-2 pr-14",
        className
      )}
    >
      <button
        type="button"
        onClick={onBack}
        className="flex shrink-0 items-center gap-1 rounded-xl border border-border bg-background px-2.5 py-1.5 text-primary shadow-sm transition-colors hover:bg-secondary"
        aria-label="رجوع للصفحة الرئيسية"
        title="رجوع للصفحة الرئيسية"
      >
        <ArrowRight className="h-5 w-5" />
        <span className="text-xs font-bold">رجوع</span>
      </button>
      {icon}
      <h1 className="min-w-0 flex-1 truncate text-lg font-black">{title}</h1>
    </header>
  );
}
