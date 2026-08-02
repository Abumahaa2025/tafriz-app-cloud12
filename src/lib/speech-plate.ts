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

type SpeechAlt = { transcript: string; confidence?: number };

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<
    {
      isFinal: boolean;
      length: number;
      [index: number]: SpeechAlt;
    } & { 0: SpeechAlt }
  >;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const DIGIT_WORDS: Record<string, string> = {
  صفر: "0",
  زيرو: "0",
  واحد: "1",
  واحدة: "1",
  وحد: "1",
  اثنين: "2",
  اثنان: "2",
  اثنتين: "2",
  اتنين: "2",
  ثنين: "2",
  ثلاثة: "3",
  تلاتة: "3",
  تلاته: "3",
  اربعه: "4",
  أربعة: "4",
  اربعة: "4",
  اربع: "4",
  خمسه: "5",
  خمسة: "5",
  خمس: "5",
  سته: "6",
  ستة: "6",
  ست: "6",
  سبعه: "7",
  سبعة: "7",
  سبع: "7",
  ثمانيه: "8",
  ثمانية: "8",
  ثمان: "8",
  تمنيه: "8",
  تسعه: "9",
  تسعة: "9",
  تسع: "9",
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

const SKIP_WORDS = new Set([
  "حرف",
  "الحرف",
  "letter",
  "plates",
  "plate",
  "لوحة",
  "اللوحة",
  "رقم",
  "الرقم",
  "وش",
  "وشه",
  "يعني",
  "لوحه",
  "اللوحه",
  "تشييك",
  "تشيك",
  "check",
]);

function toWesternDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString())
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d).toString());
}

function resolveSpokenPart(part: string): string | null {
  let p = part.trim();
  if (!p || SKIP_WORDS.has(p.toLowerCase())) return null;
  if (p.startsWith("ال") && p.length > 2) p = p.slice(2);
  if (DIGIT_WORDS[p] != null) return DIGIT_WORDS[p];
  if (LETTER_WORDS[p] != null) return LETTER_WORDS[p];
  const lower = p.toLowerCase();
  if (LETTER_WORDS[lower] != null) return LETTER_WORDS[lower];
  // أرقام ملتصقة أو حروف+أرقام كما نطقها المحرك
  if (/^[\u0600-\u06FFa-zA-Z0-9]+$/.test(p)) return toWesternDigits(p);
  return null;
}

export function speechToPlateCandidate(raw: string): string {
  const candidates = speechToPlateCandidates(raw);
  return candidates[0] ?? "";
}

/** عدة مرشحات من نفس النطق لرفع نسبة الإصابة */
export function speechToPlateCandidates(raw: string): string[] {
  let text = toWesternDigits(String(raw ?? "").trim());
  if (!text) return [];

  const out = new Set<string>();

  const parts = text.split(/[\s,./\\|_-]+/).map((p) => p.trim()).filter(Boolean);
  let built = "";
  for (const part of parts) {
    const resolved = resolveSpokenPart(part);
    if (resolved != null) built += resolved;
  }
  if (built) out.add(normalizePlate(built) || built);

  // أي تسلسل أرقام واضح داخل الجملة
  for (const m of text.matchAll(/\d{2,8}/g)) {
    out.add(m[0]);
  }

  // حروف عربية مفردة مذكورة
  let letters = "";
  for (const part of parts) {
    const r = resolveSpokenPart(part);
    if (r && /^[\u0600-\u06FFa-zA-Z]$/.test(r)) letters += r;
  }
  if (letters) out.add(letters);

  // تنظيف خام كاحتياطي
  const stripped = text.replace(/[^\u0600-\u06FF0-9a-zA-Z]/g, "");
  if (stripped) out.add(normalizePlate(stripped) || stripped);

  // رقم + حروف ملتصقة إن وُجدت
  for (const m of text.matchAll(/\d{2,8}[\u0600-\u06FFa-zA-Z]{1,3}|[\u0600-\u06FFa-zA-Z]{1,3}\d{2,8}/g)) {
    out.add(normalizePlate(m[0]) || m[0]);
  }

  return [...out].filter(Boolean);
}

export function isSpeechRecognitionSupported(): boolean {
  return typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function startPlateSpeech(opts: {
  onFinal: (transcript: string, candidates: string[]) => void;
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
  rec.maxAlternatives = 5;
  let stopped = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  rec.onresult = (ev) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const result = ev.results[i];
      if (result.isFinal) {
        const transcripts: string[] = [];
        const n = Math.max(1, result.length || 1);
        for (let a = 0; a < n; a++) {
          const t = result[a]?.transcript?.trim();
          if (t) transcripts.push(t);
        }
        if (transcripts.length === 0) continue;
        const candidates = new Set<string>();
        for (const t of transcripts) {
          for (const c of speechToPlateCandidates(t)) candidates.add(c);
        }
        opts.onFinal(transcripts[0], [...candidates]);
      } else {
        interim += result[0]?.transcript ?? "";
      }
    }
    if (interim) opts.onInterim?.(interim);
  };

  rec.onerror = (ev) => {
    // لا نوقف الجلسة على أخطاء مؤقتة شائعة
    if (ev.error === "aborted" || ev.error === "no-speech" || ev.error === "audio-capture") {
      return;
    }
    if (ev.error === "network") {
      opts.onError?.("التعرف الصوتي يحتاج اتصال إنترنت — أعد المحاولة");
      return;
    }
    opts.onError?.(
      ev.error === "not-allowed"
        ? "يرجى السماح باستخدام الميكروفون"
        : `خطأ في التعرف الصوتي: ${ev.error}`
    );
  };

  rec.onend = () => {
    if (stopped) {
      opts.onEnd?.();
      return;
    }
    // إعادة تشغيل سلسة بدل انقطاع الجلسة
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      if (stopped) return;
      try {
        rec.start();
      } catch {
        opts.onEnd?.();
      }
    }, 250);
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
      if (restartTimer) clearTimeout(restartTimer);
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
