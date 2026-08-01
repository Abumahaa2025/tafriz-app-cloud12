import * as React from "react";
import { X, Home, UserCircle2, Lock, Database, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type MenuTarget = "home" | "account" | "privacy" | "database" | "admin";

export function AppMenu({
  open,
  onClose,
  onNavigate,
  isOwner,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (target: MenuTarget) => void;
  isOwner?: boolean;
}) {
  if (!open) return null;

  const items: { key: MenuTarget; label: string; icon: React.ElementType }[] = [
    { key: "home", label: "الصفحة الرئيسية", icon: Home },
    { key: "account", label: "الحساب", icon: UserCircle2 },
    { key: "database", label: "قاعدة البيانات", icon: Database },
    { key: "privacy", label: "الخصوصية", icon: Lock },
  ];

  if (isOwner) {
    items.splice(2, 0, { key: "admin", label: "إدارة التحكم", icon: ShieldCheck });
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-72 flex-col gap-1 bg-background p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <button onClick={onClose} className="text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
          <span className="font-black text-primary">الفرز</span>
        </div>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => {
                onNavigate(item.key);
                onClose();
              }}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-3 text-right text-sm font-bold text-foreground hover:bg-secondary"
              )}
            >
              <Icon className="h-5 w-5 text-primary" />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
