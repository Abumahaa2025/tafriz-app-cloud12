import * as React from "react";
import { ChevronDown, MessageCircle, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { backend } from "@/lib/backend";
import { FeedbackItem } from "@/lib/backend-types";
import { getSupportPhones } from "@/lib/support-contact";
import { useAuth } from "@/context/AuthContext";
import { ensureNotificationPermission } from "@/lib/feedback-notify";

/** محادثة واحدة مستمرة للمستخدم — تدمج الرسائل القديمة إن تفرّقت thread_id */
function groupAsOneConversation(items: FeedbackItem[]): {
  threadId: string;
  messages: FeedbackItem[];
}[] {
  if (items.length === 0) return [];
  const messages = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const threadId = messages[0]?.threadId || messages[0].id;
  return [{ threadId, messages }];
}

export function ContactAdminCard() {
  const { user } = useAuth();
  const phones = getSupportPhones();
  const [message, setMessage] = React.useState("");
  const [replyDrafts, setReplyDrafts] = React.useState<Record<string, string>>({});
  const [sent, setSent] = React.useState(false);
  const [threads, setThreads] = React.useState<{ threadId: string; messages: FeedbackItem[] }[]>(
    []
  );
  /** null = منسدلة مغلقة */
  const [openThreadId, setOpenThreadId] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const items = await backend.listMyFeedback();
    const grouped = groupAsOneConversation(items);
    setThreads(grouped);
    // لا نفتح المحادثة تلقائيًا — تبقى منسدلة حتى يضغط المستخدم
    setOpenThreadId((prev) => {
      if (!prev) return null;
      return grouped.some((t) => t.threadId === prev) ? prev : null;
    });
  }, []);

  React.useEffect(() => {
    refresh();
    ensureNotificationPermission().catch(() => {});
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    const interval = setInterval(refresh, 12_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(interval);
    };
  }, [refresh]);

  async function handleSend() {
    if (!message.trim() || !user) return;
    const existingThreadId = threads[0]?.threadId;
    await backend.submitFeedback(user.identifier, message.trim(), existingThreadId);
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
    setOpenThreadId(threadId);
  }

  async function toggleThread(threadId: string) {
    if (openThreadId === threadId) {
      setOpenThreadId(null);
      return;
    }
    setOpenThreadId(threadId);
    await backend.markFeedbackThreadReadByUser(threadId);
    await refresh();
    setOpenThreadId(threadId);
  }

  return (
    <Card>
      <CardHeader className="space-y-0">
        <CardTitle className="text-base">التواصل مع الإدارة</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          تواصل مع الإدارة عبر واتساب أو مباشرة من داخل التطبيق — أرسل طلب إذن أو رمز
          تفعيل أو أي رسالة، وتصل للمالك في إدارة التحكم.
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
            </div>
          ))}
        </div>

        <p className="text-[11px] font-bold text-muted-foreground">التواصل عبر التطبيق</p>

        <div className="flex items-center gap-2">
          <Input
            placeholder="اكتب رسالة للإدارة (نفس المحادثة)..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            className="text-right"
          />
          <Button size="icon" onClick={handleSend} disabled={!message.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {sent && <p className="text-xs font-bold text-primary">تم إرسال رسالتك للإدارة ✓</p>}

        {threads.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-xs font-bold text-muted-foreground">محادثتك مع الإدارة</p>
            {threads.map((thread) => {
              const last = thread.messages[thread.messages.length - 1];
              const unread = thread.messages.some((m) => m.fromOwner && !m.readByUser);
              const open = openThreadId === thread.threadId;
              return (
                <div key={thread.threadId} className="rounded-xl border border-border px-3 py-2">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 text-right"
                    onClick={() => toggleThread(thread.threadId)}
                    aria-expanded={open}
                  >
                    <ChevronDown
                      className={
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform " +
                        (open ? "rotate-180" : "")
                      }
                    />
                    <span className="flex min-w-0 flex-1 flex-col items-end gap-0.5">
                      <span className="flex items-center gap-1 text-xs font-bold">
                        {unread && <span className="h-2 w-2 rounded-full bg-primary" />}
                        محادثة مع الإدارة
                        <span className="font-normal text-muted-foreground">
                          ({thread.messages.length})
                        </span>
                      </span>
                      {!open && last && (
                        <span className="line-clamp-1 w-full text-[11px] text-muted-foreground">
                          {last.fromOwner ? "الإدارة: " : "أنت: "}
                          {last.message}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {last ? new Date(last.createdAt).toLocaleString("ar-SA") : ""}
                      </span>
                    </span>
                  </button>

                  {open && (
                    <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
                      <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
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
                      </div>
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
