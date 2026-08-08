import * as React from "react";
import { Download, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  InstallState,
  isRunningStandalone,
  rememberInstallOpened,
  shouldOfferInstallUi,
  watchInstallAvailability,
} from "@/lib/install-app";

/**
 * بطاقة تثبيت ظاهرة في أعلى شاشة الدخول — نفس هوية التطبيق (primary / Card).
 * تستخدم نفس مراقب التثبيت؛ البانر السفلي يبقى متزامنًا عبر الأحداث.
 */
export function LoginInstallCard() {
  const [visible] = React.useState(() => shouldOfferInstallUi() && !isRunningStandalone());
  const [state, setState] = React.useState<InstallState>(() =>
    visible ? "manual" : "unavailable"
  );
  const installRef = React.useRef<null | (() => Promise<string>)>(null);

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

  async function onInstall() {
    window.dispatchEvent(new CustomEvent("tafriz:show-install"));
    if (state === "ready") {
      await installRef.current?.();
      return;
    }
    if (state === "installed") {
      rememberInstallOpened();
      window.location.assign("/?source=pwa");
    }
  }

  const title =
    state === "installed"
      ? "تم تثبيت «الفرز»"
      : state === "waiting"
        ? "جاري تثبيت التطبيق…"
        : "ثبّت التطبيق على جوالك";

  const subtitle =
    state === "installed"
      ? "اضغط فتح التطبيق أو افتح الأيقونة من الشاشة الرئيسية."
      : state === "waiting"
        ? "انتظر حتى يكتمل التنزيل — لا تغلق الصفحة."
        : "للتثبيت السريع على الشاشة الرئيسية قبل تسجيل الدخول.";

  return (
    <Card className="border-primary/30 bg-primary/5 shadow-md">
      <CardContent className="flex flex-col gap-3 pt-5">
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
        {state === "waiting" ? (
          <Button className="w-full" disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري التنزيل والتثبيت…
          </Button>
        ) : (
          <Button className="w-full" onClick={() => void onInstall()}>
            {state === "installed" ? (
              <>
                <Check className="h-4 w-4" />
                فتح التطبيق
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                تثبيت التطبيق
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
