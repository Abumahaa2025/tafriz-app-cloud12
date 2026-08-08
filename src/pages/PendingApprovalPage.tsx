import * as React from "react";
import {
  ShieldCheck,
  Ban,
  MessageCircle,
  Copy,
  Check,
  KeyRound,
  Send,
  AppWindow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { getSupportPhones } from "@/lib/support-contact";
import { backend } from "@/lib/backend";
import { FeedbackItem } from "@/lib/backend-types";
import { requestNotificationPermission } from "@/lib/feedback-notify";

export default function PendingApprovalPage() {
  const { user, signOut, refresh } = useAuth();
  const revoked = user?.status === "revoked";
  const primaryPhone = getSupportPhones()[0]?.phone;

  const [copied, setCopied] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [codeError, setCodeError] = React.useState<string | null>(null);
  const [showCodeBox, setShowCodeBox] = React.useState(false);
  const [redeemBusy, setRedeemBusy] = React.useState(false);

  const [showInApp, setShowInApp] = React.useState(true);
  const [appMessage, setAppMessage] = React.useState("");
  const [sendBusy, setSendBusy] = React.useState(false);
  const [sendNotice, setSendNotice] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<FeedbackItem[]>([]);
  const [threadId, setThreadId] = React.useState<string | undefined>(undefined);

  const refreshChat = React.useCallback(async () => {
    try {
      const items = await backend.listMyFeedback();
      const sorted = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setMessages(sorted);
      if (sorted[0]?.threadId) setThreadId(sorted[0].threadId);
    } catch {
      // ignore — قد لا تكون الشبكة جاهزة
    }
  }, []);

  React.useEffect(() => {
    const tick = () => {
      refresh().catch(() => {});
      refreshChat().catch(() => {});
    };
    tick();
    const interval = setInterval(tick, 3000);
    return () => clearInterval(interval);
  }, [refresh, refreshChat]);

  function requestMessage() {
    if (!user) return "";
    const typeLabel = user.identifierType === "email" ? "بريد إلكتروني" : "رقم جوال";
    if (revoked) {
      return [
        "طلب إعادة تفعيل حساب موقوف - تطبيق الفرز",
        user.fullName ? `الاسم: ${user.fullName}` : null,
        `الحساب: ${user.identifier}`,
        "الرجاء إعادة تفعيل حسابي من إدارة التحكم أو إرسال رمز تفعيل.",
      ]
        .filter(Boolean)
        .join("\n");
    }
    return [
      "طلب تفعيل حساب - تطبيق الفرز",
      user.fullName ? `الاسم: ${user.fullName}` : null,
      `الحساب: ${user.identifier}`,
      `نوع الحساب: ${typeLabel}`,
      user.city ? `المدينة: ${user.city}` : null,
      `تاريخ الطلب: ${new Date(user.createdAt).toLocaleString("ar-SA")}`,
      "الرجاء الموافقة على الطلب ومنحي صلاحية استخدام التطبيق.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  function handleWhatsApp() {
    const url = primaryPhone
      ? `https://wa.me/${primaryPhone}?text=${encodeURIComponent(requestMessage())}`
      : `https://wa.me/?text=${encodeURIComponent(requestMessage())}`;
    window.open(url, "_blank");
  }

  function handleCopyPhone() {
    if (!primaryPhone) return;
    navigator.clipboard?.writeText(primaryPhone).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function sendToAdmin(text: string) {
    if (!user || !text.trim()) return;
    // مسار إيماءة المستخدم لطلب إذن الإشعارات (عبر الدالة المركزية فقط)
    void requestNotificationPermission();
    setSendBusy(true);
    setSendNotice(null);
    try {
      await backend.submitFeedback(user.identifier, text.trim(), threadId);
      setAppMessage("");
      setSendNotice("تم إرسال طلبك للإدارة عبر التطبيق ✓");
      window.setTimeout(() => setSendNotice(null), 2800);
      await refreshChat();
    } catch (err) {
      setSendNotice(err instanceof Error ? err.message : "تعذّر إرسال الرسالة");
    } finally {
      setSendBusy(false);
    }
  }

  function quickPermissionRequest() {
    if (!user) return "";
    if (revoked) {
      return [
        "طلب إعادة تفعيل من التطبيق",
        user.fullName ? `الاسم: ${user.fullName}` : null,
        `الحساب: ${user.identifier}`,
        "أرجو إعادة تفعيل حسابي أو إرسال رمز تفعيل.",
      ]
        .filter(Boolean)
        .join("\n");
    }
    return [
      "طلب إذن استخدام من التطبيق",
      user.fullName ? `الاسم: ${user.fullName}` : null,
      `الحساب: ${user.identifier}`,
      user.city ? `المدينة: ${user.city}` : null,
      "أرجو الموافقة على استخدام التطبيق.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  function quickCodeRequest() {
    if (!user) return "";
    return [
      "طلب رمز تفعيل من التطبيق",
      user.fullName ? `الاسم: ${user.fullName}` : null,
      `الحساب: ${user.identifier}`,
      revoked ? "الحالة: موقوف — أرجو إرسال رمز تفعيل لإعادة الاشتراك." : "أرجو إرسال رمز تفعيل لتفعيل الحساب.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function handleRedeemCode() {
    setCodeError(null);
    if (!code.trim()) {
      setCodeError("يرجى إدخال رمز التفعيل الذي أرسلته الإدارة");
      return;
    }
    setRedeemBusy(true);
    try {
      const success = await backend.redeemActivationCode(code.trim());
      if (success) {
        await refresh();
      } else {
        setCodeError("رمز التفعيل غير صحيح أو مستخدم من قبل");
      }
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : "تعذّر التفعيل");
    } finally {
      setRedeemBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <div
        className={
          "flex h-16 w-16 items-center justify-center rounded-full " +
          (revoked ? "bg-destructive/15 ring-2 ring-destructive/40" : "bg-secondary")
        }
      >
        {revoked ? (
          <Ban className="h-8 w-8 text-destructive" />
        ) : (
          <ShieldCheck className="h-8 w-8 text-primary" />
        )}
      </div>

      <h1 className={"text-lg font-bold " + (revoked ? "text-destructive" : "")}>
        {revoked ? "تم إيقاف صلاحية الدخول" : "التواصل مع الإدارة لطلب الإذن للاستخدام"}
      </h1>
      <p className="text-sm leading-6 text-muted-foreground">
        {revoked
          ? "يمكنك طلب إعادة التفعيل أو رمز تفعيل عبر واتساب أو مباشرة من داخل التطبيق."
          : "اختر طريقة التواصل: واتساب أو رسالة مباشرة داخل التطبيق (طلب إذن، رمز تفعيل، أو أي طلب للإدارة)."}
      </p>
      <p className="text-xs text-muted-foreground" dir="ltr">
        {user?.identifier}
      </p>

      {primaryPhone && (
        <Card className="w-full border-emerald-500/30 bg-secondary/40">
          <CardContent className="flex items-center justify-between pt-4">
            <button onClick={handleCopyPhone} className="text-muted-foreground hover:text-primary">
              {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            </button>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">رقم واتساب الإدارة</p>
              <p className="text-base font-bold text-primary" dir="ltr">
                +{primaryPhone}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex w-full flex-col gap-2">
        <Button className="w-full bg-[#25D366] text-white hover:bg-[#25D366]/90" size="lg" onClick={handleWhatsApp}>
          <MessageCircle className="h-5 w-5" />
          التواصل عبر الواتساب
        </Button>
        <Button
          variant={showInApp ? "default" : "outline"}
          size="lg"
          className="w-full"
          onClick={() => setShowInApp((v) => !v)}
        >
          <AppWindow className="h-5 w-5" />
          التواصل مع الإدارة عبر التطبيق
        </Button>
      </div>

      {showInApp && (
        <Card className="w-full text-right">
          <CardContent className="flex flex-col gap-3 pt-4">
            <p className="text-xs text-muted-foreground">
              أرسل طلبك مباشرة للإدارة داخل التطبيق — يصل إلى «إدارة التحكم ▸ الملاحظات».
            </p>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={sendBusy}
                onClick={() => sendToAdmin(quickPermissionRequest())}
              >
                {revoked ? "طلب إعادة تفعيل" : "طلب إذن استخدام"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={sendBusy}
                onClick={() => sendToAdmin(quickCodeRequest())}
              >
                طلب رمز تفعيل
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Input
                placeholder="اكتب أي طلب للإدارة..."
                value={appMessage}
                onChange={(e) => setAppMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendToAdmin(appMessage);
                }}
                className="text-right"
              />
              <Button
                size="icon"
                disabled={sendBusy || !appMessage.trim()}
                onClick={() => void sendToAdmin(appMessage)}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>

            {sendNotice && (
              <p className="text-center text-xs font-bold text-primary">{sendNotice}</p>
            )}

            {messages.length > 0 && (
              <div className="flex max-h-52 flex-col gap-2 overflow-y-auto rounded-xl border border-border p-2">
                <p className="text-[11px] font-bold text-muted-foreground">محادثتك مع الإدارة</p>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={
                      "rounded-lg px-2 py-1.5 text-sm " +
                      (m.fromOwner ? "bg-secondary/60" : "bg-primary/10")
                    }
                  >
                    <p className="text-[10px] font-bold text-muted-foreground">
                      {m.fromOwner ? "الإدارة" : "أنت"} · {new Date(m.createdAt).toLocaleString("ar-SA")}
                    </p>
                    <p className="whitespace-pre-wrap">{m.message}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <button
        onClick={() => setShowCodeBox((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground"
      >
        <KeyRound className="h-3.5 w-3.5" />
        {showCodeBox ? "إخفاء إدخال الرمز" : "إدخال رمز التفعيل من الإدارة"}
      </button>

      {showCodeBox && (
        <div className="flex w-full flex-col gap-2">
          <Input
            placeholder="الصق الرمز الذي أرسلته الإدارة"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="text-center"
            dir="ltr"
          />
          {codeError && <p className="text-xs text-destructive">{codeError}</p>}
          <Button onClick={handleRedeemCode} disabled={redeemBusy}>
            {redeemBusy ? "جاري التفعيل..." : "تأكيد الرمز والتفعيل"}
          </Button>
        </div>
      )}

      <Button variant="outline" onClick={() => refresh()} className="w-full">
        تحديث حالة الطلب
      </Button>

      <Button variant="ghost" onClick={signOut} className="text-muted-foreground">
        تسجيل خروج
      </Button>
    </div>
  );
}
