/**
 * تشخيص تثبيت PWA — يُفعَّل بـ ?installDebug=1 أو ?debug=1
 * مخزن أحداث فقط (بدون استيراد install-app لتفادي دورة الاعتماد).
 */

export type InstallDebugEvent = {
  at: number;
  kind: string;
  detail?: string;
};

export type InstallDebugSnapshot = {
  at: number;
  beforeinstallprompt: boolean;
  isStandalone: boolean;
  displayMode: string;
  isIOS: boolean;
  isSamsung: boolean;
  isHuawei: boolean;
  installState: string;
  promptCalled: boolean;
  userChoice: string | null;
  appinstalled: boolean;
  canInstallNative: boolean;
  manualKind: string;
  ua: string;
  referrer: string;
  events: InstallDebugEvent[];
};

const KEY = "tafriz_install_debug";
const MAX_EVENTS = 60;

let snapshot: InstallDebugSnapshot = emptySnapshot();
const listeners = new Set<() => void>();

function emptySnapshot(): InstallDebugSnapshot {
  return {
    at: Date.now(),
    beforeinstallprompt: false,
    isStandalone: false,
    displayMode: "unknown",
    isIOS: false,
    isSamsung: false,
    isHuawei: false,
    installState: "idle",
    promptCalled: false,
    userChoice: null,
    appinstalled: false,
    canInstallNative: false,
    manualKind: "android",
    ua: "",
    referrer: "",
    events: [],
  };
}

export function isInstallDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("installDebug") === "1" || q.get("debug") === "1") return true;
    if (window.localStorage.getItem(KEY) === "1") return true;
  } catch {
    // ignore
  }
  return false;
}

export function pushInstallDebugEvent(kind: string, detail?: string): void {
  snapshot.events = [{ at: Date.now(), kind, detail }, ...snapshot.events].slice(0, MAX_EVENTS);
  snapshot.at = Date.now();
  emit();
}

export function setInstallDebugPatch(patch: Partial<InstallDebugSnapshot>): void {
  snapshot = { ...snapshot, ...patch, at: Date.now() };
  snapshot.canInstallNative = !!snapshot.beforeinstallprompt && !snapshot.isStandalone;
  emit();
}

export function getInstallDebugSnapshot(): InstallDebugSnapshot {
  return snapshot;
}

export function clearInstallDebugEvents(): void {
  snapshot.events = [];
  emit();
}

export function subscribeInstallDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((l) => l());
}

export function formatInstallDebugText(): string {
  const s = snapshot;
  const lines = [
    "=== Tafriz Install Debug ===",
    `time: ${new Date(s.at).toISOString()}`,
    `beforeinstallprompt: ${s.beforeinstallprompt}`,
    `isStandalone: ${s.isStandalone}`,
    `display-mode: ${s.displayMode}`,
    `isIOS: ${s.isIOS}`,
    `isSamsung: ${s.isSamsung}`,
    `isHuawei: ${s.isHuawei}`,
    `installState: ${s.installState}`,
    `promptCalled: ${s.promptCalled}`,
    `userChoice: ${s.userChoice ?? "—"}`,
    `appinstalled: ${s.appinstalled}`,
    `canInstallNative: ${s.canInstallNative}`,
    `manualKind: ${s.manualKind}`,
    `referrer: ${s.referrer || "—"}`,
    `ua: ${s.ua}`,
    "--- events ---",
    ...s.events.map(
      (e) => `${new Date(e.at).toISOString()} ${e.kind}${e.detail ? ` | ${e.detail}` : ""}`
    ),
  ];
  return lines.join("\n");
}
