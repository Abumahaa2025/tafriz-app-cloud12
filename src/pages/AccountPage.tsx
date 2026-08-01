import * as React from "react";
import { ArrowRight, UserCircle2, ShieldCheck, LogOut, KeyRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ContactAdminCard } from "@/components/ContactAdminCard";
import { useAuth } from "@/context/AuthContext";
import { backend } from "@/lib/backend";

export default function AccountPage({
  onBack,
  onOpenAdmin,
}: {
  onBack: () => void;
  onOpenAdmin: () => void;
}) {
  const { user, signOut } = useAuth();
  const [newPassword, setNewPassword] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);

  async function handleChangePassword() {
    if (newPassword.length < 4) {
      setStatus("كلمة المرور يجب أن تكون 4 أحرف على الأقل");
      return;
    }
    await backend.changePassword(newPassword);
    setNewPassword("");
    setStatus("تم تغيير كلمة المرور ✓");
    setTimeout(() => setStatus(null), 2000);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-28 pt-4">
      <header className="flex items-center gap-2 py-2">
        <button onClick={onBack} className="text-muted-foreground">
          <ArrowRight className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-black">الحساب</h1>
      </header>

      <Card>
        <CardContent className="flex flex-col items-center gap-2 pt-6">
          <UserCircle2 className="h-14 w-14 text-primary" />
          {user?.fullName && <span className="text-base font-black">{user.fullName}</span>}
          <span className="font-bold" dir="ltr">
            {user?.identifier}
          </span>
          {user?.city && <span className="text-xs text-muted-foreground">{user.city}</span>}
          <Badge variant={user?.isOwner ? "default" : "secondary"}>
            {user?.isOwner ? "مالك التطبيق" : user?.packageName ?? "بدون باقة"}
          </Badge>
          {user?.packageExpiresAt && (
            <span className="text-xs text-muted-foreground">
              تنتهي الباقة: {new Date(user.packageExpiresAt).toLocaleDateString("ar-SA")}
            </span>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2 pt-4">
          <span className="flex items-center gap-2 text-sm font-bold">
            <KeyRound className="h-4 w-4 text-primary" />
            تغيير كلمة المرور
          </span>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="كلمة المرور الجديدة"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="text-right"
              dir="ltr"
            />
            <Button onClick={handleChangePassword}>حفظ</Button>
          </div>
          {status && <p className="text-xs font-bold text-primary">{status}</p>}
        </CardContent>
      </Card>

      {user?.isOwner && (
        <Button variant="secondary" size="lg" onClick={onOpenAdmin}>
          <ShieldCheck className="h-5 w-5" />
          إدارة التحكم
        </Button>
      )}

      <ContactAdminCard />

      <Button variant="outline" size="lg" onClick={signOut}>
        <LogOut className="h-5 w-5" />
        تسجيل خروج
      </Button>
    </div>
  );
}
