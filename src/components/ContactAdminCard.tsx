import * as React from "react";
import { MessageCircle, Phone, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { backend } from "@/lib/backend";
import { getSupportPhones } from "@/lib/support-contact";
import { useAuth } from "@/context/AuthContext";

export function ContactAdminCard() {
  const { user } = useAuth();
  const phones = getSupportPhones();
  const [message, setMessage] = React.useState("");
  const [sent, setSent] = React.useState(false);

  async function handleSend() {
    if (!message.trim() || !user) return;
    await backend.submitFeedback(user.identifier, message.trim());
    setMessage("");
    setSent(true);
    setTimeout(() => setSent(false), 2000);
  }

  return (
    <Card>
      <CardHeader className="space-y-0">
        <CardTitle className="text-base">التواصل مع الإدارة</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          تواصل مع إدارة التطبيق مباشرة عبر واتساب أو الاتصال، أو أرسل رسالتك
          من هنا وتوصل للمالك مباشرة داخل التطبيق.
        </p>

        <div className="flex flex-col gap-2">
          {phones.map((p) => (
            <div key={p.phone} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs font-bold text-muted-foreground">{p.label}</span>
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => window.open(`https://wa.me/${p.phone}`, "_blank")}
              >
                <MessageCircle className="h-4 w-4" />
                واتساب
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => (window.location.href = `tel:+${p.phone}`)}
              >
                <Phone className="h-4 w-4" />
                اتصال
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Input
            placeholder="اكتب رسالتك للإدارة هنا..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="text-right"
          />
          <Button size="icon" onClick={handleSend} disabled={!message.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {sent && <p className="text-xs font-bold text-primary">تم إرسال رسالتك للإدارة ✓</p>}
      </CardContent>
    </Card>
  );
}
