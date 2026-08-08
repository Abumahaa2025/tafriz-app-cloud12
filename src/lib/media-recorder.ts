/**
 * توافق MediaRecorder عبر Chromium (Android/Desktop) و Safari/iOS.
 *
 * Safari لا يدعم audio/webm؛ يفضّل audio/mp4. Chromium يدعم webm أولًا.
 * لا تُفرض webm بعد التسجيل — نوع الـ Blob يجب أن يطابق ما سجّله المتصفح فعلًا.
 */

/** ترتيب التفضيل: webm أولًا لسلوك Android/Chrome الحالي، ثم mp4 لـ Safari/iOS. */
const AUDIO_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/aac",
  "audio/ogg;codecs=opus",
] as const;

export function isAudioRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export function pickSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }
  for (const mime of AUDIO_MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // تجاهل أنواع يرفضها المتصفح أثناء الفحص
    }
  }
  return "";
}

export function createAudioMediaRecorder(stream: MediaStream): {
  recorder: MediaRecorder;
  mimeType: string;
} {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder unsupported");
  }
  const mimeType = pickSupportedAudioMimeType();
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
  // بعد الإنشاء قد يملأ المتصفح mimeType الفعلي حتى لو مرّرنا سلسلة فارغة
  return { recorder, mimeType: recorder.mimeType || mimeType || "" };
}

/** يستنتج نوع الصوت الحقيقي من القطع، مع الرجوع للنوع المختار عند الإنشاء. */
export function resolveRecordedAudioType(chunks: Blob[], preferredMime = ""): string {
  for (const chunk of chunks) {
    if (chunk.size > 0 && chunk.type) return chunk.type;
  }
  if (preferredMime) return preferredMime.split(";")[0] || preferredMime;
  return "audio/mp4";
}

export function buildRecordedAudioBlob(chunks: Blob[], preferredMime = ""): Blob {
  const usable = chunks.filter((c) => c && c.size > 0);
  const type = resolveRecordedAudioType(usable, preferredMime);
  return new Blob(usable, { type });
}
