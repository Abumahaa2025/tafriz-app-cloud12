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
  // إزالة التطويل والتشكيل الشائع من النطق (هـ → ه)
  p = p.replace(/ـ/g, "").replace(/[\u064B-\u065F\u0670]/g, "");
  p = p.replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
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

/** يستخرج مقاطع اللوحة بالترتيب المنطوق (12 ثم 35 → ["12","35"] وليس العكس) */
export function extractOrderedPlateParts(raw: string): string[] {
  const text = toWesternDigits(String(raw ?? "").trim());
  if (!text) return [];
  const parts = text.split(/[\s,./\\|_+-]+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const resolved = resolveSpokenPart(part);
    if (resolved != null) out.push(resolved);
  }
  if (out.length === 0) {
    const m = text.match(/\d{1,8}/g);
    if (m) return m;
  }
  return out;
}

/** يستخرج تسلسل أرقام/حروف اللوحة من النطق دون كلمات الجملة */
export function speechToPlateToken(raw: string): string {
  const parts = extractOrderedPlateParts(raw);
  const built = parts.join("");
  return normalizePlate(built) || built;
}

export function speechToPlateCandidate(raw: string): string {
  const candidates = speechToPlateCandidates(raw);
  return candidates[0] ?? "";
}

/** مرشحات للبحث — المجموع بالترتيب المنطوق أولًا (بدون مقاطع قصيرة منفصلة تربك المطابقة) */
export function speechToPlateCandidates(raw: string): string[] {
  const text = toWesternDigits(String(raw ?? "").trim());
  if (!text) return [];

  const out = new Set<string>();
  const parts = extractOrderedPlateParts(text);
  const joined = parts.join("");
  if (joined) out.add(normalizePlate(joined) || joined);

  let letters = "";
  for (const p of parts) {
    if (/^[\u0600-\u06FFa-zA-Z]$/.test(p)) letters += p;
  }
  if (letters) out.add(letters);

  for (const m of text.matchAll(/\d{2,8}[\u0600-\u06FFa-zA-Z]{1,3}|[\u0600-\u06FFa-zA-Z]{1,3}\d{2,8}/g)) {
    out.add(normalizePlate(m[0]) || m[0]);
  }

  return rankPlateCandidates([...out]);
}

const VOICE_COMMIT_MS = 1200;
/** انتظار قصير بعد آخر مقطع قبل اعتماد الأمر (حرفًا حرفًا) */
const VOICE_COMMIT_ASSEMBLE_MS = 1500;
const DEFAULT_SESSION_MAX_MS = 16000;

function isVoiceCommitReady(token: string): boolean {
  if (!token) return false;
  const digits = (token.match(/\d/g) || []).length;
  const letters = (token.match(/[\u0600-\u06FFa-zA-Z]/g) || []).length;
  // رقم كافٍ وحده، أو حرفان فأكثر، أو حرف + رقم
  if (digits >= 3) return true;
  if (letters >= 2) return true;
  if (digits >= 1 && letters >= 1) return true;
  return false;
}

function commitDelayForToken(token: string): number {
  if (!token) return VOICE_COMMIT_MS;
  const hasDigit = /\d/.test(token);
  return hasDigit ? VOICE_COMMIT_MS : VOICE_COMMIT_ASSEMBLE_MS;
}

/** يجمّع المقاطع بالترتيب: س ثم ه ثم ص ثم 5613 → سهص5613 */
export function createSpeechPlateBuffer() {
  let chunks: string[] = [];
  return {
    reset() {
      chunks = [];
    },
    get value() {
      return chunks.join("");
    },
    get chunks() {
      return [...chunks];
    },
    ingest(transcripts: string[]): string[] {
      for (const t of transcripts) {
        const parts = extractOrderedPlateParts(t);
        if (parts.length === 0) continue;
        const token = parts.join("");
        const joined = chunks.join("");

        if (!joined) {
          chunks = [...parts];
        } else if (token.startsWith(joined) && token.length > joined.length) {
          // إعادة نطق الرقم كاملًا أطول
          chunks = [token];
        } else if (joined.startsWith(token) && joined.length > token.length) {
          // تكرار لبادئة — تجاهل
        } else if (joined.endsWith(token) && token.length > 1) {
          // تكرار لنفس المقطع — تجاهل
        } else if (token === joined) {
          // تكرار كامل — تجاهل
        } else {
          // ألحق بالترتيب المنطوق (الأول فالأول)
          for (const p of parts) {
            if (chunks.length && chunks[chunks.length - 1] === p) continue;
            // لا تُلحق حرفًا مكررًا إذا كان المخزن حروفًا فقط وانتهى بنفس الحرف
            if (
              chunks.length &&
              /^[\u0600-\u06FFa-zA-Z]$/.test(p) &&
              chunks[chunks.length - 1] === p
            ) {
              continue;
            }
            chunks.push(p);
          }
        }
      }
      const buffer = chunks.join("");
      return buffer ? [normalizePlate(buffer) || buffer] : [];
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
  /**
   * أمر واحد: يستمع حتى نتيجة/انتهاء الجلسة ثم يتوقف (لا يبقى مفتوحًا).
   * continuous: يستمر بإعادة التشغيل حتى يُستدعى stop().
   */
  mode?: "command" | "continuous";
  /** أقصى مدة للاستماع في وضع الأمر الواحد */
  maxSessionMs?: number;
}): { stop: () => void } | null {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) {
    opts.onError?.("المتصفح لا يدعم التعرف الصوتي");
    return null;
  }
  const commandMode = (opts.mode ?? "command") === "command";
  const rec = new Ctor();
  rec.lang = "ar-SA";
  // أثناء الجلسة نجمع حرفًا حرفًا؛ الإيقاف يتم بعد اعتماد الأمر
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 5;
  let stopped = false;
  let finished = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let commitTimer: ReturnType<typeof setTimeout> | null = null;
  let sessionTimer: ReturnType<typeof setTimeout> | null = null;
  const plateBuf = createSpeechPlateBuffer();

  const finishSession = () => {
    if (finished) return;
    finished = true;
    stopped = true;
    plateBuf.reset();
    if (commitTimer) clearTimeout(commitTimer);
    if (restartTimer) clearTimeout(restartTimer);
    if (sessionTimer) clearTimeout(sessionTimer);
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
    opts.onEnd?.();
  };

  rec.onresult = (ev) => {
    if (stopped) return;
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
        const ranked = plateBuf.ingest(transcripts);
        const display = plateBuf.value ? plateBuf.chunks.join(" ") : transcripts[0];
        if (display) opts.onInterim?.(display);
        if (commitTimer) clearTimeout(commitTimer);
        const heard = transcripts[0];
        const tokenNow = plateBuf.value;
        // لا تعتمد الأمر قبل اكتمال مقاطع كافية (يمنع إغلاق الجلسة بعد حرف واحد)
        if (!isVoiceCommitReady(tokenNow)) continue;
        commitTimer = setTimeout(() => {
          if (stopped) return;
          const finalCandidates = plateBuf.value
            ? [normalizePlate(plateBuf.value) || plateBuf.value, ...ranked]
            : ranked;
          const unique = [...new Set(finalCandidates.filter(Boolean))];
          opts.onFinal(heard, unique);
          if (commandMode) finishSession();
        }, commitDelayForToken(tokenNow));
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
      if (commandMode) finishSession();
      return;
    }
    opts.onError?.(
      ev.error === "not-allowed"
        ? "يرجى السماح باستخدام الميكروفون"
        : `خطأ في التعرف الصوتي: ${ev.error}`
    );
    if (commandMode) finishSession();
  };

  rec.onend = () => {
    if (stopped || finished) {
      if (!finished) opts.onEnd?.();
      return;
    }
    // أعد التشغيل فقط أثناء جلسة الأمر لجمع بقية الحروف
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      if (stopped || finished) return;
      try {
        rec.start();
      } catch {
        finishSession();
      }
    }, 200);
  };

  try {
    rec.start();
  } catch {
    opts.onError?.("تعذّر بدء التعرف الصوتي");
    return null;
  }

  if (commandMode) {
    sessionTimer = setTimeout(() => {
      if (stopped || finished) return;
      // إن وُجد مخزن جاهز اعتمده قبل الإغلاق
      if (isVoiceCommitReady(plateBuf.value)) {
        const unique = [normalizePlate(plateBuf.value) || plateBuf.value];
        opts.onFinal(plateBuf.value, unique);
      }
      finishSession();
    }, opts.maxSessionMs ?? DEFAULT_SESSION_MAX_MS);
  }

  return {
    stop: () => {
      finishSession();
    },
  };
}
