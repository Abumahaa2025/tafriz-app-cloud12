import * as React from "react";
import { backend } from "@/lib/backend";
import { AppUser, IdentifierType } from "@/lib/backend-types";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AppUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    const u = await backend.getCurrentUser();
    setUser(u);
  }, []);

  React.useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // "نبضة" دورية تحدّث آخر نشاط للمستخدم الحالي — تظهر للمالك في إدارة
  // التحكم ▸ المشتركون ليعرف من يعمل على التطبيق الآن.
  React.useEffect(() => {
    if (!user) return;
    backend.touchLastSeen().catch(() => {});
    const interval = setInterval(() => {
      backend.touchLastSeen().catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, [user?.id]);

  async function signUp(
    type: IdentifierType,
    identifier: string,
    password: string,
    profile?: { fullName?: string; city?: string }
  ) {
    const u = await backend.signUp(type, identifier, password, profile);
    setUser(u);
    return u;
  }

  async function signIn(type: IdentifierType, identifier: string, password: string) {
    const u = await backend.signIn(type, identifier, password);
    setUser(u);
    return u;
  }

  async function signOut() {
    await backend.signOut();
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
