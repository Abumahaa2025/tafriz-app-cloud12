/**
 * تثبيت التطبيق من داخل التطبيق نفسه (PWA).
 * لا يعتمد على APK ولا على Capacitor لهذا المسار.
 * على Huawei/Chrome: لا نخدع المستخدم بواجهة Desktop إن لم تتوفر.
 */
import { loadLocal, saveLocal } from "./storage";
import { pushInstallDebugEvent, setInstallDebugPatch } from "./install-debug";

const DISMISSED_KEY = "install_prompt_dismissed_at";
/** يحتفظ فقط بحالة «تم التثبيت» لإظهار «فتح التطبيق» — لا نُعيد «waiting» بعد إعادة التحميل. */
const FLOW_KEY = "install_flow_phase";
/** إخفاء التذكير أسبوعًا بعد رفضه — تنبيه لا يُلاحق المستخدم. */
const DISMISS_DAYS = 7;
/** بعد قبول موجّه النظام نُكمل الواجهة إلى «فتح التطبيق» حتى لو تأخّر حدث appinstalled. */
const ACCEPT_COMPLETE_MS = 1800;
/** مهلة أمان إن علّق موجّه التثبيت دون رد. */
const PROMPT_TIMEOUT_MS = 45000;

type PersistedFlow = "installed";

function readPersistedFlow(): PersistedFlow | null {
  try {
    const v = sessionStorage.getItem(FLOW_KEY);
    if (v === "installed") return v;
    // تنظيف بقايا waiting القديمة التي كانت تُعلّق الواجهة على «جاري التثبيت»
    if (v === "waiting") sessionStorage.removeItem(FLOW_KEY);
  } catch {
    // ignore
  }
  return null;
}

function writePersistedFlow(phase: PersistedFlow | null) {
  try {
    if (!phase) sessionStorage.removeItem(FLOW_KEY);
    else sessionStorage.setItem(FLOW_KEY, phase);
  } catch {
    // ignore
  }
}

async function ensureServiceWorkerReady(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<void>((resolve) => window.setTimeout(resolve, 2500)),
    ]);
  } catch {
    // ignore — نتابع التثبيت حتى إن تأخر الـ SW
  }
}

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
  // لا تعتمد على document.referrer === android-app:// — فتح الرابط من واتساب/تلغرام
  // يعطي referrer بهذا الشكل فيُخفى زر التثبيت بالخطأ بينما المستخدم ما زال في المتصفح.
  return (
    mm("(display-mode: standalone)") ||
    mm("(display-mode: fullscreen)") ||
    mm("(display-mode: minimal-ui)") ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** هل نعرض مسار التثبيت على هذا الجهاز (جوال في المتصفح)؟ */
export function shouldOfferInstallUi(): boolean {
  if (typeof window === "undefined") return false;
  if (isRunningStandalone()) return false;
  if (isIOSDevice()) return true;
  if (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent)) return true;
  // شاشات لمس واسعة قد تكون جوالًا بدون Android في الـ UA
  try {
    if (navigator.maxTouchPoints > 0 && window.matchMedia("(max-width: 900px)").matches) return true;
  } catch {
    // ignore
  }
  return false;
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

/**
 * جهاز Huawei/Honor (حتى مع Chrome).
 * مهم: Chrome على P30 Pro غالبًا يعرض رمز الجهاز فقط مثل VOG-L29 بدون كلمة Huawei.
 */
export function isHuaweiFamilyDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/Huawei|HUAWEI|Honor|HONOR|HMSCore|Harmony|HuaweiBrowser/i.test(ua)) return true;
  // رموز طراز شائعة (P30/P40/Mate…) تظهر في UA بدل اسم الشركة
  return /\b(VOG-|ELE-|ANA-|LIO-|LYA-|HMA-|TAS-|NOH-|ALN-|BRA-|JNY-|MAR-|ART-|CDY-|STK-|MED-|NTH-|ANY-|BON-|CTR-|MGA-|ALT-|GLA-|NAM-|RTE-|JAD-|DCO-|PAL-|BNE-)/i.test(
    ua
  );
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
  writePersistedFlow(null);
}

/** بعد فتح التطبيق من الزر — أخفِ شريط «فتح التطبيق» لهذه الجلسة إن بقي في المتصفح. */
export function rememberInstallOpened(): void {
  writePersistedFlow(null);
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
 * مراقب تثبيت واحد مشترك (singleton) حتى لا يتنازع أكثر من مكوّن على beforeinstallprompt.
 * بعد قبول موجّه النظام تُكمل الواجهة إلى «فتح التطبيق» (appinstalled أو مهلة قصيرة).
 */
type InstallListener = (state: InstallState) => void;

let sharedDeferred: BeforeInstallPromptEvent | null = null;
let sharedWaitingTimer: ReturnType<typeof setTimeout> | null = null;
let sharedPollTimer: ReturnType<typeof setInterval> | null = null;
let sharedCurrent: InstallState =
  typeof window !== "undefined" && shouldOfferInstallUi() && !isRunningStandalone() ? "manual" : "unavailable";
let sharedWatching = false;
const sharedListeners = new Set<InstallListener>();

function emitShared(next: InstallState) {
  sharedCurrent = next;
  if (next === "installed") writePersistedFlow("installed");
  else if (next === "unavailable" || next === "manual" || next === "use-chrome") writePersistedFlow(null);
  publishDebug(next, { beforeinstallprompt: !!sharedDeferred });
  for (const listener of sharedListeners) listener(next);
}

function stopSharedPoll() {
  if (sharedPollTimer) {
    clearInterval(sharedPollTimer);
    sharedPollTimer = null;
  }
}

function clearWaitingTimer() {
  if (sharedWaitingTimer) {
    clearTimeout(sharedWaitingTimer);
    sharedWaitingTimer = null;
  }
}

function confirmSharedInstalled(source: string = "confirmed") {
  clearWaitingTimer();
  stopSharedPoll();
  sharedDeferred = null;
  writePersistedFlow("installed");
  pushInstallDebugEvent("install_complete", source);
  publishDebug("installed", { appinstalled: true, beforeinstallprompt: false });
  emitShared("installed");
}

function startSharedStandalonePoll() {
  stopSharedPoll();
  sharedPollTimer = setInterval(() => {
    if (isRunningStandalone()) {
      stopSharedPoll();
      confirmSharedInstalled("standalone_poll");
    }
  }, 500);
}

/** بعد قبول موجّه النظام: أكمل إلى «فتح التطبيق» حتى لو تأخّر appinstalled. */
function scheduleAcceptedCompletion() {
  clearWaitingTimer();
  startSharedStandalonePoll();
  sharedWaitingTimer = setTimeout(() => {
    if (sharedCurrent !== "waiting") return;
    if (isRunningStandalone()) {
      confirmSharedInstalled("standalone_after_accept");
      return;
    }
    pushInstallDebugEvent("accepted_complete_to_open", "ui_complete");
    confirmSharedInstalled("accepted_timeout");
  }, ACCEPT_COMPLETE_MS);
}

function computeShared() {
  if (isRunningStandalone()) {
    writePersistedFlow(null);
    return emitShared("unavailable");
  }
  if (!shouldOfferInstallUi()) {
    if (!sharedDeferred) return emitShared("unavailable");
  }
  if (sharedCurrent === "waiting") return;
  if (sharedCurrent === "installed" || readPersistedFlow() === "installed") {
    return emitShared("installed");
  }
  // لا نستعد waiting من الجلسة — كان يعلّق الزر بدون تثبيت حقيقي
  readPersistedFlow();
  if (isIOSDevice()) return emitShared("manual");
  if (isHuaweiFamilyDevice() || (typeof navigator !== "undefined" && /HuaweiBrowser/i.test(navigator.userAgent))) {
    return emitShared(sharedDeferred ? "ready" : "manual");
  }
  if (isSamsungInternet()) {
    return emitShared(sharedDeferred ? "ready" : "manual");
  }
  if (isOtherAndroidBrowser() && !sharedDeferred) return emitShared("manual");
  emitShared(sharedDeferred ? "ready" : "manual");
}

function onSharedBeforeInstall(event: Event) {
  event.preventDefault();
  sharedDeferred = event as BeforeInstallPromptEvent;
  pushInstallDebugEvent("beforeinstallprompt", "captured");
  publishDebug(sharedCurrent, { beforeinstallprompt: true });
  if (sharedCurrent !== "waiting" && sharedCurrent !== "installed") computeShared();
}

function onSharedInstalled() {
  pushInstallDebugEvent("appinstalled", "browser_event");
  publishDebug(sharedCurrent, { appinstalled: true });
  confirmSharedInstalled("appinstalled");
}

function onSharedVisibility() {
  if (document.visibilityState !== "visible") return;
  if (sharedCurrent === "waiting" && isRunningStandalone()) {
    confirmSharedInstalled("visible_standalone");
  }
}

async function sharedInstall(): Promise<"prompted" | "accepted" | "dismissed" | "unavailable"> {
  pushInstallDebugEvent("install_click");
  if (isRunningStandalone()) {
    writePersistedFlow(null);
    emitShared("unavailable");
    return "unavailable";
  }
  if (!sharedDeferred) {
    pushInstallDebugEvent("install_click_no_bip", "show_manual_steps");
    computeShared();
    return "unavailable";
  }
  const event = sharedDeferred;
  sharedDeferred = null;

  // مهم: نستدعي prompt() مباشرة من إيماءة المستخدم — بدون await قبله
  emitShared("waiting");
  publishDebug("waiting", { promptCalled: true, beforeinstallprompt: false });
  pushInstallDebugEvent("prompt_called");
  startSharedStandalonePoll();

  try {
    const promptPromise = event.prompt().then(() => event.userChoice);
    const choice = await Promise.race([
      promptPromise,
      new Promise<{ outcome: "accepted" | "dismissed" }>((resolve) => {
        window.setTimeout(() => resolve({ outcome: "dismissed" }), PROMPT_TIMEOUT_MS);
      }),
    ]);
    const outcome = choice.outcome;
    publishDebug("waiting", { userChoice: outcome, promptCalled: true });
    pushInstallDebugEvent("userChoice", outcome);

    if (outcome === "accepted") {
      scheduleAcceptedCompletion();
      return "accepted";
    }

    clearWaitingTimer();
    stopSharedPoll();
    writePersistedFlow(null);
    emitShared("manual");
    return "dismissed";
  } catch (err) {
    clearWaitingTimer();
    stopSharedPoll();
    writePersistedFlow(null);
    pushInstallDebugEvent("prompt_error", err instanceof Error ? err.message : "unknown");
    emitShared("manual");
    return "unavailable";
  }
}

function ensureSharedWatch() {
  if (sharedWatching || typeof window === "undefined") return;
  sharedWatching = true;
  window.addEventListener("beforeinstallprompt", onSharedBeforeInstall);
  window.addEventListener("appinstalled", onSharedInstalled);
  document.addEventListener("visibilitychange", onSharedVisibility);
  pushInstallDebugEvent("watch_start");
  void ensureServiceWorkerReady();
  computeShared();
}

export function watchInstallAvailability(
  onChange: (state: InstallState) => void
): { install: () => Promise<"prompted" | "accepted" | "dismissed" | "unavailable">; stop: () => void } {
  sharedListeners.add(onChange);
  ensureSharedWatch();
  onChange(sharedCurrent);
  return {
    install: sharedInstall,
    stop() {
      sharedListeners.delete(onChange);
      // نبقي المراقب العام حيًا طالما التطبيق مفتوح — حتى يعود مكوّن التثبيت بسرعة
    },
  };
}
