/**
 * تثبيت التطبيق من داخل التطبيق نفسه (PWA).
 * لا يعتمد على APK ولا على Capacitor لهذا المسار.
 * على Huawei/Chrome: لا نخدع المستخدم بواجهة Desktop إن لم تتوفر.
 */
import { loadLocal, saveLocal } from "./storage";
import { pushInstallDebugEvent, setInstallDebugPatch } from "./install-debug";

const DISMISSED_KEY = "install_prompt_dismissed_at";
/** إخفاء التذكير أسبوعًا بعد رفضه — تنبيه لا يُلاحق المستخدم. */
const DISMISS_DAYS = 7;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function displayModeNow(): string {
  if (typeof window === "undefined") return "unknown";
  for (const m of ["standalone", "fullscreen", "minimal-ui", "browser"] as const) {
    try {
      if (window.matchMedia(`(display-mode: ${m})`).matches) return m;
    } catch {
      // ignore
    }
  }
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return "ios-standalone";
  return "browser";
}

/** هل التطبيق يعمل الآن كتطبيق مستقل (مثبّت) لا كصفحة في متصفح؟ */
export function isRunningStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mm = (query: string) => !!window.matchMedia && window.matchMedia(query).matches;
  return (
    mm("(display-mode: standalone)") ||
    mm("(display-mode: fullscreen)") ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
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

/** جهاز Huawei/Honor (حتى مع Chrome) */
export function isHuaweiFamilyDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Huawei|HUAWEI|Honor|HONOR|HMSCore|Harmony/i.test(ua);
}

/**
 * متصفح أندرويد غير Chrome/Samsung/Huawei — قد يُقترح Chrome كخيار ثانوي فقط.
 * HuaweiBrowser يُعامل بمسار Huawei اليدوي (PWA) لا redirect صامت.
 */
export function isOtherAndroidBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (!/Android/i.test(ua)) return false;
  if (/SamsungBrowser/i.test(ua)) return false;
  if (isHuaweiFamilyDevice() || /HuaweiBrowser/i.test(ua)) return false;
  return /MiuiBrowser|HeyTapBrowser|OppoBrowser|VivoBrowser|UCBrowser|YaBrowser|OPR\//.test(ua);
}

/** يفتح نفس الصفحة في Chrome على أندرويد — لا يُستخدم كمسار افتراضي لـ Huawei. */
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
  if (isHuaweiFamilyDevice() || /HuaweiBrowser/i.test(ua)) return "huawei";
  return "android";
}

function publishDebug(state: InstallState, extra?: Record<string, unknown>) {
  setInstallDebugPatch({
    installState: state,
    isStandalone: isRunningStandalone(),
    displayMode: displayModeNow(),
    isIOS: isIOSDevice(),
    isSamsung: isSamsungInternet(),
    isHuawei: isHuaweiFamilyDevice(),
    manualKind: detectInstallManualKind(),
    ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
    referrer: typeof document !== "undefined" ? document.referrer || "" : "",
    ...(extra as Partial<{
      beforeinstallprompt: boolean;
      promptCalled: boolean;
      userChoice: string | null;
      appinstalled: boolean;
    }>),
  });
}

/**
 * يراقب beforeinstallprompt.
 * لا يُعلَن التثبيت ناجحًا إلا بعد appinstalled أو standalone حقيقي.
 */
export function watchInstallAvailability(
  onChange: (state: InstallState) => void
): { install: () => Promise<"prompted" | "accepted" | "dismissed" | "unavailable">; stop: () => void } {
  let deferred: BeforeInstallPromptEvent | null = null;
  let waitingTimer: ReturnType<typeof setTimeout> | null = null;
  let current: InstallState = "manual";

  const setState = (next: InstallState) => {
    current = next;
    publishDebug(next, { beforeinstallprompt: !!deferred });
    onChange(next);
  };

  const compute = () => {
    if (isRunningStandalone()) return setState("unavailable");
    if (current === "waiting" || current === "installed") return;
    if (isIOSDevice()) return setState("manual");
    // Huawei: تعليمات PWA يدوية — لا redirect إلى Chrome كمسار أساسي
    if (isHuaweiFamilyDevice() || (typeof navigator !== "undefined" && /HuaweiBrowser/i.test(navigator.userAgent))) {
      return setState(deferred ? "ready" : "manual");
    }
    if (isSamsungInternet()) {
      return setState(deferred ? "ready" : "manual");
    }
    // متصفحات أخرى ضعيفة فقط — اقتراح Chrome كخيار صريح (ليس تثبيتًا تلقائيًا)
    if (isOtherAndroidBrowser() && !deferred) return setState("use-chrome");
    setState(deferred ? "ready" : "manual");
  };

  const confirmInstalled = () => {
    if (waitingTimer) {
      clearTimeout(waitingTimer);
      waitingTimer = null;
    }
    deferred = null;
    pushInstallDebugEvent("appinstalled_or_standalone_confirmed");
    publishDebug("installed", { appinstalled: true, beforeinstallprompt: false });
    setState("installed");
    window.setTimeout(() => {
      if (isRunningStandalone() || current === "installed") {
        setState("unavailable");
      }
    }, 2500);
  };

  const onBeforeInstall = (event: Event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    pushInstallDebugEvent("beforeinstallprompt", "captured");
    publishDebug(current, { beforeinstallprompt: true });
    if (current !== "waiting" && current !== "installed") compute();
  };

  const onInstalled = () => {
    pushInstallDebugEvent("appinstalled", "browser_event");
    publishDebug(current, { appinstalled: true });
    confirmInstalled();
  };

  window.addEventListener("beforeinstallprompt", onBeforeInstall);
  window.addEventListener("appinstalled", onInstalled);
  pushInstallDebugEvent("watch_start");
  compute();

  return {
    async install() {
      pushInstallDebugEvent("install_click");
      if (isRunningStandalone()) {
        setState("unavailable");
        return "unavailable";
      }
      if (!deferred) {
        pushInstallDebugEvent("install_click_no_bip", "show_manual_steps");
        compute();
        return "unavailable";
      }
      const event = deferred;
      deferred = null;
      setState("waiting");
      publishDebug("waiting", { promptCalled: true, beforeinstallprompt: false });
      pushInstallDebugEvent("prompt_called");
      try {
        await event.prompt();
        const { outcome } = await event.userChoice;
        publishDebug("waiting", { userChoice: outcome, promptCalled: true });
        pushInstallDebugEvent("userChoice", outcome);
        if (outcome === "accepted") {
          if (waitingTimer) clearTimeout(waitingTimer);
          waitingTimer = setTimeout(() => {
            if (isRunningStandalone()) {
              confirmInstalled();
              return;
            }
            pushInstallDebugEvent("accepted_but_not_standalone", "fallback_manual");
            setState("manual");
          }, 8000);
          return "accepted";
        }
        setState("manual");
        return "dismissed";
      } catch (err) {
        pushInstallDebugEvent("prompt_error", err instanceof Error ? err.message : "unknown");
        setState("manual");
        return "unavailable";
      }
    },
    stop() {
      if (waitingTimer) clearTimeout(waitingTimer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      pushInstallDebugEvent("watch_stop");
    },
  };
}
