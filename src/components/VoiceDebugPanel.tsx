import * as React from "react";
import {
  clearVoiceDebug,
  getVoiceDebugEntries,
  isVoiceDebugEnabled,
  subscribeVoiceDebug,
  type VoiceDebugEntry,
} from "@/lib/voice-debug";

/** لوحة تشخيص مؤقتة — تظهر فقط مع ?voiceDebug=1 */
export function VoiceDebugPanel() {
  const [on, setOn] = React.useState(() => isVoiceDebugEnabled());
  const [rows, setRows] = React.useState<VoiceDebugEntry[]>(() => getVoiceDebugEntries());

  React.useEffect(() => {
    setOn(isVoiceDebugEnabled());
    return subscribeVoiceDebug(() => setRows(getVoiceDebugEntries()));
  }, []);

  if (!on) return null;

  return (
    <div className="fixed left-2 top-14 z-50 max-h-[40vh] w-[min(22rem,calc(100vw-1rem))] overflow-auto rounded-lg border border-amber-500/40 bg-background/95 p-2 text-[10px] shadow-lg backdrop-blur">
      <div className="mb-1 flex items-center justify-between gap-2 font-bold text-amber-700">
        <span>Voice Debug</span>
        <button type="button" className="underline" onClick={() => clearVoiceDebug()}>
          مسح
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">انتظر نتيجة صوت…</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r, i) => (
            <li key={`${r.at}-${i}`} className="rounded border border-border/60 bg-secondary/40 p-1.5 text-right leading-relaxed">
              <div className="text-[9px] text-muted-foreground">
                {r.source} · {new Date(r.at).toLocaleTimeString("ar-SA")}
              </div>
              {r.raw != null && <div>RAW: {r.raw}</div>}
              {r.finalSpeech != null && <div>FINAL: {r.finalSpeech}</div>}
              {r.normalized != null && <div>NORM: {r.normalized}</div>}
              {r.intent != null && <div>INTENT: {r.intent}</div>}
              {r.execution != null && <div>EXEC: {r.execution}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
