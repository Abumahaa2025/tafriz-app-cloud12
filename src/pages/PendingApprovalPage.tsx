import * as React from "react";
import { ShieldCheck, Ban, MessageCircle, Phone, Copy, Check, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { getSupportPhones } from "@/lib/support-contact";
import { backend } from "@/lib/backend";
import { personalActivationCode } from "@/lib/personal-code";

export default function PendingApprovalPage() {
  const { user, signOut, refresh } = useAuth();
  const revoked = user?.status === "revoked";
  const primaryPhone = getSupportPhones()[0]?.phone;
  const personalCode = user ? personalActivationCode(user.id) : "";

  const [copied, setCopied] = React.useState(false);
  const [copiedCode, setCopiedCode] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [codeError, setCodeError] = React.useState<string | null>(null);
  const [showCodeBox, setShowCodeBox] = React.useState(revoked);
  const [redeemBusy, setRedeemBusy] = React.useState(false);

  React.useEffect(() => {
    const tick = () => {
      refresh().catch(() => {});
    };
    tick();
    const interval = setInterval(tick, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  function requestMessage() {
    if (!user) return "";
    const typeLabel = user.identifierType === "email" ? "بريد إلكتروني" : "رقم جوال";
    if (revoked) {
      return [
        "طلب إعادة تفعيل حساب موقوف - تطبيق الفرز",
        user.fullName ? `الاسم: ${user.fullName}` : null,
        `الحساب: ${user.identifier}`,
        `الرمز الشخصي: ${personalCode}`,
        "الرجاء إعادة تفعيل حسابي بعد الإيقاف.",
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
      `الرمز الشخصي: ${personalCode}`,
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

  function handleCopyCode() {
    if (!personalCode) return;
    navigator.clipboard?.writeText(personalCode).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1500);
  }

  async function handleRedeemCode() {
    setCodeError(null);
    if (!code.trim()) {
      setCodeError("يرجى إدخال رمز التفعيل");
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
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
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
          ? "أوقف مالك التطبيق صلاحيتك. تواصل عبر واتساب لإعادة التفعيل، أو أدخل رمزك الشخصي أدناه بعد موافقة المالك."
          : "مرحبًا بك! يتطلب استخدام التطبيق الحصول على إذن مصرَّح من الإدارة. تواصل عبر واتساب أو الاتصال، وستدخل تلقائيًا فور الموافقة."}
      </p>
      <p className="text-xs text-muted-foreground" dir="ltr">
        {user?.identifier}
      </p>

      {personalCode && (
        <Card className="w-full border-primary/25 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-2 pt-4">
            <button
              type="button"
              onClick={handleCopyCode}
              className="text-muted-foreground hover:text-primary"
              aria-label="نسخ الرمز"
            >
              {copiedCode ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            </button>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">رمزك الشخصي للتفعيل</p>
              <p className="text-base font-black text-primary" dir="ltr">
                {personalCode}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {primaryPhone && (
        <Card className="w-full border-emerald-500/30 bg-secondary/40">
          <CardContent className="flex items-center justify-between pt-4">
            <button onClick={handleCopyPhone} className="text-muted-foreground hover:text-primary">
              {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
            </button>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">رقم إدارة التطبيق والمالك</p>
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
          {revoked ? "واتساب لإعادة التفعيل" : "التواصل عبر الواتساب (طلب الإذن)"}
        </Button>
        {primaryPhone && (
          <Button
            variant="outline"
            size="lg"
            onClick={() => (window.location.href = `tel:+${primaryPhone}`)}
          >
            <Phone className="h-4 w-4" />
            الاتصال بالإدارة هاتفيًا
          </Button>
        )}
      </div>

      <button
        onClick={() => setShowCodeBox((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground"
      >
        <KeyRound className="h-3.5 w-3.5" />
        {showCodeBox ? "إخفاء إدخال الرمز" : "إدخال رمز التفعيل / الرمز الشخصي"}
      </button>

      {showCodeBox && (
        <div className="flex w-full flex-col gap-2">
          <Input
            placeholder="TFZ-U-...... أو رمز المالك"
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
