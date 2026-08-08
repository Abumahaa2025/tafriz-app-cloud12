import { FeedbackItem } from "./backend-types";

const SEEN_OWNER_KEY = "tafriz_feedback_notify_seen_owner_v2";
const SEEN_USER_KEY = "tafriz_feedback_notify_seen_user_v2";
const BASELINE_OWNER_KEY = "tafriz_feedback_notify_baseline_owner_v2";
const BASELINE_USER_KEY = "tafriz_feedback_notify_baseline_user_v2";

export type NotificationPermissionState = "unsupported" | "granted" | "denied" | "default";

function loadSeen(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSeen(key: string, ids: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...ids].slice(-300)));
}

function hasBaseline(key: string): boolean {
  return localStorage.getItem(key) === "1";
}

function setBaseline(key: string) {
  localStorage.setItem(key, "1");
}

export function getNotificationPermissionState(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  const p = Notification.permission;
  if (p === "granted" || p === "denied" || p === "default") return p;
  return "unsupported";
}

export function canShowNotifications(): boolean {
  return getNotificationPermissionState() === "granted";
}

/**
 * المسار المركزي الوحيد لطلب إذن الإشعارات.
 * يُستدعى فقط من إيماءة مستخدم (click/tap) — لا من useEffect/تسجيل الدخول.
 * إذا كان الإذن denied أو API غير موجودة لا يُعاد الطلب.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const state = getNotificationPermissionState();
  if (state === "unsupported" || state === "denied") return false;
  if (state === "granted") return true;
  try {
    const res = await Notification.requestPermission();
    return res === "granted";
  } catch {
    return false;
  }
}

/**
 * فحص فقط — لا يطلب إذنًا.
 * الاسم القديم يُبقى للتوافق؛ السلوك لم يعد يطلب تلقائيًا.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  return canShowNotifications();
}

export type AppNotificationOpen = "account";

/**
 * يعرض إشعارًا واحدًا فقط لنفس الحدث (بدون ازدواج SW + Notification).
 * لا يطلب إذنًا — إن لم يكن ممنوحًا يعود false.
 */
export async function showAppNotification(opts: {
  title: string;
  body: string;
  tag: string;
  open?: AppNotificationOpen;
}): Promise<boolean> {
  if (!canShowNotifications()) return false;

  const data = opts.open ? { open: opts.open } : undefined;
  let ok = false;

  // تفضيل Service Worker عند توفره (أنسب لـ PWA)، وإلا Notification المباشر
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(opts.title, {
        body: opts.body,
        tag: opts.tag,
        dir: "rtl",
        lang: "ar",
        requireInteraction: true,
        data,
      });
      ok = true;
    }
  } catch {
    // نجرب المسار المباشر أدناه
  }

  if (!ok) {
    try {
      const n = new Notification(opts.title, {
        body: opts.body,
        tag: opts.tag,
        dir: "rtl",
        lang: "ar",
        requireInteraction: true,
        data,
      });
      n.onclick = () => {
        try {
          window.focus();
        } catch {
          // ignore
        }
        if (opts.open === "account") {
          try {
            const url = new URL(window.location.href);
            url.searchParams.set("open", "account");
            window.history.replaceState({}, "", url.toString());
            window.dispatchEvent(new CustomEvent("tafriz:notification-open", { detail: { open: "account" } }));
          } catch {
            // ignore
          }
        }
        n.close();
      };
      ok = true;
    } catch {
      return false;
    }
  }

  try {
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  } catch {
    // ignore
  }

  return ok;
}

async function showPhoneNotification(title: string, body: string, tag: string): Promise<boolean> {
  return showAppNotification({ title, body, tag, open: "account" });
}

/**
 * أول تشغيل: نخزّن الرسائل الحالية كأساس بدون إشعار (لتفادي فيضان قديم)،
 * ثم أي رسالة جديدة بعد ذلك تُشعر — ولا تُعلَّم مشاهَدة إلا بعد نجاح الإشعار.
 */
async function notifyFresh(
  items: FeedbackItem[],
  opts: {
    seenKey: string;
    baselineKey: string;
    title: string;
    bodyOf: (item: FeedbackItem) => string;
    tagOf: (item: FeedbackItem) => string;
  }
) {
  if (items.length === 0) return;
  const seen = loadSeen(opts.seenKey);

  if (!hasBaseline(opts.baselineKey)) {
    for (const i of items) seen.add(i.id);
    saveSeen(opts.seenKey, seen);
    setBaseline(opts.baselineKey);
    // أخطر رسالة واحدة فقط عند أول تفعيل للإشعارات إن وُجدت غير مقروءة
    const last = items[items.length - 1];
    const shown = await showPhoneNotification(opts.title, opts.bodyOf(last), opts.tagOf(last));
    if (shown) {
      seen.add(last.id);
      saveSeen(opts.seenKey, seen);
    }
    return;
  }

  const fresh = items.filter((i) => !seen.has(i.id));
  if (fresh.length === 0) return;

  const last = fresh[fresh.length - 1];
  const shown = await showPhoneNotification(opts.title, opts.bodyOf(last), opts.tagOf(last));
  if (!shown) return; // لا نعلّمها مشاهَدة حتى ينجح العرض — يعاد المحاولة

  for (const i of fresh) seen.add(i.id);
  saveSeen(opts.seenKey, seen);
}

/** إشعار المالك برسائل المستخدمين الجديدة */
export async function notifyOwnerNewFeedback(items: FeedbackItem[]) {
  const unread = items
    .filter((i) => !i.fromOwner && !i.read)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  await notifyFresh(unread, {
    seenKey: SEEN_OWNER_KEY,
    baselineKey: BASELINE_OWNER_KEY,
    title: "رسالة جديدة من مستخدم",
    bodyOf: (i) => `${i.identifier}: ${i.message.slice(0, 80)}`,
    tagOf: (i) => `feedback-owner-${i.id}`,
  });
}

/** إشعار المستخدم بردود الإدارة الجديدة */
export async function notifyUserAdminReply(items: FeedbackItem[]) {
  const unread = items
    .filter((i) => i.fromOwner && !i.readByUser)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  await notifyFresh(unread, {
    seenKey: SEEN_USER_KEY,
    baselineKey: BASELINE_USER_KEY,
    title: "رد جديد من الإدارة",
    bodyOf: (i) => i.message.slice(0, 100),
    tagOf: (i) => `feedback-user-${i.id}`,
  });
}
