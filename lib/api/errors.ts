/**
 * ردود أخطاء آمنة للدوال الخادمية في api/.
 *
 * القاعدة: التفاصيل الداخلية تروح للسجل، والمستخدم يشوف نصًا كتبناه نحن.
 *
 * قبل هذا الملف كانت الدوال ترجع `error.message` كما جاء من Postgres أو من
 * Anthropic مباشرة للمتصفح، وهذا يكشف أسماء الجداول والأعمدة والقيود وسياسات
 * RLS ونوع المزوّد الخارجي — كلها معلومات تختصر على المهاجم نصف طريق فهم
 * النظام. الآن يرجع رمز ثابت + رسالة عربية من عندنا + معرّف طلب قصير يربط
 * الرد بسطر السجل الكامل على الخادم.
 *
 * ملاحظة: هذا المجلد خارج api/ عمدًا، لأن Vercel يحوّل كل ملف داخل api/ إلى
 * دالة خادمية، وتوصيتها الرسمية أن يبقى الكود المساعد خارجها.
 */
import { randomUUID } from "node:crypto";
import type { VercelResponse } from "@vercel/node";

/** شكل رد الخطأ. الواجهة تعرض `message` وتتجاهل الباقي. */
export interface FailureBody {
  /** رمز ثابت للآلة — آمن للعرض والتسجيل. */
  error: string;
  /** نص عربي مكتوب في هذا المستودع — لا يأتي أبدًا من قاعدة بيانات أو مزوّد. */
  message: string;
  /** يظهر فقط مع الأخطاء الداخلية، ليطابقه المشغّل مع سجلات Vercel. */
  requestId?: string;
}

const GENERIC_INTERNAL_MESSAGE =
  "حدث خطأ غير متوقع في الخادم. أعد المحاولة، وإن تكرر أرسل رقم الطلب أدناه للإدارة.";

/**
 * أنماط تشبه المفاتيح السرية. نشيلها حتى من سجلات الخادم — سجلات Vercel يقدر
 * يقرأها أي عضو في الفريق، والمفتاح المسرَّب في سجل مفتاح مسرَّب.
 */
const SECRET_PATTERNS: RegExp[] = [
  /\bsb_secret_[A-Za-z0-9_-]+/g,
  /\bsb_publishable_[A-Za-z0-9_-]+/g,
  /\bsbp_[A-Za-z0-9]+/g,
  /\bsk-ant-[A-Za-z0-9_-]+/g,
  /\bAIza[0-9A-Za-z_-]{20,}/g, // Google/Gemini API keys
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, // JWT
  /\bBearer\s+[A-Za-z0-9._-]{16,}/gi,
];

/** يستبدل أي شيء يشبه مفتاحًا بعلامة، قبل الكتابة في السجل. */
export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, "[REDACTED]"), text);
}

/** يحوّل أي قيمة مرمية إلى نص للسجل، بدون كشف بنية الكائنات الغريبة. */
function describeCause(cause: unknown): string {
  if (cause === undefined || cause === null) return "(بدون تفاصيل)";
  if (typeof cause === "string") return cause;
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`;
  if (typeof cause === "object" && "message" in cause) {
    return String((cause as { message: unknown }).message);
  }
  try {
    return JSON.stringify(cause);
  } catch {
    return "(تعذّر وصف الخطأ)";
  }
}

/**
 * يكتب التفاصيل الكاملة في سجل الخادم (Vercel ▸ Logs) ويرجع معرّفًا قصيرًا.
 * هذا هو المكان الوحيد المسموح فيه بالتفاصيل الداخلية.
 */
export function logInternalError(context: string, cause: unknown): string {
  const requestId = randomUUID().slice(0, 8);
  console.error(`[${requestId}] ${context}: ${redactSecrets(describeCause(cause))}`);
  return requestId;
}

/**
 * خطأ سببه المستخدم (تحقّق من المدخلات، صلاحيات، رمز غير صالح…).
 * لا شيء داخلي يُكشف، فما يحتاج سجلًا ولا معرّف طلب.
 */
export function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string
): void {
  res.status(status).json({ error: code, message } satisfies FailureBody);
}

/**
 * فشل نعرف سببه ونبي نعطي المستخدم رسالة مفيدة، لكن التفاصيل الأصلية
 * (نص Postgres مثلًا) تبقى في السجل ولا تنزل للمتصفح.
 */
export function failWithCause(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  context: string,
  cause: unknown
): void {
  const requestId = logInternalError(context, cause);
  res.status(status).json({ error: code, message, requestId } satisfies FailureBody);
}

/** خطأ غير متوقع: رسالة عامة للمستخدم، والتفاصيل كلها في السجل. */
export function failInternal(res: VercelResponse, context: string, cause: unknown): void {
  const requestId = logInternalError(context, cause);
  res.status(500).json({
    error: "server_error",
    message: `${GENERIC_INTERNAL_MESSAGE} (${requestId})`,
    requestId,
  } satisfies FailureBody);
}

/** فشل عند مزوّد خارجي. لا نمرّر رده أبدًا — قد يحوي تفاصيل حسابنا. */
export function failUpstream(
  res: VercelResponse,
  context: string,
  cause: unknown,
  message = "الخدمة الخارجية لم تستجب. حاول مرة أخرى بعد قليل."
): void {
  const requestId = logInternalError(context, cause);
  res.status(502).json({ error: "upstream_error", message, requestId } satisfies FailureBody);
}
