import * as React from "react";
import { BottomNav, TabKey } from "@/components/BottomNav";
import { MenuTarget } from "@/components/AppMenu";
import SortPage from "@/pages/SortPage";
import MapsPage from "@/pages/MapsPage";
import CheckPage from "@/pages/CheckPage";
import RecordPage from "@/pages/RecordPage";
import LoginPage from "@/pages/LoginPage";
import PendingApprovalPage from "@/pages/PendingApprovalPage";
import AdminPage from "@/pages/AdminPage";
import AccountPage from "@/pages/AccountPage";
import AiScanPage from "@/pages/AiScanPage";
import PrivacyPage from "@/pages/PrivacyPage";
import DatabasePage from "@/pages/DatabasePage";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { backend } from "@/lib/backend";
import { Sentry, isSentryEnabled } from "@/instrument";
import { FeedbackNotifyWatcher } from "@/components/FeedbackNotifyWatcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RefreshAppButton } from "@/components/RefreshAppButton";
import { InstallAppBanner } from "@/components/InstallAppBanner";
import { VoiceDebugPanel } from "@/components/VoiceDebugPanel";
import { InstallDebugPanel } from "@/components/InstallDebugPanel";

type OverlayPage = MenuTarget | "ai-scan" | null;

function MainApp() {
  const { user } = useAuth();
  const [tab, setTab] = React.useState<TabKey>("sort");
  const [overlay, setOverlay] = React.useState<OverlayPage>(null);

  React.useEffect(() => {
    // «الصفحة الرئيسية» من القائمة/الصوت → تبويب الفرز دائمًا
    if (overlay === "home") {
      setOverlay(null);
      setTab("sort");
    }
  }, [overlay]);

  React.useEffect(() => {
    // أمان: لا تُترك شاشة إدارة فارغة لمستخدم غير مالك
    if (overlay === "admin" && !user?.isOwner) setOverlay(null);
  }, [overlay, user?.isOwner]);

  // فتح صفحة الحساب من إشعار data.open === "account"
  React.useEffect(() => {
    const openAccount = () => setOverlay("account");

    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("open") === "account") {
        openAccount();
        params.delete("open");
        const next = params.toString();
        const path = window.location.pathname + (next ? `?${next}` : "") + window.location.hash;
        window.history.replaceState({}, "", path);
      }
    } catch {
      // ignore
    }

    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: string }>).detail;
      if (detail?.open === "account") openAccount();
    };
    window.addEventListener("tafriz:notification-open", onCustom);

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "OPEN_ACCOUNT") openAccount();
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onSwMessage);
    }

    return () => {
      window.removeEventListener("tafriz:notification-open", onCustom);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onSwMessage);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <FeedbackNotifyWatcher />
      {/* الشاشة الأساسية (التبويبات الأربعة الأصلية) */}
      {overlay === null && (
        <>
          {tab === "sort" && <SortPage onNavigate={(target) => setOverlay(target)} />}
          {tab === "maps" && <MapsPage />}
          {tab === "check" && <CheckPage />}
          {tab === "record" && (
            <RecordPage
              isOwner={!!user?.isOwner}
              onNavigateTab={(key) => {
                setOverlay(null);
                setTab(key);
              }}
              onOpenPage={(target) => {
                if (target === "home") {
                  setOverlay(null);
                  setTab("sort");
                  return;
                }
                setOverlay(target);
              }}
            />
          )}
          <BottomNav active={tab} onChange={setTab} />
        </>
      )}

      {/* شاشات إضافية تُفتح فوق التطبيق ويُرجعك سهم الرجوع منها للرئيسية */}
      {overlay === "ai-scan" && <AiScanPage onBack={() => setOverlay(null)} />}
      {overlay === "account" && (
        <AccountPage onBack={() => setOverlay(null)} onOpenAdmin={() => setOverlay("admin")} />
      )}
      {overlay === "admin" && user?.isOwner && <AdminPage onBack={() => setOverlay(null)} />}
      {overlay === "privacy" && <PrivacyPage onBack={() => setOverlay(null)} />}
      {overlay === "database" && <DatabasePage onBack={() => setOverlay(null)} />}
    </div>
  );
}

function Gate() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <LoginPage />;
  if (user.status !== "approved") return <PendingApprovalPage />;
  return <MainApp />;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // يسجَّل الخطأ تلقائيًا ليطّلع عليه المالك من "إدارة التحكم ▸ الأخطاء"
    backend.logError(error.message, error.stack ?? undefined).catch(() => {});
    // وإلى Sentry إن كان VITE_SENTRY_DSN مضبوطًا
    if (isSentryEnabled) {
      Sentry.captureException(error, {
        contexts: { react: { componentStack: info.componentStack } },
      });
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
          <h2 className="text-lg font-bold">حدث خطأ غير متوقع</h2>
          <p className="text-sm text-muted-foreground">
            تم تسجيل المشكلة تلقائيًا وسيطّلع عليها إدارة التطبيق. جرّب تحديث الصفحة.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

function SentryTestButton() {
  return (
    <button
      type="button"
      onClick={() => {
        Sentry.captureException(new Error("Sentry Test Success!"));
      }}
      className="fixed bottom-20 left-3 z-40 rounded-lg border border-border bg-background/95 px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground shadow-sm backdrop-blur hover:text-foreground"
      title="إرسال حدث اختبار إلى Sentry"
    >
      اختبار Sentry
    </button>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <RefreshAppButton />
        <ThemeToggle />
        <SentryTestButton />
        <Gate />
        <InstallAppBanner />
        <VoiceDebugPanel />
        <InstallDebugPanel />
      </AuthProvider>
    </ErrorBoundary>
  );
}
