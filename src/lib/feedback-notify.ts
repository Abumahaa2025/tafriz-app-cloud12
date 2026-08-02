import { FeedbackItem } from "./backend-types";

const SEEN_KEY = "tafriz_feedback_notify_seen_v1";

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSeen(ids: Set<string>) {
  const list = [...ids].slice(-200);
  localStorage.setItem(SEEN_KEY, JSON.stringify(list));
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const res = await Notification.requestPermission();
    return res === "granted";
  } catch {
    return false;
  }
}

async function showPhoneNotification(title: string, body: string, tag: string) {
  if (!(await ensureNotificationPermission())) return;
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        tag,
        dir: "rtl",
        lang: "ar",
        data: { open: "account" },
      });
      return;
    }
  } catch {
    // fallback below
  }
  try {
    new Notification(title, { body, tag, dir: "rtl", lang: "ar" });
  } catch {
    // ignore
  }
}

/** إشعار المالك برسائل المستخدمين الجديدة */
export async function notifyOwnerNewFeedback(items: FeedbackItem[]) {
  const unread = items.filter((i) => !i.fromOwner && !i.read);
  if (unread.length === 0) return;
  const seen = loadSeen();
  const fresh = unread.filter((i) => !seen.has(i.id));
  if (fresh.length === 0) return;
  for (const i of fresh) seen.add(i.id);
  saveSeen(seen);
  const last = fresh[fresh.length - 1];
  await showPhoneNotification(
    "رسالة جديدة من مستخدم",
    `${last.identifier}: ${last.message.slice(0, 80)}`,
    `feedback-owner-${last.id}`
  );
}

/** إشعار المستخدم بردود الإدارة الجديدة */
export async function notifyUserAdminReply(items: FeedbackItem[]) {
  const unread = items.filter((i) => i.fromOwner && !i.readByUser);
  if (unread.length === 0) return;
  const seen = loadSeen();
  const fresh = unread.filter((i) => !seen.has(i.id));
  if (fresh.length === 0) return;
  for (const i of fresh) seen.add(i.id);
  saveSeen(seen);
  const last = fresh[fresh.length - 1];
  await showPhoneNotification(
    "رد جديد من الإدارة",
    last.message.slice(0, 100),
    `feedback-user-${last.id}`
  );
}
