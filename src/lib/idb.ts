/**
 * تخزين بسيط عبر IndexedDB للملفات الكبيرة (مثل شيت التشييك)
 * التي قد تتجاوز سعة localStorage.
 */

const DB_NAME = "tafriz-idb";
const STORE = "kv";
const DB_VERSION = 1;

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
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
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
      reject(req.error ?? new Error("idb_open_failed"));
    };
  });
  return dbPromise;
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb_set_failed"));
  });
}

export async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  const value = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error ?? new Error("idb_get_failed"));
  });
  return value;
}

export async function idbRemove(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb_remove_failed"));
  });
}
