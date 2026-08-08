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
 * تذكير بتثبيت التطبيق، يظهر فقط إذا كان المستخدم يستعرضه من متصفح.
 * لا يُعلن «تم التثبيت» إلا بعد appinstalled / standalone فعلي.
 */
export function InstallAppBanner() {
  const [state, setState] = React.useState<InstallState>("unavailable");
  const [hidden, setHidden] = React.useState(() => wasPromptDismissedRecently());
  const [showSteps, setShowSteps] = React.useState(false);
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

  // عند الحاجة لتعليمات يدوية (Huawei بدون BIP) افتح الخطوات تلقائيًا
  React.useEffect(() => {
    if (state === "manual" && (manualKind === "huawei" || manualKind === "samsung")) {
      setShowSteps(true);
    }
  }, [state, manualKind]);

  if (hidden || state === "unavailable") return null;

  function dismiss() {
    rememberPromptDismissed();
    setHidden(true);
  }

  const subtitle =
    state === "use-chrome"
      ? "متصفحك الحالي قد يضيف اختصارًا داخل المتصفح فقط. الأفضل فتح الصفحة في Chrome ثم التثبيت من هناك."
      : state === "waiting"
        ? "تم قبول موجّه النظام — ننتظر اكتمال التثبيت الفعلي…"
        : state === "installed"
          ? "تم التثبيت بنجاح. يمكنك فتح التطبيق من أيقونة الشاشة الرئيسية."
          : "أنت تستعرضه الآن من المتصفح. التثبيت يعطيك أيقونة على الشاشة الرئيسية تفتح بلا شريط عنوان.";

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
              {state === "installed" ? "تم تثبيت «الفرز»" : "ثبّت «الفرز» كتطبيق"}
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
          <Button className="w-full" onClick={() => window.location.assign(chromeIntentUrl())}>
            <ExternalLink className="h-4 w-4" />
            افتح في Chrome للتثبيت
          </Button>
        ) : state === "ready" ? (
          <Button
            className="w-full"
            onClick={() => {
              void installRef.current?.();
            }}
          >
            <Download className="h-4 w-4" />
            تثبيت الآن
          </Button>
        ) : state === "waiting" ? (
          <Button className="w-full" disabled>
            جاري التثبيت…
          </Button>
        ) : state === "installed" ? (
          <Button className="w-full" onClick={() => window.location.assign("/?source=pwa")}>
            <Check className="h-4 w-4" />
            فتح التطبيق
          </Button>
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setShowSteps((v) => !v)}>
            {showSteps ? "إخفاء الخطوات" : "كيف أثبّته؟"}
          </Button>
        )}

        {state === "manual" && showSteps && <ManualInstallSteps kind={manualKind} />}

        {state === "manual" && manualKind === "huawei" && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => window.location.assign(chromeIntentUrl())}
          >
            <ExternalLink className="h-4 w-4" />
            جرّب الفتح في Chrome
          </Button>
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
          في Samsung Internet: القائمة (☰) أسفل أو أعلى الشاشة.
        </li>
        <li className="flex items-center gap-1">
          <Download className="h-3 w-3 shrink-0 text-primary" />
          اختر «إضافة صفحة إلى» ثم «الشاشة الرئيسية» — أو «تثبيت التطبيق» إن ظهر.
        </li>
      </ol>
    );
  }

  if (kind === "huawei") {
    return (
      <ol className="flex flex-col gap-1 rounded-xl bg-secondary/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
        <li className="flex items-center gap-1">
          <MoreVertical className="h-3 w-3 shrink-0 text-primary" />
          على أجهزة Huawei: افتح القائمة ⋮ في أعلى Chrome (لا تعتمد على ظهور زر تلقائي).
        </li>
        <li className="flex items-center gap-1">
          <Download className="h-3 w-3 shrink-0 text-primary" />
          اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية» ثم أكّد.
        </li>
        <li className="flex items-center gap-1">
          <Check className="h-3 w-3 shrink-0 text-primary" />
          بعد التثبيت افتح الأيقونة من الشاشة الرئيسية (بلا شريط عنوان).
        </li>
      </ol>
    );
  }

  return (
    <ol className="flex flex-col gap-1 rounded-xl bg-secondary/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
      <li className="flex items-center gap-1">
        <MoreVertical className="h-3 w-3 shrink-0 text-primary" />
        افتح قائمة المتصفح (ثلاث نقاط) من أعلى الشاشة.
      </li>
      <li className="flex items-center gap-1">
        <Download className="h-3 w-3 shrink-0 text-primary" />
        اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».
      </li>
    </ol>
  );
}
