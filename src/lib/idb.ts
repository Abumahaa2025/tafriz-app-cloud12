/**
 * تخزين بسيط عبر IndexedDB للملفات الكبيرة (مثل شيت التشييك)
 * التي قد تتجاوز سعة localStorage.
 *
 * أخطاء التخزين لا تُبتلع هنا — تُرمى كـ IdbError برسائل عربية جاهزة للواجهة.
 */

const DB_NAME = "tafriz-idb";
const STORE = "kv";
const DB_VERSION = 1;

export type IdbErrorCode =
  | "unavailable"
  | "open_failed"
  | "quota"
  | "get_failed"
  | "set_failed"
  | "remove_failed"
  | "transaction_failed";

export type IdbUserOp = "save" | "load" | "remove";

export class IdbError extends Error {
  readonly code: IdbErrorCode;
  readonly causeError?: unknown;

  constructor(code: IdbErrorCode, causeError?: unknown) {
    super(code);
    this.name = "IdbError";
    this.code = code;
    this.causeError = causeError;
  }
}

export function isIdbError(err: unknown): err is IdbError {
  return err instanceof IdbError;
}

export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB != null;
  } catch {
    return false;
  }
}

function isQuotaFailure(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: number; message?: string };
  if (e.name === "QuotaExceededError") return true;
  // بعض المتصفحات تستخدم الرمز 22 لـ QuotaExceeded
  if (e.code === 22) return true;
  const msg = String(e.message || "").toLowerCase();
  return msg.includes("quota") || msg.includes("storage");
}

function toIdbError(fallback: IdbErrorCode, err?: unknown): IdbError {
  if (isIdbError(err)) return err;
  if (isQuotaFailure(err)) return new IdbError("quota", err);
  return new IdbError(fallback, err);
}

/** رسالة عربية واضحة للواجهة — بلا تفاصيل تقنية */
export function idbUserMessage(err: unknown, op: IdbUserOp): string {
  const code = isIdbError(err) ? err.code : isQuotaFailure(err) ? "quota" : null;

  if (op === "load") {
    return "تعذّر تحميل البيانات المحفوظة من الجهاز. إن كانت لديك ملفات سابقة فأعد رفعها — هذا مختلف عن عدم وجود بيانات محفوظة.";
  }

  if (op === "remove") {
    return "تعذّر مسح البيانات المحفوظة من الجهاز. يمكنك المتابعة.";
  }

  // save
  if (code === "quota") {
    return "مساحة التخزين على الجهاز ممتلئة، لذلك تعذّر حفظ البيانات للاستعادة لاحقًا. البيانات ما زالت متاحة في هذه الجلسة ويمكنك المتابعة أو تصدير النتائج.";
  }
  if (code === "unavailable" || code === "open_failed") {
    return "تخزين الجهاز غير متاح حاليًا، لذلك تعذّر حفظ البيانات للاستعادة لاحقًا. البيانات ما زالت متاحة في هذه الجلسة ويمكنك المتابعة.";
  }
  return "تعذّر حفظ البيانات للاستعادة لاحقًا. البيانات ما زالت متاحة في هذه الجلسة ويمكنك المتابعة.";
}

/**
 * اتصال واحد مُعاد استخدامه.
 *
 * كانت كل عملية قراءة/كتابة تفتح اتصالًا وتغلقه، وصفحة الفرز وحدها تقرأ أربعة
 * مفاتيح عند كل بناء لها — أي أربع دورات فتح وإغلاق في كل مرة ينتقل المستخدم
 * بين الأيقونات. فتح IndexedDB ليس مجانيًا، والإغلاق أثناء عملية أخرى معلّقة
 * يسبب أخطاء متقطعة.
 */
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new IdbError("unavailable"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      dbPromise = null;
      reject(toIdbError("unavailable", err));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      // لو أُغلق الاتصال من الخارج (تحديث نسخة، أو تفريغ تخزين المتصفح)
      // نُسقط الكاش حتى يُفتح من جديد عند أول عملية بعدها
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(toIdbError("open_failed", req.error));
    };
  });
  return dbPromise;
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, "readwrite");
    } catch (err) {
      dbPromise = null;
      reject(toIdbError("transaction_failed", err));
      return;
    }
    const fail = (err?: unknown) => reject(toIdbError("set_failed", err));
    // نجاح الكتابة يُؤكَّد عند اكتمال المعاملة (Quota يظهر غالبًا كـ abort)
    tx.oncomplete = () => resolve();
    tx.onabort = () => fail(tx.error);
    tx.onerror = () => fail(tx.error);
    try {
      tx.objectStore(STORE).put(value, key);
    } catch (err) {
      fail(err);
    }
  });
}

export async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise<T | null>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, "readonly");
    } catch (err) {
      dbPromise = null;
      reject(toIdbError("transaction_failed", err));
      return;
    }
    const fail = (err?: unknown) => reject(toIdbError("get_failed", err));
    tx.onabort = () => fail(tx.error);
    tx.onerror = () => fail(tx.error);
    try {
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => fail(req.error);
    } catch (err) {
      fail(err);
    }
  });
}

export async function idbRemove(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, "readwrite");
    } catch (err) {
      dbPromise = null;
      reject(toIdbError("transaction_failed", err));
      return;
    }
    const fail = (err?: unknown) => reject(toIdbError("remove_failed", err));
    tx.oncomplete = () => resolve();
    tx.onabort = () => fail(tx.error);
    tx.onerror = () => fail(tx.error);
    try {
      tx.objectStore(STORE).delete(key);
    } catch (err) {
      fail(err);
    }
  });
}
