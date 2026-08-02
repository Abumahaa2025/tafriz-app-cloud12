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
  باء: "ب",
  تاء: "ت",
  ثاء: "ث",
  جيم: "ج",
  حاء: "ح",
  خاء: "خ",
  دال: "د",
  ذال: "ذ",
  راء: "ر",
  را: "ر",
  زاي: "ز",
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
};

export function speechToPlateCandidate(raw: string): string {
  let text = String(raw ?? "").trim();
  if (!text) return "";
  text = text.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString());
  text = text.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d).toString());
  const parts = text.split(/[\s,./\\|_-]+/).map((p) => p.trim()).filter(Boolean);
  let out = "";
  for (const part of parts) {
    if (DIGIT_WORDS[part] != null) {
      out += DIGIT_WORDS[part];
      continue;
    }
    if (LETTER_WORDS[part] != null) {
      out += LETTER_WORDS[part];
      continue;
    }
    if (/^[\u0600-\u06FFa-zA-Z0-9]+$/.test(part)) out += part;
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
  rec.maxAlternatives = 1;
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
