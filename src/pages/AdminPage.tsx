import * as React from "react";
import {
  ArrowRight,
  Check,
  Ban,
  ShieldCheck,
  MessageSquare,
  Megaphone,
  AlertTriangle,
  Sparkles,
  Phone,
  KeyRound,
  Copy,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { backend } from "@/lib/backend";
import { AppUser, FeedbackItem, ErrorReportItem, ActivationCode } from "@/lib/backend-types";
import { getSupportPhones, setSupportPhones, SupportPhone } from "@/lib/support-contact";

const STATUS_LABEL: Record<AppUser["status"], string> = {
  pending: "قيد المراجعة",
  approved: "مفعّل",
  revoked: "موقوف",
};

type AdminTab = "subscribers" | "feedback" | "broadcast" | "errors" | "codes" | "settings";

export default function AdminPage({ onBack }: { onBack?: () => void }) {
  const [tab, setTab] = React.useState<AdminTab>("subscribers");
  const [users, setUsers] = React.useState<AppUser[]>([]);
  const [feedback, setFeedback] = React.useState<FeedbackItem[]>([]);
  const [errors, setErrors] = React.useState<ErrorReportItem[]>([]);
  const [codes, setCodes] = React.useState<ActivationCode[]>([]);
  const [broadcastText, setBroadcastText] = React.useState("");
  const [phones, setPhones] = React.useState<SupportPhone[]>(getSupportPhones());
  const [replyDrafts, setReplyDrafts] = React.useState<Record<string, string>>({});
  const [openThreadId, setOpenThreadId] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setUsers(await backend.listUsers());
    setFeedback(await backend.listFeedback());
    setErrors(await backend.listErrors());
    setCodes(await backend.listActivationCodes());
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  // تحديث دوري بسيط حتى يشوف المالك حالة "نشِط الآن" وهو مفتوح على الشاشة
  React.useEffect(() => {
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const unreadFeedback = feedback.filter((f) => !f.fromOwner && !f.read).length;

  const feedbackThreads = React.useMemo(() => {
    // محادثة واحدة لكل مستخدم — حتى لو تفرّقت thread_id قديمًا
    const map = new Map<string, FeedbackItem[]>();
    for (const item of feedback) {
      const key = (item.userId || item.identifier || item.threadId).trim();
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([key, messages]) => {
        const sorted = messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const threadId = sorted[0]?.threadId || key;
        return {
          key,
          threadId,
          identifier: sorted[0]?.identifier ?? "",
          messages: sorted,
        };
      })
      .sort((a, b) => {
        const aLast = a.messages[a.messages.length - 1]?.createdAt ?? "";
        const bLast = b.messages[b.messages.length - 1]?.createdAt ?? "";
        return bLast.localeCompare(aLast);
      });
  }, [feedback]);
  const unresolvedErrors = errors.filter((e) => !e.resolved).length;
  const pendingUsers = users.filter((u) => u.status === "pending").length;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-28 pt-4">
      <header className="flex items-center gap-2 py-2">
        {onBack && (
          <button onClick={onBack} className="text-muted-foreground">
            <ArrowRight className="h-5 w-5" />
          </button>
        )}
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-black">إدارة التحكم</h1>
      </header>

      {/* ملخص سريع */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryPill label="طلبات جديدة" value={pendingUsers} />
        <SummaryPill label="ملاحظات جديدة" value={unreadFeedback} />
        <SummaryPill label="أخطاء غير محلولة" value={unresolvedErrors} />
      </div>

      <div className="flex flex-wrap gap-1 rounded-full border border-border bg-muted p-1 text-xs">
        {(
          [
            { key: "subscribers", label: "المشتركون" },
            { key: "feedback", label: "الملاحظات" },
            { key: "broadcast", label: "رسالة عامة" },
            { key: "errors", label: "الأخطاء" },
            { key: "codes", label: "رموز التفعيل" },
            { key: "settings", label: "الإعدادات" },
          ] as { key: AdminTab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3 py-2 font-bold transition-colors ${
              tab === t.key ? "bg-secondary text-primary" : "text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "subscribers" && (
        <div className="flex flex-col gap-3">
          {users.length === 0 && <p className="text-sm text-muted-foreground">لا يوجد مشتركون بعد.</p>}
          {users.map((u) => (
            <Card key={u.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <Badge
                  variant={
                    u.status === "approved" ? "default" : u.status === "pending" ? "secondary" : "destructive"
                  }
                >
                  {STATUS_LABEL[u.status]}
                </Badge>
                <CardTitle className="text-sm" dir="ltr">
                  {u.identifier}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {(u.fullName || u.city) && (
                  <p className="text-sm font-bold">
                    {u.fullName}
                    {u.fullName && u.city && " — "}
                    {u.city}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {u.isOwner ? "مالك التطبيق" : u.packageName ? `الباقة: ${u.packageName}` : "بدون باقة بعد"}
                </p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isOnline(u.lastSeenAt) ? "bg-emerald-500" : "bg-muted-foreground/40"
                    }`}
                  />
                  {isOnline(u.lastSeenAt)
                    ? "نشِط الآن"
                    : u.lastSeenAt
                    ? `آخر نشاط: ${new Date(u.lastSeenAt).toLocaleString("ar-SA")}`
                    : "لم يدخل بعد"}
                </p>
                {!u.isOwner && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={async () => {
                        await backend.approveUser(u.id, "الباقة الشهرية", 30);
                        refresh();
                      }}
                    >
                      <Check className="h-4 w-4" />
                      موافقة (30 يوم)
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1"
                      onClick={async () => {
                        await backend.revokeUser(u.id);
                        refresh();
                      }}
                    >
                      <Ban className="h-4 w-4" />
                      إيقاف
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "feedback" && (
        <div className="flex flex-col gap-3">
          {feedbackThreads.length === 0 && (
            <p className="text-sm text-muted-foreground">لا توجد ملاحظات بعد.</p>
          )}
          {feedbackThreads.map((thread) => {
            const last = thread.messages[thread.messages.length - 1];
            const hasUnread = thread.messages.some((m) => !m.fromOwner && !m.read);
            const open = openThreadId === thread.key;
            return (
              <Card key={thread.key}>
                <CardContent className="flex flex-col gap-2 pt-4">
                  <button
                    type="button"
                    className="flex w-full flex-col gap-1 text-right"
                    onClick={async () => {
                      const nextOpen = open ? null : thread.key;
                      setOpenThreadId(nextOpen);
                      if (!open) {
                        // تحديث فوري للواجهة حتى تختفي «ملاحظات جديدة» مباشرة
                        const unreadIds = thread.messages
                          .filter((m) => !m.fromOwner && !m.read)
                          .map((m) => m.id);
                        if (unreadIds.length > 0) {
                          setFeedback((prev) =>
                            prev.map((m) =>
                              unreadIds.includes(m.id) ||
                              (!m.fromOwner && m.identifier === thread.identifier)
                                ? { ...m, read: true }
                                : m
                            )
                          );
                          try {
                            await backend.markOwnerConversationRead({
                              ids: unreadIds,
                              identifier: thread.identifier,
                              threadId: thread.threadId,
                            });
                          } catch {
                            // ignore — الحالة المحلية محدّثة
                          }
                        }
                        await refresh();
                      }
                    }}
                  >
                    <span className="flex w-full items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {last ? new Date(last.createdAt).toLocaleString("ar-SA") : ""}
                      </span>
                      <span className="flex items-center gap-1 text-sm font-bold" dir="ltr">
                        {hasUnread && <span className="h-2 w-2 rounded-full bg-primary" />}
                        <MessageSquare className="h-4 w-4 text-primary" />
                        {thread.identifier}
                      </span>
                    </span>
                    {!open && last && (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-bold text-foreground">
                          {last.fromOwner ? "أنت: " : "المستخدم: "}
                        </span>
                        {last.message}
                      </p>
                    )}
                  </button>

                  {open && (
                    <>
                      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                        {thread.messages.map((m) => (
                          <div
                            key={m.id}
                            className={`rounded-lg px-2 py-1.5 text-sm ${
                              m.fromOwner ? "bg-primary/10 text-right" : "bg-secondary/60 text-right"
                            }`}
                          >
                            <p className="text-[10px] font-bold text-muted-foreground">
                              {m.fromOwner ? "أنت (الإدارة)" : "المستخدم"} ·{" "}
                              {new Date(m.createdAt).toLocaleString("ar-SA")}
                            </p>
                            <p>{m.message}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="اكتب ردك للمستخدم..."
                          value={replyDrafts[thread.key] ?? ""}
                          onChange={(e) =>
                            setReplyDrafts((prev) => ({
                              ...prev,
                              [thread.key]: e.target.value,
                            }))
                          }
                          className="text-right"
                        />
                        <Button
                          size="icon"
                          disabled={!(replyDrafts[thread.key] ?? "").trim()}
                          onClick={async () => {
                            const text = (replyDrafts[thread.key] ?? "").trim();
                            if (!text) return;
                            try {
                              await backend.replyToFeedback(thread.threadId, text);
                              setReplyDrafts((prev) => ({ ...prev, [thread.key]: "" }));
                              setOpenThreadId(thread.key);
                              await refresh();
                            } catch (err) {
                              window.alert(
                                err instanceof Error ? err.message : "تعذّر إرسال الرد"
                              );
                            }
                          }}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}


      {tab === "broadcast" && (
        <Card>
          <CardHeader className="space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4 text-primary" />
              إرسال رسالة عامة لكل المستخدمين
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Input
              placeholder="اكتب رسالتك..."
              value={broadcastText}
              onChange={(e) => setBroadcastText(e.target.value)}
              className="text-right"
            />
            <Button
              disabled={!broadcastText.trim()}
              onClick={async () => {
                await backend.sendBroadcast(broadcastText.trim());
                setBroadcastText("");
              }}
            >
              إرسال للجميع
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === "errors" && (
        <div className="flex flex-col gap-3">
          <Card className="border-primary/30 bg-secondary/30">
            <CardContent className="flex items-start gap-2 pt-4 text-xs text-muted-foreground">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                هذه قائمة الأخطاء التي يسجّلها التطبيق تلقائيًا عند حدوث مشكلة فنية.
                حاليًا تُعرض هنا كما هي ليطّلع عليها المالك؛ ربط "معالج ذكي" يحلل
                السبب تلقائيًا يحتاج خدمة ذكاء اصطناعي متصلة بالخادم (نفس فكرة
                api/recognize-plate.ts) — أخبرني إن رغبت أفعّلها.
              </span>
            </CardContent>
          </Card>
          {errors.length === 0 && <p className="text-sm text-muted-foreground">لا توجد أخطاء مسجّلة 🎉</p>}
          {errors.map((e) => (
            <Card key={e.id}>
              <CardContent className="flex flex-col gap-2 pt-4">
                <div className="flex items-center justify-between">
                  <Badge variant={e.resolved ? "secondary" : "destructive"}>
                    {e.resolved ? "تم الحل" : "غير محلول"}
                  </Badge>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <AlertTriangle className="h-3 w-3" />
                    {new Date(e.createdAt).toLocaleString("ar-SA")}
                  </span>
                </div>
                <p className="text-sm font-bold">{e.message}</p>
                {e.context && <p className="text-xs text-muted-foreground">{e.context}</p>}
                {!e.resolved && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await backend.resolveError(e.id);
                      refresh();
                    }}
                  >
                    وضع كمحلول
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "codes" && (
        <div className="flex flex-col gap-3">
          <Card className="border-primary/30 bg-secondary/30">
            <CardContent className="flex items-start gap-2 pt-4 text-xs text-muted-foreground">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                ولّد رمزًا وأعطه لمستخدم مباشرة (مكالمة، واتساب، شخصيًا) — يدخله
                في شاشة "قيد المراجعة" عنده فيتفعّل حسابه فورًا بدون انتظار.
              </span>
            </CardContent>
          </Card>

          <Button
            onClick={async () => {
              await backend.generateActivationCode();
              refresh();
            }}
          >
            <KeyRound className="h-4 w-4" />
            توليد رمز تفعيل جديد
          </Button>

          {codes.length === 0 && <p className="text-sm text-muted-foreground">لا توجد رموز بعد.</p>}
          {codes.map((c) => (
            <Card key={c.code}>
              <CardContent className="flex items-center justify-between pt-4">
                <Badge variant={c.usedBy ? "secondary" : "default"}>
                  {c.usedBy ? "مستخدَم" : "متاح"}
                </Badge>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black" dir="ltr">
                    {c.code}
                  </span>
                  <button
                    onClick={() => navigator.clipboard?.writeText(c.code).catch(() => {})}
                    className="text-muted-foreground hover:text-primary"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "settings" && (
        <Card>
          <CardHeader className="space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Phone className="h-4 w-4 text-primary" />
              أرقام التواصل الظاهرة للمستخدمين
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {phones.map((p, i) => (
              <div key={i} className="flex flex-col gap-1">
                <Input
                  placeholder="اسم الرقم (مثال: التواصل الأول)"
                  value={p.label}
                  onChange={(e) => {
                    const next = [...phones];
                    next[i] = { ...next[i], label: e.target.value };
                    setPhones(next);
                  }}
                  className="text-right"
                />
                <div className="flex gap-2">
                  <Input
                    placeholder="9665xxxxxxxx (بدون + وبدون 00)"
                    value={p.phone}
                    onChange={(e) => {
                      const next = [...phones];
                      next[i] = { ...next[i], phone: e.target.value };
                      setPhones(next);
                    }}
                    className="text-right"
                    dir="ltr"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => setPhones(phones.filter((_, idx) => idx !== i))}
                  >
                    <Ban className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              onClick={() => setPhones([...phones, { label: "رقم جديد", phone: "" }])}
            >
              + إضافة رقم تواصل
            </Button>

            <Button onClick={() => setSupportPhones(phones)}>حفظ الأرقام</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 2 * 60_000;
}

function SummaryPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl bg-secondary/50 px-2 py-3 text-primary">
      <span className="text-xl font-black">{value}</span>
      <span className="text-center text-[11px] font-bold leading-tight">{label}</span>
    </div>
  );
}
