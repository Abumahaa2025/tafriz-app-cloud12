import { speechToPlateCandidates } from "./speech-plate";
import {
  applySpeechLang,
  getSpeechRecognitionCtor,
  isFatalSpeechError,
  isSoftSpeechError,
  isSpeechRecognitionApiSupported,
  messageForSpeechError,
  safeStopRecognition,
  type SpeechRecognitionLike,
} from "./speech-recognition-api";
import { pushVoiceDebug } from "./voice-debug";

export type AppVoiceTab = "sort" | "maps" | "check" | "record";
export type AppVoiceOverlay = "home" | "account" | "privacy" | "database" | "admin" | "ai-scan";

export type AppVoiceAction =
  | { type: "navigate_tab"; tab: AppVoiceTab; label: string }
  | { type: "open_overlay"; target: AppVoiceOverlay; label: string }
  | { type: "plate_check"; candidates: string[]; label: string }
  | { type: "audio_record"; label: string }
  | { type: "help"; label: string };

export function normArVoice(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

/** يفسّر جملة صوتية إلى أمر تنقّل/فحص أقوى من تشيك اللوحات فقط */
export function parseAppVoiceCommand(transcript: string): AppVoiceAction | null {
  const t = normArVoice(transcript);
  // حرف مفرد قد يكون بداية لوحة — لا ترفضه هنا؛ يُعالَج كـ plate عبر المرشحات
  if (!t) return null;

  if (t.length >= 2 && includesAny(t, ["مساعده", "الاوامر", "اوامر", "ماذا تستطيع", "وش تقدر", "help"])) {
    return { type: "help", label: "قائمة الأوامر" };
  }

  if (includesAny(t, ["مسح ذكي", "الذكاء", "اي سكان", "ai scan", "aiscan", "تصوير"])) {
    return { type: "open_overlay", target: "ai-scan", label: "المسح الذكي" };
  }

  if (includesAny(t, ["قاعده البيانات", "قاعدة البيانات", "داتابيس", "database", "البيانات"])) {
    return { type: "open_overlay", target: "database", label: "قاعدة البيانات" };
  }

  if (includesAny(t, ["اداره التحكم", "ادارة التحكم", "الاداره", "الادارة", "ادمن", "admin"])) {
    return { type: "open_overlay", target: "admin", label: "إدارة التحكم" };
  }

  if (includesAny(t, ["الخصوصيه", "الخصوصية", "خصوصيه", "خصوصية", "privacy"])) {
    return { type: "open_overlay", target: "privacy", label: "الخصوصية" };
  }

  if (includesAny(t, ["الحساب", "حسابي", "الملف الشخصي", "حساب", "account"])) {
    return { type: "open_overlay", target: "account", label: "الحساب" };
  }

  if (includesAny(t, ["الرئيسيه", "الرئيسية", "المنزل", "هوم", "home"])) {
    return { type: "open_overlay", target: "home", label: "الصفحة الرئيسية" };
  }

  if (includesAny(t, ["الخرائط", "خريطه", "خريطة", "مابس", "maps", "الخريطه"])) {
    return { type: "navigate_tab", tab: "maps", label: "الخرائط" };
  }

  if (includesAny(t, ["الفرز", "تفريز", "التفريز", "فرز", "sort"])) {
    return { type: "navigate_tab", tab: "sort", label: "الفرز" };
  }

  if (
    includesAny(t, ["سجل صوت", "تسجيل صوت", "بدء تسجيل", "سجل الان", "سجل الآن"]) ||
    (includesAny(t, ["تسجيل"]) && includesAny(t, ["صوت", "صوتي", "مباشر"]))
  ) {
    return { type: "audio_record", label: "تسجيل صوتي" };
  }

  const wantsCheckPage =
    includesAny(t, ["افتح التشيك", "افتح التشييك", "روح للتشيك", "روح للتشييك", "صفحه التشيك", "صفحة التشيك"]) ||
    (includesAny(t, ["تشيك", "تشييك", "check"]) && includesAny(t, ["افتح", "روح", "ودني", "خذني", "صفحة", "صفحه"]));

  if (wantsCheckPage) {
    return { type: "navigate_tab", tab: "check", label: "التشيك" };
  }

  const plateHint = includesAny(t, ["تشيك", "تشييك", "فحص", "لوحه", "لوحة", "رقم", "plate", "check"]);
  const candidates = speechToPlateCandidates(transcript).filter((c) => c.length >= 1);
  if (candidates.length > 0 && (plateHint || /\d{2,}/.test(t) || candidates.some((c) => c.length >= 2))) {
    return {
      type: "plate_check",
      candidates,
      label: "فحص لوحة",
    };
  }

  if (includesAny(t, ["التسجيل", "اوامر صوت", "الأوامر الصوتية", "الاوامر الصوتيه"])) {
    return { type: "navigate_tab", tab: "record", label: "الأوامر الصوتية" };
  }

  if (candidates.some((c) => /\d/.test(c) && c.length >= 2) || (candidates.length > 0 && t.length === 1)) {
    return { type: "plate_check", candidates, label: "فحص لوحة" };
  }

  return null;
}

export function appVoiceHelpText(): string {
  return [
    "قل مثلًا: افتح الفرز — افتح التشيك — افتح الخرائط",
    "أو: قاعدة البيانات — الحساب — المسح الذكي",
    "أو انطق رقم/حروف اللوحة للفحص مباشرة",
    "أو: تسجيل صوت — لبدء تسجيل عادي",
  ].join(" · ");
}

export function isAppVoiceSupported(): boolean {
  return isSpeechRecognitionApiSupported();
}

/** جلسة أوامر صوتية — مع تصفية interim→final عند onend (مهم لـ Huawei/Android) */
export function startAppVoice(opts: {
  onFinal: (transcript: string, alternatives: string[]) => void;
  onInterim?: (transcript: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
}): { stop: () => void } | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    opts.onError?.("المتصفح لا يدعم التعرف الصوتي — استخدم الأزرار للتنقل");
    return null;
  }

  const rec = new Ctor() as SpeechRecognitionLike;
  applySpeechLang(rec, "ar-SA");
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 8;
  let stopped = false;
  let restarting = false;
  /** يمنع تصفية نفس الـ interim مرتين؛ لا يحجب نتائج isFinal التالية */
  let interimFlushed = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let endedNotified = false;
  let pendingInterim = "";

  const notifyEnd = () => {
    if (endedNotified) return;
    endedNotified = true;
    opts.onEnd?.();
  };

  const deliverFinal = (transcript: string, alternatives: string[]) => {
    if (stopped) return;
    const text = transcript.trim();
    if (!text) return;
    pendingInterim = "";
    interimFlushed = true;
    pushVoiceDebug({
      source: "app-voice",
      raw: alternatives.join(" | ") || text,
      finalSpeech: text,
      normalized: normArVoice(text),
    });
    opts.onFinal(text, alternatives.length ? alternatives : [text]);
  };

  const flushInterimIfNeeded = () => {
    if (stopped || interimFlushed) return false;
    const text = pendingInterim.trim();
    if (!text) return false;
    // Android/Huawei: النص يظهر interim ثم تنتهي الجلسة بلا isFinal
    deliverFinal(text, [text]);
    return true;
  };

  const finish = () => {
    if (stopped) {
      notifyEnd();
      return;
    }
    stopped = true;
    restarting = false;
    if (restartTimer) clearTimeout(restartTimer);
    flushInterimIfNeeded();
    safeStopRecognition(rec);
    notifyEnd();
  };

  rec.onresult = (ev) => {
    if (stopped) return;
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const result = ev.results[i];
      if (result.isFinal) {
        const alts: string[] = [];
        const n = Math.max(1, result.length || 1);
        for (let a = 0; a < n; a++) {
          const t = result[a]?.transcript?.trim();
          if (t) alts.push(t);
        }
        if (alts.length) {
          interimFlushed = false;
          deliverFinal(alts[0], alts);
        }
      } else {
        interim += result[0]?.transcript ?? "";
      }
    }
    if (interim) {
      pendingInterim = interim.trim();
      interimFlushed = false;
      pushVoiceDebug({ source: "app-voice", raw: pendingInterim });
      opts.onInterim?.(interim);
    }
  };

  rec.onerror = (ev) => {
    const error = String(ev.error || "");
    if (isSoftSpeechError(error)) {
      return;
    }
    if (isFatalSpeechError(error)) {
      opts.onError?.(messageForSpeechError(error));
      finish();
      return;
    }
    opts.onError?.(messageForSpeechError(error));
    finish();
  };

  rec.onend = () => {
    if (stopped) {
      notifyEnd();
      return;
    }
    // صفّ interim قبل إعادة التشغيل حتى لا يبقى النص معروضًا بلا تنفيذ
    flushInterimIfNeeded();
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      if (stopped || restarting) return;
      restarting = true;
      interimFlushed = false;
      try {
        rec.start();
      } catch {
        finish();
      } finally {
        restarting = false;
      }
    }, 280);
  };

  try {
    rec.start();
  } catch {
    opts.onError?.("تعذّر بدء الأوامر الصوتية — استخدم الأزرار للتنقل");
    finish();
    return null;
  }

  return {
    stop: () => {
      finish();
    },
  };
}
