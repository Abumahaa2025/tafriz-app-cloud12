import * as React from "react";
import {
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  ShieldCheck,
  LogIn,
  UserPlus,
  User,
  MapPin,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { IdentifierType, BackendError } from "@/lib/backend-types";
import { getSupportPhones } from "@/lib/support-contact";
import {
  assessPasswordStrength,
  isPasswordAcceptable,
  PASSWORD_RULE_HINT,
  passwordStrengthLabel,
} from "@/lib/password-strength";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = React.useState<Mode>("signin");
  const [idType, setIdType] = React.useState<IdentifierType>("email");

  const [fullName, setFullName] = React.useState("");
  const [city, setCity] = React.useState("");
  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const primaryPhone = getSupportPhones()[0]?.phone;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedId = identifier.trim();
    const idLabel = idType === "email" ? "البريد الإلكتروني" : "رقم الجوال";

    if (mode === "signup" && !fullName.trim()) {
      setError("يرجى إدخال الاسم الكامل / اسم المؤسسة");
      return;
    }
    if (!trimmedId) {
      setError(`يرجى إدخال ${idLabel}`);
      return;
    }
    if (mode === "signup" && !isPasswordAcceptable(password)) {
      setError(PASSWORD_RULE_HINT);
      return;
    }
    if (mode === "signin" && password.length < 1) {
      setError("يرجى إدخال كلمة المرور");
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        await signUp(idType, trimmedId, password, { fullName: fullName.trim(), city: city.trim() });
      } else {
        await signIn(idType, trimmedId, password);
      }
    } catch (err) {
      setError(err instanceof BackendError ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setBusy(false);
    }
  }

  function handleForgotPassword() {
    const message = "نسيت كلمة المرور لحسابي في تطبيق الفرز، أحتاج مساعدة لاستعادتها.";
    const url = primaryPhone
      ? `https://wa.me/${primaryPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gradient-to-b from-secondary/50 via-background to-background px-6 py-10">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        {/* شارة الأمان */}
        <div className="flex justify-center">
          <div className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="text-[11px] font-bold">تسجيل آمن ومشفّر</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-emerald-800 text-primary-foreground shadow-lg shadow-primary/20">
            <Sparkles className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-xl font-black text-primary">تطبيق الفرز والربط الذكي</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              نظام إدارة وفرز المعاملات الميدانية واللوحات
            </p>
          </div>
        </div>

        <Card className="shadow-lg">
          <CardContent className="flex flex-col gap-4 pt-6">
            {/* تبويب دخول / حساب جديد */}
            <div className="flex overflow-hidden rounded-2xl bg-muted p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError("");
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition-colors ${
                  mode === "signin" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                <LogIn className="h-4 w-4" />
                تسجيل الدخول
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError("");
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition-colors ${
                  mode === "signup" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                <UserPlus className="h-4 w-4" />
                إنشاء حساب جديد
              </button>
            </div>

            {/* طريقة الدخول: إيميل / جوال */}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <span>طريقة الدخول:</span>
              <button
                type="button"
                onClick={() => setIdType("email")}
                className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 font-bold transition-colors ${
                  idType === "email"
                    ? "border-primary bg-secondary text-primary"
                    : "border-border bg-background text-muted-foreground"
                }`}
              >
                <Mail className="h-3.5 w-3.5" />
                إيميل
              </button>
              <button
                type="button"
                onClick={() => setIdType("phone")}
                className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 font-bold transition-colors ${
                  idType === "phone"
                    ? "border-primary bg-secondary text-primary"
                    : "border-border bg-background text-muted-foreground"
                }`}
              >
                <Phone className="h-3.5 w-3.5" />
                رقم الجوال
              </button>
            </div>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
                {error}
              </p>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {mode === "signup" && (
                <div className="relative">
                  <User className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="الاسم الكامل / اسم الشركة أو المؤسسة"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pr-10 text-right"
                  />
                </div>
              )}

              <div className="relative">
                {idType === "email" ? (
                  <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                ) : (
                  <Phone className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                )}
                <Input
                  type={idType === "email" ? "email" : "tel"}
                  placeholder={idType === "email" ? "example@email.com" : "05xxxxxxxx"}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="pr-10 text-right"
                  dir="ltr"
                />
              </div>

              {mode === "signup" && (
                <div className="relative">
                  <MapPin className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="المدينة / المنطقة الميدانية"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="pr-10 text-right"
                  />
                </div>
              )}

              <div className="relative">
                <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="كلمة المرور"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 text-right"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {mode === "signup" && password.length > 0 && (
                <p
                  className={
                    "text-[11px] font-bold " +
                    (assessPasswordStrength(password) === "weak"
                      ? "text-destructive"
                      : assessPasswordStrength(password) === "medium"
                        ? "text-amber-600"
                        : "text-primary")
                  }
                >
                  قوة كلمة المرور: {passwordStrengthLabel(assessPasswordStrength(password))}
                  {assessPasswordStrength(password) === "weak" ? ` — ${PASSWORD_RULE_HINT}` : ""}
                </p>
              )}

              {mode === "signup" && (
                <div className="relative">
                  <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="تأكيد كلمة المرور"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 pr-10 text-right"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              )}

              {mode === "signin" && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="self-end text-xs font-bold text-primary"
                >
                  نسيت كلمة المرور؟
                </button>
              )}

              <Button type="submit" size="lg" disabled={busy} className="mt-1">
                {mode === "signin" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                {busy ? "جاري التحقق..." : mode === "signin" ? "تسجيل الدخول الآن" : "إنشاء الحساب ومتابعة"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* تواصل مع المالك مباشرة */}
        <Card className="border-emerald-500/20 bg-secondary/30">
          <CardContent className="flex flex-col items-center gap-2 pt-4 text-center">
            <p className="text-xs font-bold">💡 هل تواجه مشكلة في الدخول أو تحتاج حساب خاص؟</p>
            <p className="text-[11px] text-muted-foreground">
              تواصل مباشرة مع مالك التطبيق على الواتساب للتفعيل المباشر
            </p>
            <Button
              size="sm"
              className="mt-1 bg-[#25D366] text-white hover:bg-[#25D366]/90"
              onClick={() => {
                const message = "مرحباً، أواجه مشكلة في تسجيل الدخول أو إنشاء حساب في تطبيق الفرز.";
                const url = primaryPhone
                  ? `https://wa.me/${primaryPhone}?text=${encodeURIComponent(message)}`
                  : `https://wa.me/?text=${encodeURIComponent(message)}`;
                window.open(url, "_blank");
              }}
            >
              <MessageCircle className="h-4 w-4" />
              تواصل مع المالك عبر الواتساب
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-xs leading-6 text-muted-foreground">
          إنشاء الحساب لا يمنحك دخولًا فوريًا — يحتاج موافقة مالك التطبيق أولًا،
          وستظهر لك شاشة متابعة الطلب بعد إنشاء الحساب مباشرة.
        </p>
      </div>
    </div>
  );
}
