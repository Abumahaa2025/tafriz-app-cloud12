/**
 * قراءة إعدادات الخادم من متغيّرات البيئة.
 *
 * كل المفاتيح تُقرأ من البيئة فقط — لا قيمة افتراضية لأي سر داخل الكود، ولا
 * سر مكتوب في أي ملف داخل المستودع. محليًا تُقرأ من `.env` (المستبعَد في
 * `.gitignore`)، وعلى الإنتاج من Vercel ▸ Settings ▸ Environment Variables.
 *
 * `.env` يُحمَّل تلقائيًا: Vite يحمّله لمتغيّرات `VITE_*` في المتصفح،
 * و `vercel dev` يحمّله للدوال الخادمية. فما نحتاج حزمة تحميل إضافية.
 *
 * ⚠️ لا تضع سرًّا في متغيّر يبدأ بـ `VITE_` — Vite يستبدل هذي المتغيّرات نصًّا
 * داخل حزمة الجافاسكربت، فتصير معروضة لأي أحد يفتح الموقع.
 */

/** الأسرار التي يجب ألا تخرج من الخادم أبدًا. */
export interface ServerSecrets {
  /** رابط مشروع Supabase. */
  url: string;
  /** مفتاح service role — يتجاوز RLS بالكامل. */
  serviceKey: string;
}

/** إعدادات ناقصة: نذكر اسم المتغيّر فقط، ولا نلمح أبدًا لقيمته. */
export interface MissingConfig {
  missing: string[];
}

function read(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

/**
 * يقرأ ما تحتاجه الدوال التي تتعامل مع Supabase بصلاحيات كاملة.
 * يرجع أسماء المتغيّرات الناقصة بدل أن يرمي استثناءً، حتى يقرر كل مسار
 * بنفسه: `auth-register` يرجع 503 ليكمل العميل بمسار احتياطي.
 */
export function readSupabaseSecrets(): ServerSecrets | MissingConfig {
  const url = read("SUPABASE_URL", "VITE_SUPABASE_URL");
  const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");

  const missing: string[] = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) return { missing };

  return { url: url as string, serviceKey: serviceKey as string };
}

/** المفتاح العام (anon/publishable) — يحتاجه الخادم للتحقق من هوية الطالب. */
export function readAnonKey(): string | undefined {
  return read("VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY");
}

/** مفتاح Anthropic لقراءة اللوحات. الميزة تتعطّل بدونه ولا ينكسر التطبيق. */
export function readAnthropicKey(): string | undefined {
  return read("ANTHROPIC_API_KEY");
}

/** معرّف حساب المالك. يطابق OWNER_IDENTIFIER في src/lib/owner-config.ts. */
export function readOwnerIdentifier(): string {
  return read("OWNER_IDENTIFIER") ?? "0575051487";
}

export function isMissingConfig(value: ServerSecrets | MissingConfig): value is MissingConfig {
  return "missing" in value;
}
