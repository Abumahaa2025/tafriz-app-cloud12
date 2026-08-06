/**
 * الرمز الشخصي لكل مستخدم — يُشتق على الخادم فقط.
 *
 * الاشتقاق السابق كان `FNV-1a(userId) % 1e6` داخل `src/lib/personal-code.ts`،
 * وهذا الملف يصل للمتصفح داخل حزمة الجافاسكربت. أي مستخدم "قيد المراجعة" كان
 * يقدر يقرأ معرّف حسابه من جلسته، يطبّق الخوارزمية المنشورة، ويفعّل حسابه
 * بنفسه بدون موافقة الإدارة — أي تجاوز كامل لبوابة الموافقة.
 *
 * الآن الرمز = HMAC-SHA256 بسرّ لا يخرج من الخادم أبدًا، فلا يمكن اشتقاقه من
 * معرّف الحساب وحده. المالك يقرأه من إدارة التحكم (عبر access-control) ويرسله
 * للمستخدم كما كان.
 */
import { createHmac } from "node:crypto";

/**
 * سرّ الاشتقاق. `PERSONAL_CODE_SECRET` إن وُجد، وإلا مفتاح service role — وهو
 * موجود على الخادم أصلًا لأن كل مسارات الإدارة تعتمد عليه، فلا يحتاج المشغّل
 * إضافة متغيّر جديد لتفعيل هذا الإصلاح.
 */
function secret(): string | undefined {
  return (
    process.env.PERSONAL_CODE_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    undefined
  );
}

/** يرجع الرمز، أو null إن لم يتوفّر سرّ على الخادم. */
export function serverPersonalCode(userId: string): string | null {
  const key = secret();
  if (!key) return null;
  const digest = createHmac("sha256", key).update(`personal-code:${userId}`).digest();
  // أول 4 بايتات كعدد صحيح غير موقّع ثم 6 خانات — نفس شكل TFZ-U-XXXXXX السابق
  const n = digest.readUInt32BE(0) % 1_000_000;
  return `TFZ-U-${String(n).padStart(6, "0")}`;
}

/** مقارنة بزمن ثابت لتفادي تسريب الرمز عبر فروق التوقيت. */
export function personalCodeMatches(userId: string, candidate: string): boolean {
  const expected = serverPersonalCode(userId);
  if (!expected || expected.length !== candidate.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ candidate.charCodeAt(i);
  }
  return diff === 0;
}
