// Small wrapper around localStorage so state survives closing the browser/app.
// This is a *local* database (per device). For a real shared database that
// syncs across devices/users, see the "قاعدة بيانات حقيقية" note in README.md.

const PREFIX = "tafriz:";

export function saveLocal<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage full or unavailable — fail silently, app still works in-memory
  }
}

export function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** آخر نص خام تم تحليله لكل مفتاح — يُبطل نفسه تلقائيًا لأن المقارنة على النص. */
const parseCache = new Map<string, { raw: string; value: unknown }>();

/**
 * مثل loadLocal لكن لا يعيد تحليل JSON إن كان النص المحفوظ لم يتغيّر.
 *
 * صفحة الخريطة تقرأ نتيجة الفرز كاملة (كل الصفوف المطابقة) عند كل بناء للصفحة
 * وعند كل رجوع للتطبيق. تحليل نص بحجم ميجابايتات يجمّد الخيط الرئيسي، والنص
 * لا يتغيّر إلا بعد فرز جديد.
 *
 * ⚠️ القيمة المُعادة مشتركة — للقراءة فقط، لا تعدّلها في مكانها.
 */
export function loadLocalCached<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    const cached = parseCache.get(key);
    if (cached && cached.raw === raw) return cached.value as T;
    const value = JSON.parse(raw) as T;
    parseCache.set(key, { raw, value });
    return value;
  } catch {
    return fallback;
  }
}

export function removeLocal(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}
