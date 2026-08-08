import * as React from "react";
import { Download, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ANDROID_APK_HREF,
  InstallState,
  isAndroidDevice,
  isRunningStandalone,
  openInstalledAppNavigation,
  prefersAndroidApkInstall,
  shouldOfferInstallUi,
  watchInstallAvailability,
} from "@/lib/install-app";

/**
 * مسار تثبيت مستقيم على شاشة الدخول:
 * تثبيت الآن → جاري التثبيت → تم التثبيت → فتح التطبيق
 * مع تنزيل APK عندما يثبّت المتصفح اختصار ويب فقط.
 */
export function LoginInstallCard() {
  const [visible] = React.useState(() => shouldOfferInstallUi() && !isRunningStandalone());
  const [state, setState] = React.useState<InstallState>(() =>
    visible ? "manual" : "unavailable"
  );
  const [needHelp, setNeedHelp] = React.useState(false);
  const installRef = React.useRef<null | (() => Promise<string>)>(null);
  const android = React.useMemo(() => isAndroidDevice(), []);
  const preferApk = React.useMemo(() => prefersAndroidApkInstall(), []);

  React.useEffect(() => {
    if (!visible) return;
    const watcher = watchInstallAvailability(setState);
    installRef.current = watcher.install;
    return () => {
      watcher.stop();
      installRef.current = null;
    };
  }, [visible]);

  if (!visible || state === "unavailable") return null;

  function downloadAndroidApk() {
    const a = document.createElement("a");
    a.href = ANDROID_APK_HREF;
    a.download = "Tafriz.apk";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function onInstall() {
    if (state === "installed") {
      openInstalledAppNavigation();
      return;
    }
    if (state === "waiting") return;
    setNeedHelp(false);
    const result = await installRef.current?.();
    if (result === "unavailable" || result === "dismissed") setNeedHelp(true);
  }

  React.useEffect(() => {
    if (state === "ready" || state === "waiting" || state === "installed") setNeedHelp(false);
  }, [state]);

  const step = state === "installed" ? 3 : state === "waiting" ? 2 : 1;
  const showApk =
    android && state !== "waiting" && (preferApk || state === "installed" || needHelp || state === "manual");

  const title =
    state === "installed"
      ? "تم التثبيت"
      : state === "waiting"
        ? "جاري التثبيت…"
        : "تثبيت التطبيق الآن";

  const subtitle =
    state === "installed"
      ? "افتح أيقونة «الفرز» من الشاشة الرئيسية بدون شريط المتصفح. إن بقي كويب استخدم تنزيل تطبيق أندرويد."
      : state === "waiting"
        ? "أكّد «إضافة» في نافذة النظام، ثم افتح الأيقونة من الشاشة الرئيسية كتطبيق."
        : preferApk
          ? "ثبّت من Chrome كتطبيق، أو نزّل تطبيق أندرويد إن بقي كصفحة ويب."
          : "مسار واحد: تثبيت الآن ← جاري التثبيت ← تم التثبيت ← فتح التطبيق.";

  return (
    <Card className="border-primary/30 bg-primary/5 shadow-md">
      <CardContent className="flex flex-col gap-3 pt-5">
        <div className="flex items-center justify-between gap-1 text-[10px] font-bold">
          <StepDot active={step >= 1} done={step > 1} label="تثبيت الآن" />
          <span className="h-px flex-1 bg-primary/20" />
          <StepDot active={step >= 2} done={step > 2} label="جاري التثبيت" />
          <span className="h-px flex-1 bg-primary/20" />
          <StepDot active={step >= 3} done={step >= 3} label="فتح التطبيق" />
        </div>

        <div className="flex items-start gap-2 text-right">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            {state === "installed" ? (
              <Check className="h-5 w-5 text-primary" />
            ) : state === "waiting" ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : (
              <Download className="h-5 w-5 text-primary" />
            )}
          </span>
          <div className="flex-1">
            <p className="text-sm font-black text-primary">{title}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        {state === "waiting" && (
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-primary/15"
            role="progressbar"
            aria-label="تقدم التثبيت"
          >
            <div className="login-install-progress h-full w-1/3 rounded-full bg-primary" />
          </div>
        )}

        {state === "waiting" ? (
          <Button className="w-full" disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري التثبيت…
          </Button>
        ) : state === "installed" ? (
          <Button className="w-full" onClick={() => openInstalledAppNavigation()}>
            <Check className="h-4 w-4" />
            فتح التطبيق
          </Button>
        ) : (
          <Button className="w-full" onClick={() => void onInstall()}>
            <Download className="h-4 w-4" />
            تثبيت الآن
          </Button>
        )}

        {showApk && (
          <Button type="button" variant="secondary" className="w-full" onClick={downloadAndroidApk}>
            <Download className="h-4 w-4" />
            تنزيل التطبيق (أندرويد)
          </Button>
        )}

        {needHelp && state !== "waiting" && state !== "installed" && (
          <p className="rounded-xl bg-secondary/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            من Chrome: ⋮ → «تثبيت التطبيق». أيقونة بشارة Chrome = اختصار ويب. للتطبيق الحقيقي استخدم
            «تنزيل التطبيق (أندرويد)» ثم ثبّت الملف من التنزيلات.
          </p>
        )}

        <style>{`
          @keyframes login-install-progress-slide {
            0% { transform: translateX(-120%); }
            100% { transform: translateX(320%); }
          }
          .login-install-progress {
            animation: login-install-progress-slide 1.35s ease-in-out infinite;
          }
        `}</style>
      </CardContent>
    </Card>
  );
}

function StepDot({
  active,
  done,
  label,
}: {
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <span
      className={`rounded-full px-2 py-1 ${
        done || active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      }`}
    >
      {label}
    </span>
  );
}
