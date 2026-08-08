import * as React from "react";
import {
  clearVoiceDebug,
  formatVoiceDebugText,
  getVoiceDebugEntries,
  isVoiceDebugEnabled,
  subscribeVoiceDebug,
  type VoiceDebugEntry,
} from "@/lib/voice-debug";

/** لوحة تشخيص مؤقتة — ?voiceDebug=1 أو ?debug=1 */
export function VoiceDebugPanel() {
  const [on, setOn] = React.useState(() => isVoiceDebugEnabled());
  const [rows, setRows] = React.useState<VoiceDebugEntry[]>(() => getVoiceDebugEntries());
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    setOn(isVoiceDebugEnabled());
    return subscribeVoiceDebug(() => setRows(getVoiceDebugEntries()));
  }, []);

  if (!on) return null;

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(formatVoiceDebugText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="fixed left-2 top-14 z-50 max-h-[42vh] w-[min(22rem,calc(100vw-1rem))] overflow-auto rounded-lg border border-amber-500/40 bg-background/95 p-2 text-[10px] shadow-lg backdrop-blur">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 font-bold text-amber-700">
        <span>Voice Debug</span>
        <span className="flex gap-2 font-normal">
          <button type="button" className="underline" onClick={() => void copyAll()}>
            {copied ? "تم النسخ" : "نسخ"}
          </button>
          <button type="button" className="underline" onClick={() => clearVoiceDebug()}>
            مسح
          </button>
        </span>
      </div>
      <p className="mb-1 text-[9px] text-muted-foreground">
        قارن DISPLAYED مع FINAL — إن ظهر نص بلا FINAL فالمشكلة lifecycle.
      </p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">اختبر: ج / ب / 4 / محمد / أمر كامل…</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r, i) => (
            <li
              key={`${r.at}-${i}`}
              className="rounded border border-border/60 bg-secondary/40 p-1.5 text-right leading-relaxed"
            >
              <div className="text-[9px] text-muted-foreground">
                {r.source}
                {r.phase ? ` · ${r.phase}` : ""} · {new Date(r.at).toLocaleTimeString("ar-SA")}
              </div>
              {r.displayed != null && <div>DISPLAYED: {r.displayed || "(empty)"}</div>}
              {r.raw != null && <div>RAW: {r.raw || "(empty)"}</div>}
              <div>FINAL: {r.finalSpeech != null ? r.finalSpeech || "(empty)" : "—"}</div>
              {r.normalized != null && <div>NORM: {r.normalized || "(empty)"}</div>}
              {r.intent != null && <div>INTENT: {r.intent}</div>}
              {r.execution != null && <div>EXEC: {r.execution}</div>}
              {r.error != null && <div className="text-destructive">ERROR: {r.error}</div>}
              {r.locale != null && <div>LOCALE: {r.locale}</div>}
              {r.speechApi != null && <div>API: {r.speechApi}</div>}
              {r.isFinal != null && <div>isFinal: {String(r.isFinal)}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
