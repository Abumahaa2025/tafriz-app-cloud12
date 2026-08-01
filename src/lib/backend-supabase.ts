import { supabase } from "./supabase-client";
import { OWNER_IDENTIFIER } from "./owner-config";
import {
  AppUser,
  Backend,
  BackendError,
  BroadcastItem,
  ErrorReportItem,
  FeedbackItem,
  ActivationCode,
  IdentifierType,
  UploadedSheetEntry,
  UploadSearchHit,
  SortHistoryEntry,
  SortHistorySearchHit,
} from "./backend-types";

// Supabase Auth يحتاج بريدًا إلكترونيًا دائمًا حتى لتسجيل الدخول برقم جوال —
// بدل ما نفعّل رسائل SMS (خدمة مدفوعة منفصلة)، نولّد بريدًا وهميًا ثابتًا من
// نفس الرقم فقط لأغراض المصادقة الداخلية، ونخزّن الرقم الحقيقي في العمود
// identifier بجدول profiles ونعرضه دائمًا للمستخدم، لا البريد الوهمي أبدًا.
function toAuthEmail(type: IdentifierType, identifier: string): string {
  if (type === "email") return identifier.trim().toLowerCase();
  const digits = identifier.replace(/\D/g, "");
  // Supabase Auth يرفض بعض العناوين ذات الجزء المحلي الرقمي فقط
  // (مثل 0575...@...) — نضيف بادئة ثابتة ليبقى البريد صالحًا شكليًا.
  // الرقم الحقيقي يبقى في profiles.identifier ويُعرض للمستخدم كما هو.
  return `phone${digits}@users.tafriz.app`;
}

/** صيغ البريد الداخلي المحتملة من المحاولات السابقة + الصيغة الحالية */
function authEmailCandidates(type: IdentifierType, identifier: string): string[] {
  if (type === "email") return [identifier.trim().toLowerCase()];
  const digits = identifier.replace(/\D/g, "");
  return [
    `phone${digits}@users.tafriz.app`,
    `${digits}@phone.tafriz.app`,
    `phone${digits}@phone.tafriz.app`,
  ];
}

function mapAuthError(message: string): BackendError {
  const msg = message.toLowerCase();
  if (msg.includes("email not confirmed") || msg.includes("not confirmed")) {
    return new BackendError(
      "not_allowed",
      "الحساب موجود لكن غير مفعّل. عطّل Confirm email في Supabase أو أنشئ الحساب من جديد بعد ضبط المفتاح الخادمي."
    );
  }
  if (msg.includes("rate limit")) {
    return new BackendError(
      "unknown",
      "تم تجاوز حد التسجيل مؤقتًا. استخدم تبويب تسجيل الدخول، أو انتظر دقيقة ثم أعد المحاولة."
    );
  }
  if (msg.includes("invalid") || msg.includes("credentials")) {
    return new BackendError("bad_password", "رقم الجوال/البريد أو كلمة المرور غير صحيحة");
  }
  return new BackendError("unknown", message || "تعذّر إتمام العملية");
}

async function ensureProfile(
  db: NonNullable<typeof supabase>,
  userId: string,
  identifierType: IdentifierType,
  identifier: string,
  profile?: { fullName?: string; city?: string }
): Promise<AppUser> {
  const isDesignatedOwner = OWNER_IDENTIFIER ? identifier === OWNER_IDENTIFIER : false;
  const { error: upsertError } = await db.from("profiles").upsert(
    {
      id: userId,
      identifier_type: identifierType,
      identifier,
      status: isDesignatedOwner ? "approved" : "pending",
      is_owner: isDesignatedOwner,
      full_name: profile?.fullName || null,
      city: profile?.city || null,
      package_name: isDesignatedOwner ? "مالك التطبيق" : null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (upsertError) throw new BackendError("unknown", upsertError.message);

  const { data, error } = await db.from("profiles").select("*").eq("id", userId).single();
  if (error || !data) throw new BackendError("unknown", "تعذّر تحميل بيانات الحساب");
  return rowToUser(data as ProfileRow);
}

// حد أمان لحجم كل رفعة (حتى مع Postgres الحقيقي، إرسال مئات الآلاف من
// الصفوف بطلب واحد ثقيل جدًا على الشبكة) — أعلى بكثير من حد التخزين المحلي
// لأن قاعدة بيانات حقيقية تتحمل أكثر بكثير من localStorage.
const MAX_ROWS_PER_UPLOAD = 20000;

function requireClient() {
  if (!supabase) throw new BackendError("unknown", "Supabase غير مهيّأ — تحقق من متغيرات البيئة");
  return supabase;
}

async function accessToken(): Promise<string> {
  const db = requireClient();
  const { data, error } = await db.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new BackendError("not_allowed", "سجّل الدخول أولًا");
  return token;
}

async function callAccessControl<T = { ok: boolean }>(
  action: string,
  body: Record<string, unknown>
): Promise<T> {
  const token = await accessToken();
  const resp = await fetch("/api/access-control", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...body }),
  });
  const json = (await resp.json().catch(() => ({}))) as T & { error?: string };
  if (!resp.ok) {
    throw new BackendError("unknown", json.error || `access_control_${resp.status}`);
  }
  return json;
}

interface ProfileRow {
  id: string;
  identifier_type: IdentifierType;
  identifier: string;
  status: AppUser["status"];
  is_owner: boolean;
  created_at: string;
  package_name: string | null;
  package_expires_at: string | null;
  last_seen_at: string | null;
  full_name: string | null;
  city: string | null;
}

function rowToUser(row: ProfileRow): AppUser {
  return {
    id: row.id,
    identifierType: row.identifier_type,
    identifier: row.identifier,
    status: row.status,
    isOwner: row.is_owner,
    createdAt: row.created_at,
    packageName: row.package_name,
    packageExpiresAt: row.package_expires_at,
    lastSeenAt: row.last_seen_at,
    fullName: row.full_name,
    city: row.city,
  };
}

export const supabaseBackend: Backend = {
  name: "supabase",

  async signUp(identifierType, identifier, password, profile) {
    const db = requireClient();
    const authEmail = toAuthEmail(identifierType, identifier);

    // المسار المفضّل: إنشاء مؤكَّد عبر API الخادمي (بدون إيميل تأكيد)
    try {
      const resp = await fetch("/api/auth-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifierType, identifier, password, profile }),
      });
      if (resp.ok) {
        const { error: inErr } = await db.auth.signInWithPassword({ email: authEmail, password });
        if (inErr) throw mapAuthError(inErr.message);
        const user = await this.getCurrentUser();
        if (!user) throw new BackendError("unknown", "تعذّر تحميل بيانات الحساب بعد إنشائه");
        return user;
      }
      // 503 = لا يوجد service role بعد — نكمل بالمسار القديم
      if (resp.status !== 503) {
        const body = (await resp.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new BackendError("unknown", body.message || body.error || "تعذّر إنشاء الحساب");
      }
    } catch (err) {
      if (err instanceof BackendError) throw err;
      // تجاهل أخطاء الشبكة على الـ API وجرّب المسار المحلي لـ Auth
    }

    // مسار احتياطي (بدون service role): signup ثم sign-in
    const { data, error } = await db.auth.signUp({
      email: authEmail,
      password,
      options: { emailRedirectTo: undefined },
    });

    if (error || !data.user) {
      const msg = (error?.message ?? "").toLowerCase();
      const recoverable =
        msg.includes("rate limit") ||
        msg.includes("already") ||
        msg.includes("registered") ||
        msg.includes("exists");
      if (!recoverable) throw mapAuthError(error?.message ?? "تعذّر إنشاء الحساب");

      // محاولة دخول بكل الصيغ المحتملة
      let signedInId: string | null = null;
      let lastErr = error?.message ?? "";
      for (const email of authEmailCandidates(identifierType, identifier)) {
        const { data: inData, error: inErr } = await db.auth.signInWithPassword({
          email,
          password,
        });
        if (!inErr && inData.user) {
          signedInId = inData.user.id;
          break;
        }
        if (inErr) lastErr = inErr.message;
      }
      if (!signedInId) throw mapAuthError(lastErr);
      return ensureProfile(db, signedInId, identifierType, identifier, profile);
    }

    if (!data.session) {
      const { error: inErr } = await db.auth.signInWithPassword({ email: authEmail, password });
      if (inErr) throw mapAuthError(inErr.message);
    }

    return ensureProfile(db, data.user.id, identifierType, identifier, profile);
  },

  async signIn(identifierType, identifier, password) {
    const db = requireClient();
    let lastErr = "البريد/الجوال أو كلمة المرور غير صحيحة";

    for (const email of authEmailCandidates(identifierType, identifier)) {
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (!error && data.user) {
        // إن وُجدت جلسة بدون صف في profiles نُنشئه الآن (حالات signup الناقصة)
        const existing = await this.getCurrentUser();
        if (existing) return existing;
        return ensureProfile(db, data.user.id, identifierType, identifier);
      }
      if (error) lastErr = error.message;
    }

    throw mapAuthError(lastErr);
  },

  async signOut() {
    await requireClient().auth.signOut();
  },

  async getCurrentUser() {
    const db = requireClient();
    const { data: sessionData } = await db.auth.getSession();
    const authUser = sessionData.session?.user;
    if (!authUser) return null;

    const { data, error } = await db.from("profiles").select("*").eq("id", authUser.id).single();
    if (error || !data) return null;
    return rowToUser(data as ProfileRow);
  },

  async changePassword(newPassword) {
    const { error } = await requireClient().auth.updateUser({ password: newPassword });
    if (error) throw new BackendError("unknown", error.message);
  },

  async listUsers() {
    const { data, error } = await requireClient()
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new BackendError("unknown", error.message);
    return (data as ProfileRow[]).map(rowToUser);
  },

  async approveUser(id, packageName, days) {
    await callAccessControl("approve", { userId: id, packageName, days });
  },

  async revokeUser(id) {
    await callAccessControl("revoke", { userId: id });
  },

  async submitFeedback(identifier, message) {
    const db = requireClient();
    const { data: sessionData } = await db.auth.getSession();
    const uid = sessionData.session?.user.id;
    const { error } = await db.from("feedback").insert({ user_id: uid, identifier, message });
    if (error) throw new BackendError("unknown", error.message);
  },

  async listFeedback() {
    const { data, error } = await requireClient()
      .from("feedback")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new BackendError("unknown", error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      identifier: r.identifier,
      message: r.message,
      createdAt: r.created_at,
      read: r.read,
    })) as FeedbackItem[];
  },

  async markFeedbackRead(id) {
    const { error } = await requireClient().from("feedback").update({ read: true }).eq("id", id);
    if (error) throw new BackendError("unknown", error.message);
  },

  async sendBroadcast(message) {
    const { error } = await requireClient().from("broadcasts").insert({ message });
    if (error) throw new BackendError("unknown", error.message);
  },

  async listBroadcasts() {
    const { data, error } = await requireClient()
      .from("broadcasts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new BackendError("unknown", error.message);
    return (data ?? []).map((r) => ({ id: r.id, message: r.message, createdAt: r.created_at })) as BroadcastItem[];
  },

  async logError(message, context) {
    const { error } = await requireClient()
      .from("error_reports")
      .insert({ message, context: context ?? null });
    if (error) throw new BackendError("unknown", error.message);
  },

  async listErrors() {
    const { data, error } = await requireClient()
      .from("error_reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new BackendError("unknown", error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      message: r.message,
      context: r.context,
      createdAt: r.created_at,
      resolved: r.resolved,
    })) as ErrorReportItem[];
  },

  async resolveError(id) {
    const { error } = await requireClient().from("error_reports").update({ resolved: true }).eq("id", id);
    if (error) throw new BackendError("unknown", error.message);
  },

  async touchLastSeen() {
    const db = requireClient();
    const { data: sessionData } = await db.auth.getSession();
    const uid = sessionData.session?.user.id;
    if (!uid) return;
    await db.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", uid);
  },

  async generateActivationCode() {
    const result = await callAccessControl<{ code: string }>("generateCode", {});
    return result.code;
  },

  async listActivationCodes() {
    const { data, error } = await requireClient()
      .from("activation_codes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new BackendError("unknown", error.message);
    return (data ?? []).map((r) => ({
      code: r.code,
      createdAt: r.created_at,
      usedBy: r.used_by,
    })) as ActivationCode[];
  },

  async redeemActivationCode(code) {
    try {
      await callAccessControl("redeemCode", { code });
      return true;
    } catch {
      return false;
    }
  },

  async saveUpload(fileName, headers, rows) {
    const db = requireClient();
    const { data: sessionData } = await db.auth.getSession();
    const uid = sessionData.session?.user.id;
    if (!uid) throw new BackendError("not_allowed", "سجّل الدخول أولًا");

    const truncated = rows.length > MAX_ROWS_PER_UPLOAD;
    const { error } = await db.from("uploaded_sheets").insert({
      user_id: uid,
      file_name: fileName,
      headers,
      rows: truncated ? rows.slice(0, MAX_ROWS_PER_UPLOAD) : rows,
      truncated,
      total_rows_in_file: rows.length,
    });
    if (error) throw new BackendError("unknown", error.message);
  },

  async listUploads() {
    const { data, error } = await requireClient()
      .from("uploaded_sheets")
      .select("*")
      .order("uploaded_at", { ascending: false })
      .limit(50);
    if (error) throw new BackendError("unknown", error.message);
    return (data ?? []).map(
      (r): UploadedSheetEntry => ({
        id: r.id,
        fileName: r.file_name,
        uploadedAt: r.uploaded_at,
        headers: r.headers,
        rows: r.rows,
        truncated: r.truncated,
        totalRowsInFile: r.total_rows_in_file,
      })
    );
  },

  // ملاحظة: البحث يجلب الصفوف المتاحة للمستخدم (حسب RLS) ثم يفلترها بالمتصفح
  // — مناسب لحجم ~100 مستخدم؛ لو كبر المشروع كثيرًا لاحقًا، الأفضل ينتقل
  // للبحث داخل SQL مباشرة (full-text search على عمود rows).
  async searchUploads(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const uploads = await this.listUploads();
    const hits: UploadSearchHit[] = [];
    for (const entry of uploads) {
      for (const row of entry.rows) {
        if (Object.values(row).some((v) => String(v).toLowerCase().includes(q))) {
          hits.push({ entry, row });
        }
      }
    }
    return hits;
  },

  async saveSortHistoryEntry(entry) {
    const db = requireClient();
    const { data: sessionData } = await db.auth.getSession();
    const uid = sessionData.session?.user.id;
    if (!uid) throw new BackendError("not_allowed", "سجّل الدخول أولًا");

    const { error } = await db.from("sort_history").insert({
      user_id: uid,
      data_file_name: entry.dataFileName,
      referral_file_name: entry.referralFileName,
      unsorted_count: entry.unsortedCount,
      distinct_matched_plates: entry.distinctMatchedPlates,
      matched_rows: entry.matchedRows,
    });
    if (error) throw new BackendError("unknown", error.message);
  },

  async listSortHistory() {
    const { data, error } = await requireClient()
      .from("sort_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new BackendError("unknown", error.message);
    return (data ?? []).map(
      (r): SortHistoryEntry => ({
        id: r.id,
        createdAt: r.created_at,
        dataFileName: r.data_file_name,
        referralFileName: r.referral_file_name,
        unsortedCount: r.unsorted_count,
        distinctMatchedPlates: r.distinct_matched_plates,
        matchedRows: r.matched_rows,
      })
    );
  },

  async searchSortHistory(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const history = await this.listSortHistory();
    const hits: SortHistorySearchHit[] = [];
    for (const entry of history) {
      for (const row of entry.matchedRows) {
        if (row.plate.toLowerCase().includes(q) || row.street.toLowerCase().includes(q)) {
          hits.push({ entry, row });
        }
      }
    }
    return hits;
  },
};
