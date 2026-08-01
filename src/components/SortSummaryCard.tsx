import * as React from "react";
import { ChevronDown, ClipboardCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SortSummaryCard({
  fileCount,
  plateCount,
  ready,
  children,
}: {
  fileCount: number;
  plateCount: number;
  ready: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-4"
      >
        <ClipboardCheck className={cn("h-6 w-6", ready ? "text-primary" : "text-muted-foreground")} />
        <div className="flex flex-1 flex-col items-end px-3 text-right">
          <span className="text-base font-bold">بيانات الفرز</span>
          <span className="text-xs text-muted-foreground">
            {fileCount} ملف &middot; {plateCount} لوحات
          </span>
        </div>
        <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && children && <div className="border-t border-border px-4 py-3">{children}</div>}
    </Card>
  );
}
