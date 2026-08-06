/**
 * تثبيت التطبيق من داخل التطبيق نفسه.
 *
 * الشكوى: التطبيق «يفتح عبر الويب فقط» على بعض الجوالات. غلاف TWA يفتح المحتوى
 * داخل المتصفح، فإن كان متصفح الجهاز لا يدعم Trusted Web Activity يسقط الغلاف
 * إلى تبويب متصفح بشريط عنوان ظاهر — فيبدو «موقعًا» لا تطبيقًا. ونفس الشيء لمن
 * يفتح الرابط في المتصفح بلا تثبيت.
 *
 * الحل الذي لا يعتمد على الغلاف إطلاقًا: تثبيت الويب (WebAPK) من Chrome. ينتج
 * أيقونة تطبيق حقيقية تفتح بلا شريط عنوان. هذا الملف يوفّر كشف الحالة وتشغيل
 * موجّه التثبيت، ولا يفرض شيئًا: إن كان التطبيق مثبّتًا أصلًا لا يظهر أي شيء.
 */
import { loadLocal, saveLocal } from "./storage";

const DISMISSED_KEY = "install_prompt_dismissed_at";
/** إخفاء التذكير أسبوعًا بعد رفضه — تنبيه لا يُلاحق المستخدم. */
const DISMISS_DAYS = 7;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** هل التطبيق يعمل الآن كتطبيق مستقل (مثبّت) لا كصفحة في متصفح؟ */
export function isRunningStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mm = (query: string) => !!window.matchMedia && window.matchMedia(query).matches;
  return (
    mm("(display-mode: standalone)") ||
    mm("(display-mode: fullscreen)") ||
    mm("(display-mode: minimal-ui)") ||
    // Safari على iOS
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    // غلاف TWA يضع هذا المُحيل، فالمستخدم داخل التطبيق فعلًا
    document.referrer.startsWith("android-app://")
  );
}

export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function wasPromptDismissedRecently(): boolean {
  const at = loadLocal<number | null>(DISMISSED_KEY, null);
  if (!at) return false;
  return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export function rememberPromptDismissed(): void {
  saveLocal(DISMISSED_KEY, Date.now());
}

export type InstallState = "unavailable" | "ready" | "manual";

/**
 * يراقب `beforeinstallprompt` ويرجع دالة تشغيل الموجّه.
 *
 * - `ready`: Chrome يقدر يثبّت الآن بضغطة واحدة.
 * - `manual`: لا يوجد موجّه (iOS، أو متصفح لا يدعمه) فنشرح الخطوات.
 * - `unavailable`: مثبّت أصلًا أو رُفض التذكير مؤخرًا — لا نعرض شيئًا.
 */
export function watchInstallAvailability(
  onChange: (state: InstallState) => void
): { install: () => Promise<boolean>; stop: () => void } {
  let deferred: BeforeInstallPromptEvent | null = null;

  const compute = () => {
    if (isRunningStandalone()) return onChange("unavailable");
    onChange(deferred ? "ready" : "manual");
  };

  const onBeforeInstall = (event: Event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    compute();
  };
  const onInstalled = () => {
    deferred = null;
    onChange("unavailable");
  };

  window.addEventListener("beforeinstallprompt", onBeforeInstall);
  window.addEventListener("appinstalled", onInstalled);
  compute();

  return {
    async install() {
      if (!deferred) return false;
      const event = deferred;
      // الموجّه يُستهلك مرة واحدة فقط
      deferred = null;
      try {
        await event.prompt();
        const { outcome } = await event.userChoice;
        if (outcome === "accepted") {
          onChange("unavailable");
          return true;
        }
      } catch {
        // المتصفح رفض تشغيل الموجّه — نكمل بالخطوات اليدوية
      }
      compute();
      return false;
    },
    stop() {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    },
  };
}
