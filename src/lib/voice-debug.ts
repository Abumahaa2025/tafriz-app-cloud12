/**
 * تتبع مؤقت لـ pipeline الصوت (تشخيص Android/Huawei).
 * يُفعَّل بـ ?voiceDebug=1 أو localStorage.tafriz_voice_debug=1
 */

export type VoiceDebugEntry = {
  at: number;
  source: "app-voice" | "plate-speech" | "record" | "check";
  raw?: string;
  finalSpeech?: string;
  normalized?: string;
  intent?: string;
  execution?: string;
};

const KEY = "tafriz_voice_debug";
const MAX = 40;
let entries: VoiceDebugEntry[] = [];
const listeners = new Set<() => void>();

export function isVoiceDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("voiceDebug") === "1") return true;
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
