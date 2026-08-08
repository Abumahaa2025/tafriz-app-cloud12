/**
 * تتبع pipeline الصوت — دليل من الجهاز لا تخمين.
 * يُفعَّل بـ ?voiceDebug=1 أو ?debug=1 أو localStorage.tafriz_voice_debug=1
 */

export type VoiceDebugEntry = {
  at: number;
  source: "app-voice" | "plate-speech" | "record" | "check";
  /** النص الذي ظهر للمستخدم (interim UI) */
  displayed?: string;
  raw?: string;
  finalSpeech?: string;
  normalized?: string;
  intent?: string;
  execution?: string;
  error?: string;
  locale?: string;
  speechApi?: string;
  isFinal?: boolean;
  phase?: string;
};

const KEY = "tafriz_voice_debug";
const MAX = 50;
let entries: VoiceDebugEntry[] = [];
const listeners = new Set<() => void>();

export function isVoiceDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("voiceDebug") === "1" || q.get("debug") === "1") return true;
    if (window.localStorage.getItem(KEY) === "1") return true;
  } catch {
    // ignore
  }
  return false;
}

export function enableVoiceDebug(): void {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // ignore
  }
}

export function pushVoiceDebug(entry: Omit<VoiceDebugEntry, "at"> & { at?: number }): void {
  if (!isVoiceDebugEnabled()) return;
  entries = [{ at: entry.at ?? Date.now(), ...entry }, ...entries].slice(0, MAX);
  listeners.forEach((l) => l());
}

export function getVoiceDebugEntries(): VoiceDebugEntry[] {
  return entries;
}

export function clearVoiceDebug(): void {
  entries = [];
  listeners.forEach((l) => l());
}

export function subscribeVoiceDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function formatVoiceDebugText(): string {
  const lines = ["=== Tafriz Voice Debug ==="];
  for (const r of entries) {
    lines.push("---");
    lines.push(`time: ${new Date(r.at).toISOString()}`);
    lines.push(`source: ${r.source}`);
    if (r.phase) lines.push(`phase: ${r.phase}`);
    if (r.displayed != null) lines.push(`DISPLAYED: ${r.displayed}`);
    if (r.raw != null) lines.push(`RAW SPEECH: ${r.raw}`);
    if (r.finalSpeech != null) lines.push(`FINAL SPEECH: ${r.finalSpeech}`);
    else if (r.isFinal === false) lines.push(`FINAL SPEECH: (empty / not final)`);
    if (r.normalized != null) lines.push(`NORMALIZED: ${r.normalized}`);
    if (r.intent != null) lines.push(`DETECTED INTENT: ${r.intent}`);
    if (r.execution != null) lines.push(`EXECUTION RESULT: ${r.execution}`);
    if (r.error != null) lines.push(`ERROR: ${r.error}`);
    if (r.locale != null) lines.push(`LOCALE: ${r.locale}`);
    if (r.speechApi != null) lines.push(`SELECTED SPEECH API: ${r.speechApi}`);
    if (r.isFinal != null) lines.push(`isFinal: ${r.isFinal}`);
  }
  return lines.join("\n");
}
