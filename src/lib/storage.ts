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

export function removeLocal(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}
