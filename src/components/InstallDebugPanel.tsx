import * as React from "react";
import {
  clearInstallDebugEvents,
  formatInstallDebugText,
  getInstallDebugSnapshot,
  isInstallDebugEnabled,
  subscribeInstallDebug,
  type InstallDebugSnapshot,
} from "@/lib/install-debug";

/** تشخيص تثبيت PWA — ?installDebug=1 أو ?debug=1 */
export function InstallDebugPanel() {
  const [on] = React.useState(() => isInstallDebugEnabled());
  const [snap, setSnap] = React.useState<InstallDebugSnapshot>(() => getInstallDebugSnapshot());
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!on) return;
    return subscribeInstallDebug(() => setSnap(getInstallDebugSnapshot()));
  }, [on]);

  if (!on) return null;

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(formatInstallDebugText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  const row = (k: string, v: string | boolean | null) => (
    <div>
      <span className="text-muted-foreground">{k}: </span>
      <span className="font-bold">{v === null || v === "" ? "—" : String(v)}</span>
    </div>
  );

  return (
    <div className="fixed right-2 top-14 z-50 max-h-[42vh] w-[min(22rem,calc(100vw-1rem))] overflow-auto rounded-lg border border-sky-500/40 bg-background/95 p-2 text-[10px] shadow-lg backdrop-blur">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 font-bold text-sky-700">
        <span>Install Debug</span>
        <span className="flex gap-2 font-normal">
          <button type="button" className="underline" onClick={() => void copyAll()}>
            {copied ? "تم النسخ" : "نسخ"}
          </button>
          <button type="button" className="underline" onClick={() => clearInstallDebugEvents()}>
            مسح الأحداث
          </button>
        </span>
      </div>
      <div className="flex flex-col gap-0.5 text-right leading-relaxed">
        {row("beforeinstallprompt", snap.beforeinstallprompt)}
        {row("isStandalone", snap.isStandalone)}
        {row("display-mode", snap.displayMode)}
        {row("isIOS", snap.isIOS)}
        {row("isSamsung", snap.isSamsung)}
        {row("isHuawei", snap.isHuawei)}
        {row("installState", snap.installState)}
        {row("promptCalled", snap.promptCalled)}
        {row("userChoice", snap.userChoice)}
        {row("appinstalled", snap.appinstalled)}
        {row("canInstallNative", snap.canInstallNative)}
        {row("manualKind", snap.manualKind)}
      </div>
      <div className="mt-2 border-t border-border pt-1">
        <p className="mb-1 font-bold">events</p>
        {snap.events.length === 0 ? (
          <p className="text-muted-foreground">لا أحداث بعد — افتح البانر أو اضغط تثبيت.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {snap.events.slice(0, 12).map((e, i) => (
              <li key={`${e.at}-${i}`} className="rounded bg-secondary/40 px-1 py-0.5">
                {e.kind}
                {e.detail ? ` · ${e.detail}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
