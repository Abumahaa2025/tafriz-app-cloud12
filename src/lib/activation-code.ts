/**
 * رموز تفعيل ذاتية التحقق — تعمل بين جهازين بدون قاعدة مشتركة.
 * السبب: التخزين المحلي (localStorage) لا يشارك الرموز بين جهاز المالك
 * وجهاز المستخدم، فكان الرمز يظهر "غير صحيح" رغم أنه صحيح عند المالك.
 *
 * الشكل: TFZ-NNNN-CCCC  (NNNN عشوائي، CCCC توقيع يومي)
 * صالح لمدة 7 أيام من يوم التوليد.
 */

const SECRET = "tafriz-act-v1";
const VALID_DAYS = 7;

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

function dayBucket(ms = Date.now()): number {
  return Math.floor(ms / 86_400_000);
}

function checksum(nonce: string, day: number): string {
  const raw = `${SECRET}:${nonce}:${day}`;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return String(Math.abs(h) % 10000).padStart(4, "0");
}

/** تطبيع إدخال المستخدم: أرقام عربية/فارسية، مسافات، حالة الأحرف */
export function normalizeActivationCodeInput(raw: string): string {
  let s = String(raw ?? "").trim().toUpperCase();
  s = s.replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)));
  s = s.replace(/[۰-۹]/g, (d) => String(PERSIAN.indexOf(d)));
  s = s.replace(/[\s_\-–—]+/g, "-");
  s = s.replace(/[^A-Z0-9-]/g, "");
  // لو المستخدم كتب الأرقام فقط بدون البادئة
  if (/^\d{4}$/.test(s)) return `TFZ-${s}`;
  if (/^\d{4}-\d{4}$/.test(s)) return `TFZ-${s}`;
  if (/^TFZ\d{4}$/.test(s)) return `TFZ-${s.slice(3)}`;
  if (/^TFZ\d{4}\d{4}$/.test(s)) return `TFZ-${s.slice(3, 7)}-${s.slice(7)}`;
  return s;
}

export function createSignedActivationCode(): string {
  const nonce = String(1000 + Math.floor(Math.random() * 9000));
  const day = dayBucket();
  return `TFZ-${nonce}-${checksum(nonce, day)}`;
}

export function verifySignedActivationCode(raw: string): boolean {
  const code = normalizeActivationCodeInput(raw);
  const m = /^TFZ-(\d{4})-(\d{4})$/.exec(code);
  if (!m) return false;
  const [, nonce, sig] = m;
  const today = dayBucket();
  for (let i = 0; i <= VALID_DAYS; i++) {
    if (checksum(nonce, today - i) === sig) return true;
  }
  return false;
}
