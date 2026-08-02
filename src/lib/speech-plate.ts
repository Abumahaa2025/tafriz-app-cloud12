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
  zero: "0",
  واحد: "1",
  واحدة: "1",
  وحد: "1",
  one: "1",
  اثنين: "2",
  اثنان: "2",
  اثنتين: "2",
  اتنين: "2",
  ثنين: "2",
  ثنينه: "2",
  two: "2",
  ثلاثة: "3",
  تلاتة: "3",
  تلاته: "3",
  ثلاث: "3",
  three: "3",
  اربعه: "4",
  أربعة: "4",
  اربعة: "4",
  اربع: "4",
  اربعهه: "4",
  four: "4",
  خمسه: "5",
  خمسة: "5",
  خمس: "5",
  five: "5",
  سته: "6",
  ستة: "6",
  ست: "6",
  six: "6",
  سبعه: "7",
  سبعة: "7",
  سبع: "7",
  seven: "7",
  ثمانيه: "8",
  ثمانية: "8",
  ثمان: "8",
  تمنيه: "8",
  تمانية: "8",
  eight: "8",
  تسعه: "9",
  تسعة: "9",
  تسع: "9",
  nine: "9",
};

const LETTER_WORDS: Record<string, string> = {
  الف: "ا",
  ألف: "ا",
  الفاء: "ا",
  الفا: "ا",
  الفه: "ا",
  اليف: "ا",
  باء: "ب",
  با: "ب",
  بيه: "ب",
  بي: "ب",
  تاء: "ت",
  تا: "ت",
  ثاء: "ث",
  ثا: "ث",
  جيم: "ج",
  الجيم: "ج",
  جي: "ج",
  جيه: "ج",
  jeem: "ج",
  حاء: "ح",
  حا: "ح",
  خاء: "خ",
  خا: "خ",
  دال: "د",
  دالال: "د",
  دا: "د",
  ذال: "ذ",
  ذا: "ذ",
  راء: "ر",
  را: "ر",
  ره: "ر",
  زاي: "ز",
  زين: "ز",
  زا: "ز",
  سين: "س",
  سينن: "س",
  شين: "ش",
  صاد: "ص",
  صادد: "ص",
  ضاد: "ض",
  طاء: "ط",
  طا: "ط",
  ظاء: "ظ",
  ظا: "ظ",
  عين: "ع",
  غين: "غ",
  فاء: "ف",
  فا: "ف",
  قاف: "ق",
  قا: "ق",
  كاف: "ك",
  كا: "ك",
  لام: "ل",
  لا: "ل",
  ميم: "م",
  ميمم: "م",
  نون: "ن",
  نو: "ن",
  هاء: "ه",
  ها: "ه",
  واو: "و",
  وا: "و",
  ياء: "ي",
  يا: "ي",
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
  "فحص",
  "الفحص",
  "و",
  "ثم",
  "بعدين",
  "بعد",
  "كذا",
]);

function toWesternDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString())
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d).toString());
}

function stripAl(p: string): string {
  if (p.startsWith("ال") && p.length > 2) return p.slice(2);
  return p;
}

/** يحوّل مقطعًا منطوقًا إلى رقم/حرف لوحة فقط — يرفض الكلمات الطويلة الغلط */
function resolveSpokenPart(part: string): string | null {
  let p = part.trim();
  if (!p) return null;
  const lower = p.toLowerCase();
  if (SKIP_WORDS.has(p) || SKIP_WORDS.has(lower)) return null;

  p = stripAl(p);
  if (DIGIT_WORDS[p] != null) return DIGIT_WORDS[p];
  if (LETTER_WORDS[p] != null) return LETTER_WORDS[p];
  if (LETTER_WORDS[lower] != null) return LETTER_WORDS[lower];
  if (DIGIT_WORDS[lower] != null) return DIGIT_WORDS[lower];

  const western = toWesternDigits(p);

  // رقم صريح
  if (/^\d{1,8}$/.test(western)) return western;

  // حرف مفرد عربي/إنجليزي
  if (/^[\u0600-\u06FFa-zA-Z]$/.test(p)) return p;

  // كتلة لوحة قصيرة أرقام+حروف لاتينية فقط (بدون كلمات عربية طويلة)
  if (/^[0-9a-zA-Z]{1,8}$/.test(western)) return western;

  // كتلة حروف عربية قصيرة للوحة (1–3) وليست كلمة معروفة طويلة
  if (/^[\u0600-\u06FF]{1,3}$/.test(p)) return p;

  return null;
}

function rankPlateCandidates(list: string[]): string[] {
  return [...new Set(list.filter(Boolean))].sort((a, b) => {
    const score = (s: string) => {
      const digits = (s.match(/\d/g) || []).length;
      const letters = (s.match(/[\u0600-\u06FFa-zA-Z]/g) || []).length;
      return s.length * 10 + digits * 3 + letters * 2;
    };
    return score(b) - score(a);
  });
}

/** يستخرج تسلسل أرقام/حروف اللوحة من النطق دون كلمات الجملة */
export function speechToPlateToken(raw: string): string {
  const text = toWesternDigits(String(raw ?? "").trim());
  if (!text) return "";
  const parts = text.split(/[\s,./\\|_+-]+/).map((p) => p.trim()).filter(Boolean);
  let built = "";
  for (const part of parts) {
    const resolved = resolveSpokenPart(part);
    if (resolved != null) built += resolved;
  }
  // أرقام ملتصقة ظاهرة حتى لو باقي الجملة ضوضاء
  if (!built) {
    const m = text.match(/\d{1,8}/g);
    if (m) built = m.join("");
  }
  return normalizePlate(built) || built;
}

export function speechToPlateCandidate(raw: string): string {
  const candidates = speechToPlateCandidates(raw);
  return candidates[0] ?? "";
}

/** عدة مرشحات من نفس النطق — الأطول/الأدق أولًا */
export function speechToPlateCandidates(raw: string): string[] {
  const text = toWesternDigits(String(raw ?? "").trim());
  if (!text) return [];

  const out = new Set<string>();
  const token = speechToPlateToken(text);
  if (token) out.add(token);

  const parts = text.split(/[\s,./\\|_+-]+/).map((p) => p.trim()).filter(Boolean);

  for (const m of text.matchAll(/\d{2,8}/g)) {
    out.add(m[0]);
  }

  let letters = "";
  for (const part of parts) {
    const r = resolveSpokenPart(part);
    if (r && /^[\u0600-\u06FFa-zA-Z]$/.test(r)) letters += r;
  }
  if (letters) out.add(letters);

  for (const m of text.matchAll(/\d{2,8}[\u0600-\u06FFa-zA-Z]{1,3}|[\u0600-\u06FFa-zA-Z]{1,3}\d{2,8}/g)) {
    out.add(normalizePlate(m[0]) || m[0]);
  }

  return rankPlateCandidates([...out]);
}

/** يجمّع مقاطع الصوت المتتالية (١٢ ثم ٣٤ → ١٢٣٤) بدل مطابقة أول مقطع غلط */
export function createSpeechPlateBuffer() {
  let buffer = "";
  return {
    reset() {
      buffer = "";
    },
    get value() {
      return buffer;
    },
    ingest(transcripts: string[]): string[] {
      const chunkSet = new Set<string>();
      for (const t of transcripts) {
        const token = speechToPlateToken(t);
        if (token) {
          if (!buffer) {
            buffer = token;
          } else if (token.startsWith(buffer) && token.length > buffer.length) {
            // المحرك أعاد المقطع كاملًا أطول من المخزن
            buffer = token;
          } else if (buffer.startsWith(token) && buffer.length >= token.length) {
            // تكرار لنفس المقطع أو جزء منه — تجاهل
          } else if (buffer.endsWith(token) && token.length > 1) {
            // نفس المقطع أُعيد — تجاهل
          } else {
            buffer += token;
          }
        }
        for (const c of speechToPlateCandidates(t)) chunkSet.add(c);
      }
      const all = new Set<string>();
      if (buffer) all.add(buffer);
      for (const c of chunkSet) all.add(c);
      return rankPlateCandidates([...all]);
    },
  };
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
  const plateBuf = createSpeechPlateBuffer();

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
        // بديل أساسي فقط للمخزن لتفادي تكرار نفس الرقم من البدائل
        const ranked = plateBuf.ingest([transcripts[0]]);
        // أضف مرشحات باقي البدائل بدون مضاعفة المخزن
        const extra = new Set(ranked);
        for (let a = 1; a < transcripts.length; a++) {
          for (const c of speechToPlateCandidates(transcripts[a])) extra.add(c);
        }
        opts.onFinal(transcripts[0], rankPlateCandidates([...extra]));
      } else {
        interim += result[0]?.transcript ?? "";
      }
    }
    if (interim) opts.onInterim?.(interim);
  };

  rec.onerror = (ev) => {
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
      plateBuf.reset();
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
