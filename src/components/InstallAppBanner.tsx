import * as React from "react";
import { Download, X, Share, Plus, MoreVertical, Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import {
  detectInstallManualKind,
  InstallState,
  isRunningStandalone,
  rememberInstallOpened,
  rememberPromptDismissed,
  shouldOfferInstallUi,
  watchInstallAvailability,
} from "@/lib/install-app";

/**
 * تثبيت PWA فقط.
 * - يظهر من أول فتح للتطبيق (شاشة الدخول) على الجوال.
 * - أثناء التثبيت يبقى شريط التنزيل ظاهرًا ثم يتحول إلى «فتح التطبيق».
 * - «تثبيت التطبيق» يظهر دائمًا على الجوال في المتصفح (مباشر أو يدوي).
 * - لا redirect إلى Chrome Intent ولا إلى install.html/APK من هذا البانر.
 */
export function InstallAppBanner() {
  const { user } = useAuth();
  const [state, setState] = React.useState<InstallState>(() => {
    if (typeof window === "undefined") return "unavailable";
    if (isRunningStandalone() || !shouldOfferInstallUi()) return "unavailable";
    return "manual";
  });
  const [hidden, setHidden] = React.useState(false);
  const [showSteps, setShowSteps] = React.useState(false);
  const [forceHelp, setForceHelp] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const installRef = React.useRef<null | (() => Promise<string>)>(null);
  const manualKind = React.useMemo(() => detectInstallManualKind(), []);
  const hasBottomNav = user?.status === "approved";

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
      (manualKind === "huawei" && state !== "ready" && state !== "waiting" && state !== "installed")
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

  React.useEffect(() => {
    const reveal = () => {
      setHidden(false);
      setForceHelp(true);
      setShowSteps(true);
    };
    window.addEventListener("tafriz:show-install", reveal);
    return () => window.removeEventListener("tafriz:show-install", reveal);
  }, []);

  // أثناء التنزيل / التثبيت الجاهز / بعد التثبيت: أظهر الشريط دائمًا
  React.useEffect(() => {
    if (state === "waiting" || state === "installed" || state === "ready") {
      setHidden(false);
    }
  }, [state]);

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

  function openInstalledApp() {
    rememberInstallOpened();
    window.location.assign("/?source=pwa");
  }

  async function onInstallClick() {
    if (state === "waiting" || state === "installed") return;
    const result = await installRef.current?.();
    if (result === "unavailable" || result === "dismissed") setShowSteps(true);
  }

  const subtitle =
    state === "ready"
      ? "ثبّت «الفرز» على الجوال لفتحه كتطبيق من الشاشة الرئيسية (PWA — بدون APK)."
      : state === "waiting"
        ? "أكّد موجّه النظام إن ظهر — بعدها سيكتمل التثبيت ويظهر زر الفتح."
        : state === "installed"
          ? "اكتمل التثبيت. اضغط «فتح التطبيق» الآن أو افتح أيقونة «الفرز» من الشاشة الرئيسية."
          : manualKind === "huawei"
            ? "اضغط «تثبيت التطبيق» واتبع خطوات Chrome بالأسفل (PWA فقط — ليس APK)."
            : "اضغط «تثبيت التطبيق» واتبع الخطوات إن لم يظهر موجّه النظام مباشرة.";

  return (
    <div className={`fixed inset-x-0 z-40 px-4 ${hasBottomNav ? "bottom-[4.75rem]" : "bottom-4"}`}>
      <div className="mx-auto flex max-w-md flex-col gap-2 rounded-2xl border border-primary/25 bg-background/95 p-3 shadow-lg backdrop-blur">
        <div className="flex items-start gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            {state === "installed" ? (
              <Check className="h-4 w-4 text-primary" />
            ) : state === "waiting" ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <Download className="h-4 w-4 text-primary" />
            )}
          </span>
          <div className="flex flex-1 flex-col gap-0.5 text-right">
            <p className="text-sm font-black text-foreground">
              {state === "installed"
                ? "اكتمل التثبيت — افتح التطبيق"
                : state === "waiting"
                  ? "جاري التثبيت…"
                  : "تثبيت التطبيق على الجوال"}
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{subtitle}</p>
          </div>
          {state !== "waiting" && (
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

        {state === "waiting" && (
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-primary/15"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="تقدم التثبيت"
          >
            <div className="install-progress-bar h-full w-1/3 rounded-full bg-primary" />
          </div>
        )}

        {state === "waiting" ? (
          <Button className="w-full" disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري التنزيل والتثبيت…
          </Button>
        ) : state === "installed" ? (
          <Button className="w-full" onClick={openInstalledApp}>
            <Check className="h-4 w-4" />
            فتح التطبيق
          </Button>
        ) : (
          <Button className="w-full" onClick={() => void onInstallClick()}>
            <Download className="h-4 w-4" />
            تثبيت التطبيق
          </Button>
        )}

        {showSteps && state !== "waiting" && state !== "installed" && (
          <>
            <ManualInstallSteps kind={manualKind} />
            <Button variant="outline" className="w-full" onClick={() => void copyPageLink()}>
              <Copy className="h-4 w-4" />
              {copied ? "تم نسخ الرابط" : "نسخ رابط التطبيق"}
            </Button>
            <p className="text-center text-[10px] text-muted-foreground">
              التثبيت عبر المتصفح (PWA). إن لم يظهر موجّه النظام فخطوات القائمة أعلاه هي المسار الصحيح.
            </p>
          </>
        )}
      </div>
      <style>{`
        @keyframes install-progress-slide {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
        .install-progress-bar {
          animation: install-progress-slide 1.35s ease-in-out infinite;
        }
      `}</style>
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
