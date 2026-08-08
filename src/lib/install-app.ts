/**
 * تثبيت التطبيق من داخل التطبيق نفسه (PWA).
 * لا يعتمد على APK ولا على Capacitor لهذا المسار.
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

export function isSamsungInternet(): boolean {
  if (typeof navigator === "undefined") return false;
  return /SamsungBrowser/i.test(navigator.userAgent);
}

/** جهاز Huawei/Honor (حتى مع Chrome) — تجربة beforeinstallprompt غالبًا متأخرة/غائبة */
export function isHuaweiFamilyDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Huawei|HUAWEI|Honor|HONOR|HMSCore|Harmony/i.test(ua);
}

/**
 * متصفح أندرويد غير Chrome/Samsung — توجيه اختياري لـ Chrome عندما
 * التثبيت الأصلي غير موثوق.
 */
export function isOtherAndroidBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (!/Android/i.test(ua)) return false;
  if (/SamsungBrowser/i.test(ua)) return false; // له مسار تعليمات خاص
  return /MiuiBrowser|HeyTapBrowser|OppoBrowser|VivoBrowser|HuaweiBrowser|UCBrowser|YaBrowser|OPR\//.test(
    ua
  );
}

/** يفتح نفس الصفحة في Chrome على أندرويد. */
export function chromeIntentUrl(): string {
  const { host, pathname } = window.location;
  return `intent://${host}${pathname}#Intent;scheme=https;package=com.android.chrome;end`;
}

export function wasPromptDismissedRecently(): boolean {
  const at = loadLocal<number | null>(DISMISSED_KEY, null);
  if (!at) return false;
  return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export function rememberPromptDismissed(): void {
  saveLocal(DISMISSED_KEY, Date.now());
}

/**
 * - unavailable: يعمل standalone فعلًا أو أُخفي التذكير
 * - ready: beforeinstallprompt متاح → زر تثبيت أصلي
 * - waiting: المستخدم قبل موجّه النظام — ننتظر appinstalled / standalone
 * - installed: تأكيد فعلي عبر appinstalled أو display-mode
 * - manual: تعليمات يدوية حسب الجهاز
 * - use-chrome: متصفح أندرويد ضعيف التثبيت → اقترح Chrome
 */
export type InstallState =
  | "unavailable"
  | "ready"
  | "waiting"
  | "installed"
  | "manual"
  | "use-chrome";

export type InstallManualKind = "ios" | "samsung" | "huawei" | "android" | "desktop";

export function detectInstallManualKind(): InstallManualKind {
  if (isIOSDevice()) return "ios";
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (!/Android/i.test(ua)) return "desktop";
  if (isSamsungInternet()) return "samsung";
  if (isHuaweiFamilyDevice()) return "huawei";
  return "android";
}

/**
 * يراقب `beforeinstallprompt` ويرجع دالة تشغيل الموجّه.
 * لا يُعلَن التثبيت ناجحًا إلا بعد appinstalled أو التحقق من standalone.
 */
export function watchInstallAvailability(
  onChange: (state: InstallState) => void
): { install: () => Promise<"prompted" | "accepted" | "dismissed" | "unavailable">; stop: () => void } {
  let deferred: BeforeInstallPromptEvent | null = null;
  let waitingTimer: ReturnType<typeof setTimeout> | null = null;
  let current: InstallState = "manual";

  const setState = (next: InstallState) => {
    current = next;
    onChange(next);
  };

  const compute = () => {
    if (isRunningStandalone()) return setState("unavailable");
    if (current === "waiting" || current === "installed") return;
    if (isIOSDevice()) return setState("manual");
    // Samsung Internet: تعليمات خاصة — لا نفترض مطابقة Chrome
    if (isSamsungInternet()) {
      return setState(deferred ? "ready" : "manual");
    }
    // متصفحات أندرويد أخرى ضعيفة: اقترح Chrome إن لم يتوفر الموجّه
    if (isOtherAndroidBrowser() && !deferred) return setState("use-chrome");
    // Huawei + Chrome: إن وُجد BIP استخدمه، وإلا تعليمات Huawei واضحة
    setState(deferred ? "ready" : "manual");
  };

  const confirmInstalled = () => {
    if (waitingTimer) {
      clearTimeout(waitingTimer);
      waitingTimer = null;
    }
    deferred = null;
    setState("installed");
    // أخفِ بعد لحظة قصيرة حتى يرى المستخدم التأكيد الحقيقي فقط
    window.setTimeout(() => {
      if (isRunningStandalone() || current === "installed") {
        setState("unavailable");
      }
    }, 2500);
  };

  const onBeforeInstall = (event: Event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    if (current !== "waiting" && current !== "installed") compute();
  };

  const onInstalled = () => {
    confirmInstalled();
  };

  window.addEventListener("beforeinstallprompt", onBeforeInstall);
  window.addEventListener("appinstalled", onInstalled);
  compute();

  return {
    async install() {
      if (isRunningStandalone()) {
        setState("unavailable");
        return "unavailable";
      }
      if (!deferred) {
        compute();
        return "unavailable";
      }
      const event = deferred;
      // الموجّه يُستهلك مرة واحدة فقط
      deferred = null;
      setState("waiting");
      try {
        await event.prompt();
        const { outcome } = await event.userChoice;
        if (outcome === "accepted") {
          // لا نعلن التثبيت هنا — ننتظر appinstalled أو standalone
          if (waitingTimer) clearTimeout(waitingTimer);
          waitingTimer = setTimeout(() => {
            if (isRunningStandalone()) {
              confirmInstalled();
              return;
            }
            // القبول دون تثبيت فعلي (شائع على بعض أجهزة Huawei) → تعليمات يدوية
            setState("manual");
          }, 8000);
          return "accepted";
        }
        setState(deferred ? "ready" : "manual");
        return "dismissed";
      } catch {
        setState("manual");
        return "unavailable";
      }
    },
    stop() {
      if (waitingTimer) clearTimeout(waitingTimer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    },
  };
}
