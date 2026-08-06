import * as React from "react";
import { Download, X, Share, Plus, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InstallState,
  isIOSDevice,
  rememberPromptDismissed,
  wasPromptDismissedRecently,
  watchInstallAvailability,
} from "@/lib/install-app";

/**
 * تذكير بتثبيت التطبيق، يظهر فقط إذا كان المستخدم يستعرضه من متصفح.
 *
 * سببه أن بعض الجوالات تفتح الغلاف كتبويب متصفح بشريط عنوان (متصفح الجهاز لا
 * يدعم TWA)، فيظن المستخدم أنه «موقع». التثبيت من هنا ينتج أيقونة تطبيق حقيقية
 * تفتح بلا شريط عنوان، ولا يعتمد على ملف APK ولا على الغلاف.
 *
 * لا يظهر إطلاقًا داخل التطبيق المثبّت، ولا لمن أخفاه خلال الأسبوع الماضي.
 */
export function InstallAppBanner() {
  const [state, setState] = React.useState<InstallState>("unavailable");
  const [hidden, setHidden] = React.useState(() => wasPromptDismissedRecently());
  const [showSteps, setShowSteps] = React.useState(false);
  const installRef = React.useRef<null | (() => Promise<boolean>)>(null);

  React.useEffect(() => {
    const watcher = watchInstallAvailability(setState);
    installRef.current = watcher.install;
    return () => {
      watcher.stop();
      installRef.current = null;
    };
  }, []);

  if (hidden || state === "unavailable") return null;

  const ios = isIOSDevice();

  function dismiss() {
    rememberPromptDismissed();
    setHidden(true);
  }

  return (
    <div className="fixed inset-x-0 bottom-[4.75rem] z-20 px-4">
      <div className="mx-auto flex max-w-md flex-col gap-2 rounded-2xl border border-primary/25 bg-background/95 p-3 shadow-lg backdrop-blur">
        <div className="flex items-start gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Download className="h-4 w-4 text-primary" />
          </span>
          <div className="flex flex-1 flex-col gap-0.5 text-right">
            <p className="text-sm font-black text-foreground">ثبّت «الفرز» كتطبيق</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              أنت تستعرضه الآن من المتصفح. التثبيت يعطيك أيقونة على الشاشة الرئيسية
              تفتح بلا شريط عنوان، وبياناتك تبقى كما هي.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="إخفاء التذكير"
            className="shrink-0 text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {state === "ready" ? (
          <Button
            className="w-full"
            onClick={() => {
              void installRef.current?.();
            }}
          >
            <Download className="h-4 w-4" />
            تثبيت الآن
          </Button>
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => setShowSteps((v) => !v)}>
            {showSteps ? "إخفاء الخطوات" : "كيف أثبّته؟"}
          </Button>
        )}

        {state !== "ready" && showSteps && (
          <ol className="flex flex-col gap-1 rounded-xl bg-secondary/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
            {ios ? (
              <>
                <li className="flex items-center gap-1">
                  <Share className="h-3 w-3 shrink-0 text-primary" />
                  اضغط زر المشاركة في شريط Safari الأسفل.
                </li>
                <li className="flex items-center gap-1">
                  <Plus className="h-3 w-3 shrink-0 text-primary" />
                  اختر «إضافة إلى الشاشة الرئيسية» ثم «إضافة».
                </li>
              </>
            ) : (
              <>
                <li className="flex items-center gap-1">
                  <MoreVertical className="h-3 w-3 shrink-0 text-primary" />
                  افتح قائمة المتصفح (ثلاث نقاط) من أعلى الشاشة.
                </li>
                <li className="flex items-center gap-1">
                  <Download className="h-3 w-3 shrink-0 text-primary" />
                  اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».
                </li>
              </>
            )}
          </ol>
        )}
      </div>
    </div>
  );
}
