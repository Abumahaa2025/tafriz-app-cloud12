import * as React from "react";
import { Download, X, Share, Plus, MoreVertical, Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import {
  detectInstallManualKind,
  InstallState,
  isRunningStandalone,
  ANDROID_APK_HREF,
  isAndroidDevice,
  openInstalledAppNavigation,
  rememberPromptDismissed,
  shouldOfferInstallUi,
  watchInstallAvailability,
} from "@/lib/install-app";

/**
 * بانر تثبيت مبسّط بعد الدخول:
 * تثبيت الآن → جاري التثبيت → تم التثبيت → فتح التطبيق
 * على شاشة الدخول تتكفل LoginInstallCard بالمسار لتفادي تداخل النوافذ.
 */
export function InstallAppBanner() {
  const { user, loading } = useAuth();
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
  const android = React.useMemo(() => isAndroidDevice(), []);
  const hasBottomNav = user?.status === "approved";

  // على شاشة الدخول/قبل الاعتماد: البطاقة العلوية وحدها — لتجنب تعارض مع نافذة النظام
  const onEntryScreen = !loading && (!user || user.status !== "approved");

  React.useEffect(() => {
    const watcher = watchInstallAvailability(setState);
    installRef.current = watcher.install;
    return () => {
      watcher.stop();
      installRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    // أخفِ الخطوات اليدوية أثناء المسار المباشر (ready/waiting/installed)
    if (state === "ready" || state === "waiting" || state === "installed") {
      setShowSteps(false);
      return;
    }
    // أظهر المساعدة فقط إن تعذّر موجّه النظام
    if (state === "manual" || state === "use-chrome") {
      setShowSteps(true);
    }
  }, [state]);

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
      // لا تفرض الخطوات اليدوية إن كان التثبيت المباشر جاهزًا
      if (state === "manual" || state === "use-chrome") setShowSteps(true);
    };
    window.addEventListener("tafriz:show-install", reveal);
    return () => window.removeEventListener("tafriz:show-install", reveal);
  }, [state]);

  React.useEffect(() => {
    if (state === "waiting" || state === "installed" || state === "ready") {
      setHidden(false);
    }
  }, [state]);

  if (onEntryScreen) return null;
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
    openInstalledAppNavigation();
  }

  function downloadAndroidApk() {
    const a = document.createElement("a");
    a.href = ANDROID_APK_HREF;
    a.download = "Tafriz.apk";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function onInstallClick() {
    if (state === "waiting" || state === "installed") return;
    const result = await installRef.current?.();
    if (result === "unavailable" || result === "dismissed") setShowSteps(true);
  }

  const subtitle =
    state === "ready"
      ? "اضغط «تثبيت الآن» ثم أكّد نافذة النظام — بعدها يظهر «فتح التطبيق»."
      : state === "waiting"
        ? "أكّد «إضافة» في نافذة النظام. إن كانت في الإشعارات افتحها الآن وأكّد."
        : state === "installed"
          ? "تم التثبيت بنجاح. اضغط «فتح التطبيق»."
          : "إن لم يظهر موجّه النظام، استخدم الخطوات المختصرة بالأسفل.";

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
                ? "تم التثبيت"
                : state === "waiting"
                  ? "جاري التثبيت…"
                  : "تثبيت الآن"}
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
            جاري التثبيت…
          </Button>
        ) : state === "installed" ? (
          <Button className="w-full" onClick={openInstalledApp}>
            <Check className="h-4 w-4" />
            فتح التطبيق
          </Button>
        ) : (
          <Button className="w-full" onClick={() => void onInstallClick()}>
            <Download className="h-4 w-4" />
            تثبيت الآن
          </Button>
        )}

        {android && state !== "waiting" && (
          <Button type="button" variant="secondary" className="w-full" onClick={downloadAndroidApk}>
            <Download className="h-4 w-4" />
            تنزيل التطبيق (أندرويد)
          </Button>
        )}

        {showSteps && state !== "ready" && state !== "waiting" && state !== "installed" && (
          <>
            <ManualInstallSteps kind={manualKind} />
            <Button variant="outline" className="w-full" onClick={() => void copyPageLink()}>
              <Copy className="h-4 w-4" />
              {copied ? "تم نسخ الرابط" : "نسخ رابط التطبيق"}
            </Button>
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
          القائمة ☰ → تثبيت التطبيق / إضافة إلى الشاشة الرئيسية.
        </li>
      </ol>
    );
  }

  if (kind === "huawei") {
    return (
      <ol className="flex flex-col gap-1 rounded-xl bg-secondary/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
        <li className="flex items-center gap-1">
          <MoreVertical className="h-3 w-3 shrink-0 text-primary" />
          Chrome ⋮ → «تثبيت التطبيق». إن ظهرت رسالة في الإشعارات افتحها واضغط إضافة.
        </li>
        <li className="flex items-center gap-1">
          <Check className="h-3 w-3 shrink-0 text-primary" />
          بعد الإضافة افتح أيقونة «الفرز» من الشاشة الرئيسية.
        </li>
      </ol>
    );
  }

  return (
    <ol className="flex flex-col gap-1 rounded-xl bg-secondary/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
      <li className="flex items-center gap-1">
        <MoreVertical className="h-3 w-3 shrink-0 text-primary" />
        قائمة المتصفح ⋮ → «تثبيت التطبيق».
      </li>
      <li className="flex items-center gap-1">
        <Plus className="h-3 w-3 shrink-0 text-primary" />
        تجنّب تنزيل APK إلا إذا طُلب ذلك صراحة.
      </li>
    </ol>
  );
}
