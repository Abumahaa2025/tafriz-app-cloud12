import * as React from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * زر صغير أعلى الصفحة لتحديث التطبيق وجلب آخر التعديلات
 * (بديل عملي لسحب الشاشة على الجوال / كاش الـ PWA).
 */
export function RefreshAppButton({ className }: { className?: string }) {
  const [busy, setBusy] = React.useState(false);

  async function handleRefresh() {
    if (busy) return;
    setBusy(true);
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {
      // تجاهل أخطاء الكاش — أعد التحميل على أي حال
    }
    // تحميل قسري بمسار جديد لكسر كاش الجوال/PWA
    const url = new URL(window.location.href);
    url.searchParams.set("_r", String(Date.now()));
    window.location.replace(url.toString());
  }

  return (
    <button
      type="button"
      onClick={() => void handleRefresh()}
      disabled={busy}
      className={cn(
        // مباشرة تحت زر الثيم (top-3 right-3، ارتفاع 10 = 2.5rem)
        "fixed top-[3.35rem] right-3 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur transition hover:bg-secondary disabled:opacity-70",
        className
      )}
      aria-label="تحديث الصفحة"
      title="تحديث الصفحة"
    >
      <RefreshCw className={cn("h-4 w-4 text-primary", busy && "animate-spin")} />
    </button>
  );
}
