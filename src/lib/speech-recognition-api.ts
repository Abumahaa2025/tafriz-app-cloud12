/**
 * اكتشاف Web Speech API ومسار أخطاء موحّد.
 * Progressive Enhancement فقط — التطبيق يعمل بدون هذا الـ API.
 */

export type SpeechRecognitionLike = {
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

export type SpeechAlt = { transcript: string; confidence?: number };

export type SpeechRecognitionEventLike = {
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

/** أخطاء تُنهي الجلسة وتمنع حلقة إعادة التشغيل */
const FATAL_SPEECH_ERRORS = new Set([
  "not-allowed",
  "service-not-allowed",
  "network",
  "audio-capture",
  "language-not-supported",
]);

/** أخطاء ناعمة: لا رسالة مزعجة، ويُسمح بإعادة التشغيل عبر onend إن لزم */
const SOFT_SPEECH_ERRORS = new Set(["no-speech", "aborted"]);

export function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionApiSupported(): boolean {
  return !!getSpeechRecognitionCtor();
}

export function selectedSpeechRecognitionApiName(): "SpeechRecognition" | "webkitSpeechRecognition" | null {
  if (typeof window === "undefined") return null;
  if (window.SpeechRecognition) return "SpeechRecognition";
  if (window.webkitSpeechRecognition) return "webkitSpeechRecognition";
  return null;
}

export function isFatalSpeechError(error: string): boolean {
  return FATAL_SPEECH_ERRORS.has(error);
}

export function isSoftSpeechError(error: string): boolean {
  return SOFT_SPEECH_ERRORS.has(error);
}

export function messageForSpeechError(error: string): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "يرجى السماح باستخدام الميكروفون";
    case "audio-capture":
      return "تعذّر الوصول للميكروفون — تأكد من الإذن أو أن الميكروفون غير مستخدم";
    case "network":
      return "التعرف الصوتي يحتاج اتصال إنترنت — أعد المحاولة";
    case "language-not-supported":
      return "التعرف الصوتي العربي غير متاح هنا — استخدم الإدخال اليدوي";
    case "no-speech":
      return "لم يُسمع كلام — أعد المحاولة";
    default:
      return `خطأ في التعرف الصوتي: ${error}`;
  }
}

/** يضبط اللغة بأمان؛ بعض المحركات ترمى عند لغة غير مدعومة */
export function applySpeechLang(rec: SpeechRecognitionLike, lang = "ar-SA"): void {
  try {
    rec.lang = lang;
  } catch {
    // تجاهل — نكمل بأي لغة افتراضية للمتصفح ولا نفترض عربية دائمًا
  }
}

export function safeStopRecognition(rec: SpeechRecognitionLike): void {
  try {
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    rec.stop();
  } catch {
    try {
      rec.abort();
    } catch {
      // ignore
    }
  }
}
