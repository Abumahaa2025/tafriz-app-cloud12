import * as React from "react";
import { Download, X, Share, Plus, MoreVertical, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  detectInstallManualKind,
  InstallState,
  rememberPromptDismissed,
  wasPromptDismissedRecently,
  watchInstallAvailability,
} from "@/lib/install-app";

/**
 * تثبيت PWA فقط.
 * - «تثبيت الآن» يظهر فقط عند وجود beforeinstallprompt (ready).
 * - لا redirect إلى Chrome Intent ولا إلى install.html/APK من هذا البانر.
 */
export function InstallAppBanner() {
  const [state, setState] = React.useState<InstallState>("unavailable");
  const [hidden, setHidden] = React.useState(() => wasPromptDismissedRecently());
  const [showSteps, setShowSteps] = React.useState(false);
  const [forceHelp, setForceHelp] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
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
    if (
      state === "manual" ||
      state === "use-chrome" ||
      (manualKind === "huawei" && state !== "ready" && state !== "installed")
    ) {
      setShowSteps(true);
    }
  }, [state, manualKind]);

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

  if (state === "unavailable") return null;
  if (hidden && !forceHelp) return null;

  function dismiss() {
    rememberPromptDismissed();
    setHidden(true);
    setForceHelp(false);
  }

  async function copyPageLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin + "/");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  }

  const subtitle =
    state === "ready"
      ? "التثبيت المباشر متاح من المتصفح (PWA). لن يتم تنزيل ملف APK."
      : state === "waiting"
        ? "تم قبول موجّه النظام — بانتظار تأكيد التثبيت الفعلي…"
        : state === "installed"
          ? "تم التثبيت بنجاح. افتح الأيقونة من الشاشة الرئيسية."
          : manualKind === "huawei"
            ? "على هذا الجهاز قد لا يتوفر زر التثبيت المباشر. اتبع خطوات Chrome بالأسفل (PWA فقط — ليس APK)."
            : "إن لم يظهر «تثبيت الآن» فالتثبيت اليدوي من قائمة المتصفح هو المسار الصحيح.";

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

        {state === "ready" ? (
          <Button
            className="w-full"
            onClick={() => {
              void installRef.current?.().then((result) => {
                if (result === "unavailable" || result === "dismissed") setShowSteps(true);
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
            {showSteps ? "إخفاء الخطوات" : "خطوات التثبيت اليدوي"}
          </Button>
        )}

        {showSteps && state !== "ready" && state !== "waiting" && state !== "installed" && (
          <>
            <ManualInstallSteps kind={manualKind} />
            <Button variant="outline" className="w-full" onClick={() => void copyPageLink()}>
              <Copy className="h-4 w-4" />
              {copied ? "تم نسخ الرابط" : "نسخ رابط التطبيق"}
            </Button>
            <p className="text-center text-[10px] text-muted-foreground">
              لا يوجد توجيه تلقائي إلى Chrome أو تنزيل APK من هذا الزر. إن لم يدعم جهازك
              beforeinstallprompt فخطوات القائمة أعلاه هي المسار الصحيح.
            </p>
          </>
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
          Share → «إضافة إلى الشاشة الرئيسية».
        </li>
      </ol>
    );
  }

  if (kind === "samsung") {
    return (
      <ol className="flex flex-col gap-1 rounded-xl bg-secondary/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
        <li className="flex items-center gap-1">
          <MoreVertical className="h-3 w-3 shrink-0 text-primary" />
          Samsung Internet: القائمة ☰ → إضافة إلى الشاشة الرئيسية / تثبيت التطبيق.
        </li>
      </ol>
    );
  }

  if (kind === "huawei") {
    return (
      <ol className="flex flex-col gap-1 rounded-xl bg-secondary/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
        <li className="text-[10px] font-bold text-foreground">Huawei + Chrome — PWA فقط:</li>
        <li className="flex items-center gap-1">
          <MoreVertical className="h-3 w-3 shrink-0 text-primary" />
          1) افتح هذا الرابط داخل Google Chrome (ليس متصفحًا مدمجًا).
        </li>
        <li className="flex items-center gap-1">
          <MoreVertical className="h-3 w-3 shrink-0 text-primary" />
          2) القائمة ⋮ → «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».
        </li>
        <li className="flex items-center gap-1">
          <Check className="h-3 w-3 shrink-0 text-primary" />
          3) بعد التأكيد افتح أيقونة «الفرز» من الشاشة الرئيسية.
        </li>
        <li className="text-[10px]">
          إن ظهر تنزيل ملف بدل التثبيت، ألغِ التنزيل — هذا ليس مسار PWA الصحيح.
        </li>
      </ol>
    );
  }

  return (
    <ol className="flex flex-col gap-1 rounded-xl bg-secondary/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
      <li className="flex items-center gap-1">
        <MoreVertical className="h-3 w-3 shrink-0 text-primary" />
        قائمة المتصفح ⋮ → «تثبيت التطبيق» / «إضافة إلى الشاشة الرئيسية».
      </li>
      <li className="flex items-center gap-1">
        <Plus className="h-3 w-3 shrink-0 text-primary" />
        لا تستخدم صفحة تنزيل APK إلا إذا طلبت ذلك صراحةً.
      </li>
    </ol>
  );
}
