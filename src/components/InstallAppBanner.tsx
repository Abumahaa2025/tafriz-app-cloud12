import * as React from "react";
import { Download, X, Share, Plus, MoreVertical, ExternalLink, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  chromeIntentUrl,
  detectInstallManualKind,
  InstallState,
  rememberPromptDismissed,
  wasPromptDismissedRecently,
  watchInstallAvailability,
} from "@/lib/install-app";

/**
 * تذكير بتثبيت PWA من المتصفح.
 * لا يُعلن «تم التثبيت» إلا بعد appinstalled / standalone فعلي.
 * على Huawei: تعليمات يدوية داخل Chrome — بلا redirect صامت وبلا APK.
 */
export function InstallAppBanner() {
  const [state, setState] = React.useState<InstallState>("unavailable");
  const [hidden, setHidden] = React.useState(() => wasPromptDismissedRecently());
  const [showSteps, setShowSteps] = React.useState(false);
  const [forceHelp, setForceHelp] = React.useState(false);
  const installRef = React.useRef<null | (() => Promise<string>)>(null);
  const manualKind = React.useMemo(() => detectInstallManualKind(), []);

  React.useEffect(() => {
    const watcher = watchInstallAvailability(setState);
    installRef.current = watcher.install;
    return () => {
      watcher.stop();
      installRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (state === "manual" && (manualKind === "huawei" || manualKind === "samsung")) {
      setShowSteps(true);
    }
  }, [state, manualKind]);

  // ?installHelp=1 يفتح الخطوات فورًا (من القائمة) حتى لو أُخفي التذكير سابقًا
  React.useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("installHelp") === "1") {
        setForceHelp(true);
        setHidden(false);
        setShowSteps(true);
      }
    } catch {
      // ignore
    }
  }, []);

  // unavailable = يعمل standalone فعلًا — لا بانر
  if (state === "unavailable") return null;
  // forceHelp من القائمة يتجاوز الإخفاء اليدوي السابق
  if (hidden && !forceHelp) return null;

  function dismiss() {
    rememberPromptDismissed();
    setHidden(true);
  }

  const subtitle =
    state === "use-chrome"
      ? "متصفحك الحالي غالبًا لا يثبّت كتطبيق مستقل. افتح نفس الرابط في Chrome ثم ثبّت من هناك (PWA — ليس ملف APK)."
      : state === "waiting"
        ? "تم قبول موجّه النظام — ننتظر تأكيد التثبيت الفعلي من المتصفح…"
        : state === "installed"
          ? "تم التثبيت بنجاح (تأكيد من المتصفح). افتح الأيقونة من الشاشة الرئيسية."
          : manualKind === "huawei"
            ? "على Huawei قد لا يظهر زر التثبيت المباشر. استخدم خطوات Chrome بالأسفل — هذا تثبيت موقع كتطبيق (PWA) وليس تنزيل APK."
            : "أنت تستعرضه من المتصفح. التثبيت يعطيك أيقونة على الشاشة الرئيسية (PWA) تفتح بلا شريط عنوان.";

  return (
    <div className="fixed inset-x-0 bottom-[4.75rem] z-20 px-4">
      <div className="mx-auto flex max-w-md flex-col gap-2 rounded-2xl border border-primary/25 bg-background/95 p-3 shadow-lg backdrop-blur">
        <div className="flex items-start gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            {state === "installed" ? (
              <Check className="h-4 w-4 text-primary" />
            ) : (
              <Download className="h-4 w-4 text-primary" />
            )}
          </span>
          <div className="flex flex-1 flex-col gap-0.5 text-right">
            <p className="text-sm font-black text-foreground">
              {state === "installed" ? "تم تثبيت «الفرز»" : "تثبيت التطبيق"}
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{subtitle}</p>
          </div>
          {state !== "waiting" && state !== "installed" && (
            <button
              type="button"
              onClick={dismiss}
              aria-label="إخفاء التذكير"
              className="shrink-0 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {state === "use-chrome" ? (
          <>
            <Button className="w-full" onClick={() => window.location.assign(chromeIntentUrl())}>
              <ExternalLink className="h-4 w-4" />
              افتح الرابط في Chrome
            </Button>
            <p className="text-center text-[10px] text-muted-foreground">
              لن يبدأ تنزيل ملف. بعد فتح Chrome استخدم القائمة ⋮ ← تثبيت التطبيق.
            </p>
          </>
        ) : state === "ready" ? (
          <Button
            className="w-full"
            onClick={() => {
              void installRef.current?.().then((result) => {
                if (result === "unavailable") setShowSteps(true);
              });
            }}
          >
            <Download className="h-4 w-4" />
            تثبيت الآن
          </Button>
        ) : state === "waiting" ? (
          <Button className="w-full" disabled>
            بانتظار تأكيد النظام…
          </Button>
        ) : state === "installed" ? (
          <Button className="w-full" onClick={() => window.location.assign("/?source=pwa")}>
            <Check className="h-4 w-4" />
            فتح التطبيق
          </Button>
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setShowSteps((v) => !v)}>
            {showSteps ? "إخفاء الخطوات" : "عرض خطوات التثبيت"}
          </Button>
        )}

        {(state === "manual" || (state === "ready" && showSteps)) && showSteps && (
          <ManualInstallSteps kind={manualKind} />
        )}
        {state === "manual" && showSteps && (
          <p className="text-center text-[10px] text-muted-foreground">
            لا يمكننا التحكم في شاشة Chrome أو مدير التنزيلات — إن لم يظهر «تثبيت التطبيق» فذلك قيد النظام.
          </p>
        )}
      </div>
    </div>
  );
}

function ManualInstallSteps({ kind }: { kind: ReturnType<typeof detectInstallManualKind> }) {
  if (kind === "ios") {
    return (
      <ol className="flex flex-col gap-1 rounded-xl bg-secondary/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
        <li className="flex items-center gap-1">
          <Share className="h-3 w-3 shrink-0 text-primary" />
          اضغط زر المشاركة (Share) في المتصفح.
        </li>
        <li className="flex items-center gap-1">
          <Plus className="h-3 w-3 shrink-0 text-primary" />
          اختر «إضافة إلى الشاشة الرئيسية» ثم «إضافة».
        </li>
      </ol>
    );
  }

  if (kind === "samsung") {
    return (
      <ol className="flex flex-col gap-1 rounded-xl bg-secondary/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
        <li className="flex items-center gap-1">
          <MoreVertical className="h-3 w-3 shrink-0 text-primary" />
          في Samsung Internet: القائمة (☰).
        </li>
        <li className="flex items-center gap-1">
          <Download className="h-3 w-3 shrink-0 text-primary" />
          «إضافة صفحة إلى» ← «الشاشة الرئيسية» — أو «تثبيت التطبيق» إن ظهر.
        </li>
      </ol>
    );
  }

  if (kind === "huawei") {
    return (
      <ol className="flex flex-col gap-1 rounded-xl bg-secondary/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
        <li className="text-[10px] font-bold text-foreground">
          مسار Huawei + Chrome (PWA — ليس APK):
        </li>
        <li className="flex items-center gap-1">
          <MoreVertical className="h-3 w-3 shrink-0 text-primary" />
          1) تأكد أنك داخل Google Chrome على نفس رابط Tafriz.
        </li>
        <li className="flex items-center gap-1">
          <MoreVertical className="h-3 w-3 shrink-0 text-primary" />
          2) اضغط القائمة ⋮ أعلى يمين Chrome.
        </li>
        <li className="flex items-center gap-1">
          <Download className="h-3 w-3 shrink-0 text-primary" />
          3) اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».
        </li>
        <li className="flex items-center gap-1">
          <Check className="h-3 w-3 shrink-0 text-primary" />
          4) بعد التأكيد افتح أيقونة «الفرز» من الشاشة الرئيسية.
        </li>
        <li className="text-[10px]">
          إن لم يظهر الخيار: النظام/Chrome على هذا الجهاز لا يوفّر التثبيت المباشر — لا يوجد زر برمجي بديل.
        </li>
      </ol>
    );
  }

  return (
    <ol className="flex flex-col gap-1 rounded-xl bg-secondary/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
      <li className="flex items-center gap-1">
        <MoreVertical className="h-3 w-3 shrink-0 text-primary" />
        افتح قائمة المتصفح (ثلاث نقاط).
      </li>
      <li className="flex items-center gap-1">
        <Download className="h-3 w-3 shrink-0 text-primary" />
        اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».
      </li>
    </ol>
  );
}
