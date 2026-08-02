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
import { FeedbackNotifyWatcher } from "@/components/FeedbackNotifyWatcher";

type OverlayPage = MenuTarget | "ai-scan" | null;

function MainApp() {
  const { user } = useAuth();
  const [tab, setTab] = React.useState<TabKey>("sort");
  const [overlay, setOverlay] = React.useState<OverlayPage>(null);

  React.useEffect(() => {
    if (overlay === "home") setOverlay(null);
  }, [overlay]);

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
      {overlay === "admin" && user?.isOwner && <AdminPage onBack={() => setOverlay("account")} />}
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
  componentDidCatch(error: Error) {
    // يسجَّل الخطأ تلقائيًا ليطّلع عليه المالك من "إدارة التحكم ▸ الأخطاء"
    backend.logError(error.message, error.stack ?? undefined).catch(() => {});
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
          <h2 className="text-lg font-bold">حدث خطأ غير متوقع</h2>
          <p className="text-sm text-muted-foreground">
            تم تسجيل المشكلة تلقائيًا وسيطّلع عليها مالك التطبيق. جرّب تحديث الصفحة.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ErrorBoundary>
  );
}
