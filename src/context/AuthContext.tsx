import * as React from "react";
import { backend } from "@/lib/backend";
import { AppUser, BackendError, IdentifierType } from "@/lib/backend-types";
import { ensureNotificationPermission } from "@/lib/feedback-notify";
import { getSupportPhones } from "@/lib/support-contact";

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  signUp: (
    type: IdentifierType,
    identifier: string,
    password: string,
    profile?: { fullName?: string; city?: string }
  ) => Promise<AppUser>;
  signIn: (type: IdentifierType, identifier: string, password: string) => Promise<AppUser>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);
const REVOKED_NOTIFIED_KEY = "tafriz_revoked_notified_v1";

async function notifyAccountRevoked(user: AppUser) {
  const phones = getSupportPhones();
  const phone = phones[0]?.phone;
  const body =
    `تم إيقاف حسابك من الإدارة. تواصل عبر واتساب لإعادة التفعيل.` +
    (phone ? ` الرقم: +${phone}.` : "") +
    ` التفعيل يتم فقط بعد موافقة المالك أو إرسال رمز تفعيل منه.`;

  try {
    localStorage.setItem(
      REVOKED_NOTIFIED_KEY,
      JSON.stringify({ at: Date.now(), userId: user.id })
    );
  } catch {
    // ignore
  }

  try {
    if (!(await ensureNotificationPermission())) return;
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification("تم إيقاف حسابك — تواصل مع الإدارة", {
          body,
          tag: `account-revoked-${user.id}`,
          dir: "rtl",
          lang: "ar",
          requireInteraction: true,
        });
      }
    } catch {
      // ignore
    }
    try {
      new Notification("تم إيقاف حسابك — تواصل مع الإدارة", {
        body,
        tag: `account-revoked-${user.id}`,
        dir: "rtl",
        lang: "ar",
        requireInteraction: true,
      });
    } catch {
      // ignore
    }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
  } catch {
    // ignore
  }
}

function sameUser(a: AppUser, b: AppUser): boolean {
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.packageName === b.packageName &&
    a.packageExpiresAt === b.packageExpiresAt &&
    a.lastSeenAt === b.lastSeenAt &&
    a.fullName === b.fullName &&
    a.city === b.city &&
    a.isOwner === b.isOwner
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AppUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const statusRef = React.useRef<AppUser["status"] | null>(null);

  const refresh = React.useCallback(async () => {
    const u = await backend.getCurrentUser();
    if (u) statusRef.current = u.status;
    else statusRef.current = null;
    setUser(u);
  }, []);

  // استعادة الجلسة عند السحب/التحديث — بدون إجبار تسجيل خروج
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await backend.getCurrentUser();
        if (cancelled) return;
        if (u) {
          // الموقوف لا يدخل للتطبيق الرئيسي
          statusRef.current = u.status;
          setUser(u);
        } else {
          statusRef.current = null;
          setUser(null);
        }
      } catch {
        if (!cancelled) {
          statusRef.current = null;
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // مراقبة حية: إيقاف فوري + إشعار عند تغيّر الحالة من الإدارة
  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const u = await backend.getCurrentUser();
        if (cancelled) return;
        if (!u) {
          statusRef.current = null;
          setUser(null);
          return;
        }
        const prev = statusRef.current;
        if (prev === "approved" && u.status === "revoked") {
          await notifyAccountRevoked(u);
        }
        statusRef.current = u.status;
        setUser((cur) => (cur && sameUser(cur, u) ? cur : u));
      } catch {
        // ignore
      }
    };

    tick();
    const interval = setInterval(tick, 3_000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user?.id]);

  React.useEffect(() => {
    if (!user || user.status === "revoked") return;
    backend.touchLastSeen().catch(() => {});
    const interval = setInterval(() => {
      backend.touchLastSeen().catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, [user?.id, user?.status]);

  async function signUp(
    type: IdentifierType,
    identifier: string,
    password: string,
    profile?: { fullName?: string; city?: string }
  ) {
    const u = await backend.signUp(type, identifier, password, profile);
    statusRef.current = u.status;
    setUser(u);
    return u;
  }

  async function signIn(type: IdentifierType, identifier: string, password: string) {
    const pwd = String(password ?? "");
    if (!pwd.trim()) {
      throw new BackendError("bad_password", "يرجى إدخال كلمة المرور");
    }
    const u = await backend.signIn(type, identifier, pwd);
    if (u.status === "revoked") {
      await backend.signOut();
      statusRef.current = null;
      setUser(null);
      throw new BackendError(
        "not_allowed",
        "تم إيقاف حسابك من الإدارة. تواصل عبر واتساب — إعادة التفعيل فقط بموافقة المالك أو برمز يرسله هو."
      );
    }
    statusRef.current = u.status;
    setUser(u);
    return u;
  }

  async function signOut() {
    await backend.signOut();
    statusRef.current = null;
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
