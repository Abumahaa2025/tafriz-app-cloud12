import { normalizePlate } from "./normalize";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const DIGIT_WORDS: Record<string, string> = {
  صفر: "0",
  واحد: "1",
  واحدة: "1",
  اثنين: "2",
  اثنان: "2",
  ثلاثة: "3",
  اربعه: "4",
  أربعة: "4",
  اربعة: "4",
  خمسه: "5",
  خمسة: "5",
  سته: "6",
  ستة: "6",
  سبعه: "7",
  سبعة: "7",
  ثمانيه: "8",
  ثمانية: "8",
  تسعه: "9",
  تسعة: "9",
};

const LETTER_WORDS: Record<string, string> = {
  الف: "ا",
  ألف: "ا",
  الفاء: "ا",
  باء: "ب",
  بي: "ب",
  تاء: "ت",
  ثاء: "ث",
  جيم: "ج",
  جي: "ج",
  حاء: "ح",
  خاء: "خ",
  دال: "د",
  ذال: "ذ",
  راء: "ر",
  را: "ر",
  زاي: "ز",
  زين: "ز",
  سين: "س",
  شين: "ش",
  صاد: "ص",
  ضاد: "ض",
  طاء: "ط",
  ظاء: "ظ",
  عين: "ع",
  غين: "غ",
  فاء: "ف",
  قاف: "ق",
  كاف: "ك",
  لام: "ل",
  ميم: "م",
  نون: "ن",
  هاء: "ه",
  واو: "و",
  ياء: "ي",
  // أسماء أحرف إنجليزية شائعة من التعرف الصوتي
  a: "a",
  ay: "a",
  aye: "a",
  ei: "a",
  b: "b",
  be: "b",
  bee: "b",
  c: "c",
  see: "c",
  sea: "c",
  d: "d",
  dee: "d",
  e: "e",
  ee: "e",
  f: "f",
  ef: "f",
  g: "g",
  gee: "g",
  jee: "g",
  h: "h",
  aitch: "h",
  i: "i",
  eye: "i",
  j: "j",
  jay: "j",
  k: "k",
  kay: "k",
  l: "l",
  el: "l",
  ell: "l",
  m: "m",
  em: "m",
  n: "n",
  en: "n",
  o: "o",
  oh: "o",
  p: "p",
  pee: "p",
  q: "q",
  queue: "q",
  cue: "q",
  r: "r",
  ar: "r",
  are: "r",
  s: "s",
  ess: "s",
  t: "t",
  tee: "t",
  u: "u",
  you: "u",
  v: "v",
  vee: "v",
  w: "w",
  doubleu: "w",
  x: "x",
  ex: "x",
  y: "y",
  why: "y",
  z: "z",
  zee: "z",
  zed: "z",
};

const SKIP_WORDS = new Set(["حرف", "الحرف", "letter", "plates", "plate", "لوحة", "اللوحة"]);

function resolveSpokenPart(part: string): string | null {
  let p = part.trim();
  if (!p || SKIP_WORDS.has(p.toLowerCase())) return null;
  // "الجيم" / "الراء"
  if (p.startsWith("ال") && p.length > 2) p = p.slice(2);
  if (DIGIT_WORDS[p] != null) return DIGIT_WORDS[p];
  if (LETTER_WORDS[p] != null) return LETTER_WORDS[p];
  const lower = p.toLowerCase();
  if (LETTER_WORDS[lower] != null) return LETTER_WORDS[lower];
  if (/^[\u0600-\u06FFa-zA-Z0-9]+$/.test(p)) return p;
  return null;
}

export function speechToPlateCandidate(raw: string): string {
  let text = String(raw ?? "").trim();
  if (!text) return "";
  text = text.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString());
  text = text.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d).toString());
  const parts = text.split(/[\s,./\\|_-]+/).map((p) => p.trim()).filter(Boolean);
  let out = "";
  for (const part of parts) {
    const resolved = resolveSpokenPart(part);
    if (resolved != null) out += resolved;
  }
  if (!normalizePlate(out)) {
    out = text.replace(/[^\u0600-\u06FF0-9a-zA-Z]/g, "");
  }
  return out;
}

export function isSpeechRecognitionSupported(): boolean {
  return typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function startPlateSpeech(opts: {
  onFinal: (transcript: string, plateCandidate: string) => void;
  onInterim?: (transcript: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
}): { stop: () => void } | null {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) {
    opts.onError?.("المتصفح لا يدعم التعرف الصوتي");
    return null;
  }
  const rec = new Ctor();
  rec.lang = "ar-SA";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 3;
  let stopped = false;
  rec.onresult = (ev) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const piece = ev.results[i][0]?.transcript ?? "";
      if (ev.results[i].isFinal) {
        opts.onFinal(piece, speechToPlateCandidate(piece));
      } else {
        interim += piece;
      }
    }
    if (interim) opts.onInterim?.(interim);
  };
  rec.onerror = (ev) => {
    if (ev.error === "aborted" || ev.error === "no-speech") return;
    opts.onError?.(
      ev.error === "not-allowed"
        ? "يرجى السماح باستخدام الميكروفون"
        : `خطأ في التعرف الصوتي: ${ev.error}`
    );
  };
  rec.onend = () => {
    if (!stopped) {
      try {
        rec.start();
      } catch {
        opts.onEnd?.();
      }
    } else {
      opts.onEnd?.();
    }
  };
  try {
    rec.start();
  } catch {
    opts.onError?.("تعذّر بدء التعرف الصوتي");
    return null;
  }
  return {
    stop: () => {
      stopped = true;
      try {
        rec.onend = null;
        rec.stop();
      } catch {
        try {
          rec.abort();
        } catch {
          // ignore
        }
      }
    },
  };
}
