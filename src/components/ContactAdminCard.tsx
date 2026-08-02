import * as React from "react";
import { MessageCircle, Phone, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { backend } from "@/lib/backend";
import { FeedbackItem } from "@/lib/backend-types";
import { getSupportPhones } from "@/lib/support-contact";
import { useAuth } from "@/context/AuthContext";

function groupThreads(items: FeedbackItem[]): { threadId: string; messages: FeedbackItem[] }[] {
  const map = new Map<string, FeedbackItem[]>();
  for (const item of items) {
    const list = map.get(item.threadId) ?? [];
    list.push(item);
    map.set(item.threadId, list);
  }
  return [...map.entries()]
    .map(([threadId, messages]) => ({
      threadId,
      messages: messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }))
    .sort((a, b) => {
      const aLast = a.messages[a.messages.length - 1]?.createdAt ?? "";
      const bLast = b.messages[b.messages.length - 1]?.createdAt ?? "";
      return bLast.localeCompare(aLast);
    });
}

export function ContactAdminCard() {
  const { user } = useAuth();
  const phones = getSupportPhones();
  const [message, setMessage] = React.useState("");
  const [replyDrafts, setReplyDrafts] = React.useState<Record<string, string>>({});
  const [sent, setSent] = React.useState(false);
  const [threads, setThreads] = React.useState<{ threadId: string; messages: FeedbackItem[] }[]>([]);
  const [openThreadId, setOpenThreadId] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const items = await backend.listMyFeedback();
    setThreads(groupThreads(items));
  }, []);

  React.useEffect(() => {
    refresh();
    // تحديث أهدأ: عند إظهار الصفحة فقط بدل ضغط الشبكة كل 15 ثانية
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  async function handleSend() {
    if (!message.trim() || !user) return;
    await backend.submitFeedback(user.identifier, message.trim());
    setMessage("");
    setSent(true);
    setTimeout(() => setSent(false), 2000);
    await refresh();
  }

  async function handleThreadReply(threadId: string) {
    if (!user) return;
    const text = (replyDrafts[threadId] ?? "").trim();
    if (!text) return;
    await backend.submitFeedback(user.identifier, text, threadId);
    setReplyDrafts((prev) => ({ ...prev, [threadId]: "" }));
    await refresh();
  }

  async function openThread(threadId: string) {
    setOpenThreadId((prev) => (prev === threadId ? null : threadId));
    await backend.markFeedbackThreadReadByUser(threadId);
    await refresh();
  }

  return (
    <Card>
      <CardHeader className="space-y-0">
        <CardTitle className="text-base">التواصل مع الإدارة</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          تواصل مع إدارة التطبيق مباشرة عبر واتساب أو الاتصال، أو أرسل رسالتك
          من هنا وتوصل للمالك مباشرة داخل التطبيق — ويمكنك متابعة الردود هنا.
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
            placeholder="اكتب رسالة جديدة للإدارة..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="text-right"
          />
          <Button size="icon" onClick={handleSend} disabled={!message.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {sent && <p className="text-xs font-bold text-primary">تم إرسال رسالتك للإدارة ✓</p>}

        {threads.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-xs font-bold text-muted-foreground">محادثاتك مع الإدارة</p>
            {threads.map((thread) => {
              const last = thread.messages[thread.messages.length - 1];
              const unread = thread.messages.some((m) => m.fromOwner && !m.readByUser);
              const open = openThreadId === thread.threadId;
              return (
                <div key={thread.threadId} className="rounded-xl border border-border px-3 py-2">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 text-right"
                    onClick={() => openThread(thread.threadId)}
                  >
                    <span className="text-[11px] text-muted-foreground">
                      {last ? new Date(last.createdAt).toLocaleString("ar-SA") : ""}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-bold">
                      {unread && <span className="h-2 w-2 rounded-full bg-primary" />}
                      {last?.fromOwner ? "رد من الإدارة" : "رسالتك"}
                    </span>
                  </button>
                  {!open && last && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{last.message}</p>
                  )}
                  {open && (
                    <div className="mt-2 flex flex-col gap-2">
                      {thread.messages.map((m) => (
                        <div
                          key={m.id}
                          className={`rounded-lg px-2 py-1.5 text-sm ${
                            m.fromOwner
                              ? "bg-secondary/60 text-right"
                              : "bg-primary/10 text-right"
                          }`}
                        >
                          <p className="text-[10px] font-bold text-muted-foreground">
                            {m.fromOwner ? "الإدارة" : "أنت"} ·{" "}
                            {new Date(m.createdAt).toLocaleString("ar-SA")}
                          </p>
                          <p>{m.message}</p>
                        </div>
                      ))}
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="اكتب ردك..."
                          value={replyDrafts[thread.threadId] ?? ""}
                          onChange={(e) =>
                            setReplyDrafts((prev) => ({
                              ...prev,
                              [thread.threadId]: e.target.value,
                            }))
                          }
                          className="text-right"
                        />
                        <Button
                          size="icon"
                          onClick={() => handleThreadReply(thread.threadId)}
                          disabled={!(replyDrafts[thread.threadId] ?? "").trim()}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
