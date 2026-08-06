import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { fail, failInternal, failWithCause } from "../lib/api/errors.js";
import { isMissingConfig, readAnonKey, readOwnerIdentifier, readSupabaseSecrets } from "../lib/api/env.js";
import { personalCodeMatches, serverPersonalCode } from "../lib/api/personal-code.js";

/**
 * رسالة موحّدة لأي فشل مصدره قاعدة البيانات. نص Postgres الأصلي يروح للسجل
 * فقط، لأنه يذكر أسماء الجداول والأعمدة والقيود وسياسات RLS بالاسم.
 */
const DB_FAILURE_MESSAGE = "تعذّر تنفيذ العملية. أعد المحاولة، وإن تكرر تواصل مع الإدارة.";

/** يظهر للمالك فقط، وما يذكر أسماء ملفات أو تريغرات داخلية. */
const MIGRATION_REQUIRED_MESSAGE =
  "قاعدة البيانات تحتاج تحديثًا قبل تنفيذ هذه العملية — راجع docs/DATABASE-SETUP.md.";

type Action =
  | "approve"
  | "revoke"
  | "generateCode"
  | "listCodes"
  | "redeemCode"
  | "personalCodes"
  | "replyFeedback"
  | "markFeedbackRead";

function adminClient(url: string, serviceKey: string) {
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveRequester(
  req: VercelRequest,
  url: string,
  anonKey: string,
  serviceKey: string
) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error } = await userClient.auth.getUser();
  if (error || !userData.user) return null;

  const admin = adminClient(url, serviceKey);
  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!profile) return { user: userData.user, profile: null, admin };

  // إصلاح تلقائي: حساب المالك المعرّف يجب أن يبقى is_owner
  const ownerIdent = readOwnerIdentifier();
  if (profile.identifier === ownerIdent && (!profile.is_owner || profile.status !== "approved")) {
    await admin
      .from("profiles")
      .update({ is_owner: true, status: "approved", package_name: "إدارة التطبيق" })
      .eq("id", profile.id);
    profile.is_owner = true;
    profile.status = "approved";
  }

  return { user: userData.user, profile, admin };
}

function makeCode() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `TFZ-${n}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return fail(res, 405, "method_not_allowed", "الطريقة غير مسموحة.");
  }

  const secrets = readSupabaseSecrets();
  const anonKey = readAnonKey();
  if (isMissingConfig(secrets) || !anonKey) {
    const missing = isMissingConfig(secrets) ? [...secrets.missing] : [];
    if (!anonKey) missing.push("VITE_SUPABASE_ANON_KEY");
    return fail(
      res,
      503,
      "missing_env",
      `إعدادات الخادم ناقصة (${missing.join(", ")}) — أضفها في Vercel.`
    );
  }
  const { url, serviceKey } = secrets;

  const action = (req.body?.action || "") as Action;
  const requester = await resolveRequester(req, url, anonKey, serviceKey);
  if (!requester) {
    return fail(res, 401, "unauthorized", "الجلسة منتهية. سجّل الدخول من جديد.");
  }
  const { user, profile, admin } = requester;

  try {
    if (action === "approve" || action === "revoke") {
      if (!profile?.is_owner) {
        return fail(res, 403, "owner_only", "هذه العملية متاحة للإدارة فقط.");
      }
      const userId = String(req.body?.userId || "");
      if (!userId) return fail(res, 400, "missing_userId", "لم يُحدَّد الحساب المطلوب.");

      if (action === "approve") {
        const days = Number(req.body?.days || 30);
        const packageName = String(req.body?.packageName || "الباقة الشهرية");
        const expires = new Date();
        expires.setDate(expires.getDate() + days);
        const { data, error } = await admin
          .from("profiles")
          .update({
            status: "approved",
            package_name: packageName,
            package_expires_at: expires.toISOString(),
          })
          .eq("id", userId)
          .select("id,status")
          .maybeSingle();
        if (error || !data) {
          return failWithCause(
            res,
            400,
            "approve_failed",
            DB_FAILURE_MESSAGE,
            "access-control: approve",
            error
          );
        }
        if (data.status !== "approved") {
          return fail(res, 400, "approve_blocked_by_trigger", MIGRATION_REQUIRED_MESSAGE);
        }
        return res.status(200).json({ ok: true, profile: data });
      }

      const { data, error } = await admin
        .from("profiles")
        .update({
          status: "revoked",
          package_name: "موقوف",
          package_expires_at: null,
        })
        .eq("id", userId)
        .select("id,status,package_name")
        .maybeSingle();
      if (error || !data) {
        return failWithCause(
          res,
          400,
          "revoke_failed",
          DB_FAILURE_MESSAGE,
          "access-control: revoke",
          error
        );
      }
      if (data.status !== "revoked") {
        return fail(res, 400, "revoke_blocked_by_trigger", MIGRATION_REQUIRED_MESSAGE);
      }
      return res.status(200).json({ ok: true, profile: data });
    }

    if (action === "generateCode") {
      if (!profile?.is_owner) {
        return fail(res, 403, "owner_only", "هذه العملية متاحة للإدارة فقط.");
      }
      const customRaw = String(req.body?.code || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");

      if (customRaw) {
        if (customRaw.length < 4 || customRaw.length > 24) {
          return fail(res, 400, "invalid_code_length", "الرمز اليدوي يجب أن يكون بين 4 و 24 حرفًا");
        }
        if (!/^[A-Z0-9-]+$/.test(customRaw)) {
          return fail(res, 400, "invalid_code_chars", "الرمز يقبل حروفًا إنجليزية وأرقامًا وشرطة فقط");
        }
        const code = customRaw.startsWith("TFZ-") ? customRaw : `TFZ-${customRaw.replace(/^TFZ-?/, "")}`;
        const { error } = await admin.from("activation_codes").insert({ code });
        if (error) {
          if (String(error.message || "").toLowerCase().includes("duplicate")) {
            return fail(res, 400, "duplicate_code", "هذا الرمز موجود مسبقًا — اختر رمزًا آخر");
          }
          return failWithCause(
            res,
            400,
            "code_insert_failed",
            DB_FAILURE_MESSAGE,
            "access-control: insert custom activation code",
            error
          );
        }
        return res.status(200).json({ ok: true, code });
      }

      let code = makeCode();
      for (let i = 0; i < 8; i++) {
        const { error } = await admin.from("activation_codes").insert({ code });
        if (!error) return res.status(200).json({ ok: true, code });
        if (!String(error.message || "").toLowerCase().includes("duplicate")) {
          return failWithCause(
            res,
            400,
            "code_insert_failed",
            DB_FAILURE_MESSAGE,
            "access-control: insert generated activation code",
            error
          );
        }
        code = makeCode();
      }
      return fail(res, 400, "code_collision", "تعذّر توليد رمز جديد. أعد المحاولة.");
    }

    if (action === "listCodes") {
      if (!profile?.is_owner) {
        return fail(res, 403, "owner_only", "هذه العملية متاحة للإدارة فقط.");
      }
      const { data, error } = await admin
        .from("activation_codes")
        .select("code,created_at,used_by")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        return failWithCause(
          res,
          400,
          "list_codes_failed",
          DB_FAILURE_MESSAGE,
          "access-control: listCodes",
          error
        );
      }
      return res.status(200).json({
        ok: true,
        codes: (data ?? []).map((r) => ({
          code: r.code,
          createdAt: r.created_at,
          usedBy: r.used_by,
        })),
      });
    }

    if (action === "redeemCode") {
      const raw = String(req.body?.code || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
      if (!raw) return fail(res, 400, "missing_code", "أدخل رمز التفعيل أولًا.");

      // رمز شخصي ثابت: لا يُفعّل الحساب الموقوف تلقائيًا — يحتاج موافقة المالك أو رمز يولّده المالك
      const normalizedPersonal = raw.replace(/[\s_]+/g, "-");
      if (/^TFZ-U-\d{6}$/.test(normalizedPersonal)) {
        if (profile?.status === "revoked") {
          return fail(
            res,
            403,
            "personal_code_blocked_after_revoke",
            "الحساب موقوف. إعادة التفعيل فقط من الإدارة عبر إدارة التحكم أو برمز تفعيل ترسله الإدارة."
          );
        }
        // الاشتقاق بسرّ الخادم: الصيغة القديمة كانت تُحسب من معرّف الحساب وحده
        // بخوارزمية منشورة في حزمة المتصفح، فكان أي حساب "قيد المراجعة" يفعّل
        // نفسه بدون موافقة الإدارة.
        if (!serverPersonalCode(user.id)) {
          return fail(
            res,
            503,
            "personal_code_unavailable",
            "التفعيل بالرمز الشخصي غير متاح حاليًا. اطلب من الإدارة تفعيل حسابك مباشرة."
          );
        }
        if (!personalCodeMatches(user.id, normalizedPersonal)) {
          return fail(res, 400, "invalid_personal_code", "الرمز الشخصي غير صحيح.");
        }
        const expires = new Date();
        expires.setDate(expires.getDate() + 30);
        const { data: updated, error: upErr } = await admin
          .from("profiles")
          .update({
            status: "approved",
            package_name: "مفعّل برمز شخصي",
            package_expires_at: expires.toISOString(),
          })
          .eq("id", user.id)
          .neq("status", "revoked")
          .select("id,status")
          .maybeSingle();
        if (upErr || !updated) {
          return failWithCause(
            res,
            400,
            "profile_update_failed",
            "تعذّر التفعيل بالرمز الشخصي. إن كان الحساب موقوفًا فالتفعيل من الإدارة فقط.",
            "access-control: redeem personal code",
            upErr
          );
        }
        if (updated.status !== "approved") {
          return fail(res, 400, "approve_blocked_by_trigger", MIGRATION_REQUIRED_MESSAGE);
        }
        return res.status(200).json({ ok: true, profile: updated });
      }

      const { data: codeRow, error: findErr } = await admin
        .from("activation_codes")
        .select("*")
        .eq("code", raw)
        .is("used_by", null)
        .maybeSingle();
      if (findErr) {
        return failWithCause(
          res,
          400,
          "code_lookup_failed",
          DB_FAILURE_MESSAGE,
          "access-control: activation code lookup",
          findErr
        );
      }
      if (!codeRow) {
        return fail(res, 400, "invalid_or_used", "رمز التفعيل غير صحيح أو مستخدم مسبقًا.");
      }

      const { error: useErr } = await admin
        .from("activation_codes")
        .update({ used_by: user.id })
        .eq("code", raw)
        .is("used_by", null);
      if (useErr) {
        return failWithCause(
          res,
          400,
          "code_redeem_failed",
          DB_FAILURE_MESSAGE,
          "access-control: mark activation code used",
          useErr
        );
      }

      const expires = new Date();
      expires.setDate(expires.getDate() + 30);
      const { data: updated, error: upErr } = await admin
        .from("profiles")
        .update({
          status: "approved",
          package_name: "مفعّل برمز تفعيل",
          package_expires_at: expires.toISOString(),
        })
        .eq("id", user.id)
        .select("id,status")
        .maybeSingle();
      if (upErr || !updated) {
        return failWithCause(
          res,
          400,
          "profile_update_failed",
          DB_FAILURE_MESSAGE,
          "access-control: approve after code redeem",
          upErr
        );
      }
      return res.status(200).json({ ok: true, profile: updated });
    }

    if (action === "personalCodes") {
      if (!profile?.is_owner) {
        return fail(res, 403, "owner_only", "هذه العملية متاحة للإدارة فقط.");
      }
      const ids = Array.isArray(req.body?.userIds)
        ? (req.body.userIds as unknown[]).map((x) => String(x)).filter(Boolean).slice(0, 500)
        : [];
      if (ids.length === 0) {
        return fail(res, 400, "missing_userIds", "لم تُحدَّد الحسابات المطلوبة.");
      }
      const codes: Record<string, string> = {};
      for (const id of ids) {
        const code = serverPersonalCode(id);
        if (code) codes[id] = code;
      }
      return res.status(200).json({ ok: true, codes });
    }

    if (action === "replyFeedback") {
      if (!profile?.is_owner) {
        return fail(res, 403, "owner_only", "هذه العملية متاحة للإدارة فقط.");
      }
      const threadId = String(req.body?.threadId || "").trim();
      const message = String(req.body?.message || "").trim();
      if (!threadId || !message) {
        return fail(res, 400, "missing_thread_or_message", "اكتب نص الرد أولًا.");
      }

      // دعم الرسائل القديمة: قد يكون thread_id فارغًا والـ UI يمرّر id الرسالة
      let { data: root, error: rootErr } = await admin
        .from("feedback")
        .select("id, user_id, identifier, thread_id")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (rootErr) {
        return failWithCause(
          res,
          400,
          "thread_lookup_failed",
          DB_FAILURE_MESSAGE,
          "access-control: feedback thread lookup",
          rootErr
        );
      }

      if (!root) {
        const byId = await admin
          .from("feedback")
          .select("id, user_id, identifier, thread_id")
          .eq("id", threadId)
          .maybeSingle();
        if (byId.error) {
          return failWithCause(
            res,
            400,
            "thread_lookup_failed",
            DB_FAILURE_MESSAGE,
            "access-control: feedback lookup by id",
            byId.error
          );
        }
        root = byId.data;
      }
      if (!root) return fail(res, 404, "thread_not_found", "لم تُعثر على هذه المحادثة.");

      const resolvedThreadId = (root.thread_id as string | null) || (root.id as string);
      if (!root.thread_id) {
        await admin.from("feedback").update({ thread_id: resolvedThreadId }).eq("id", root.id);
      }

      const { error: insertErr } = await admin.from("feedback").insert({
        id: crypto.randomUUID(),
        user_id: root.user_id,
        identifier: root.identifier,
        message,
        thread_id: resolvedThreadId,
        from_owner: true,
        read: true,
        read_by_user: false,
      });
      if (insertErr) {
        // نفحص نص الخطأ هنا على الخادم فقط، وما نمرّره للمتصفح
        const missingChatColumns =
          insertErr.message.includes("from_owner") || insertErr.message.includes("thread_id");
        return failWithCause(
          res,
          400,
          missingChatColumns ? "feedback_chat_migration_required" : "reply_failed",
          missingChatColumns ? MIGRATION_REQUIRED_MESSAGE : DB_FAILURE_MESSAGE,
          "access-control: insert owner reply",
          insertErr
        );
      }

      await admin
        .from("feedback")
        .update({ read: true })
        .eq("thread_id", resolvedThreadId)
        .eq("from_owner", false);

      return res.status(200).json({ ok: true, threadId: resolvedThreadId });
    }

    if (action === "markFeedbackRead") {
      if (!profile?.is_owner) {
        return fail(res, 403, "owner_only", "هذه العملية متاحة للإدارة فقط.");
      }
      const ids = Array.isArray(req.body?.ids)
        ? (req.body.ids as unknown[]).map((x) => String(x)).filter(Boolean)
        : [];
      const identifier = String(req.body?.identifier || "").trim();
      const threadId = String(req.body?.threadId || "").trim();

      if (ids.length > 0) {
        const { error } = await admin
          .from("feedback")
          .update({ read: true })
          .in("id", ids)
          .eq("from_owner", false);
        if (error) {
          return failWithCause(
            res,
            400,
            "mark_read_failed",
            DB_FAILURE_MESSAGE,
            "access-control: markFeedbackRead by ids",
            error
          );
        }
      }
      if (identifier) {
        const { error } = await admin
          .from("feedback")
          .update({ read: true })
          .eq("identifier", identifier)
          .eq("from_owner", false);
        if (error) {
          return failWithCause(
            res,
            400,
            "mark_read_failed",
            DB_FAILURE_MESSAGE,
            "access-control: markFeedbackRead by identifier",
            error
          );
        }
      }
      if (threadId) {
        await admin
          .from("feedback")
          .update({ read: true })
          .eq("thread_id", threadId)
          .eq("from_owner", false);
        await admin
          .from("feedback")
          .update({ read: true })
          .eq("id", threadId)
          .eq("from_owner", false);
      }
      if (!ids.length && !identifier && !threadId) {
        return fail(res, 400, "missing_target", "لم تُحدَّد الرسائل المطلوبة.");
      }
      return res.status(200).json({ ok: true });
    }

    return fail(res, 400, "unknown_action", "طلب غير معروف.");
  } catch (e) {
    return failInternal(res, `access-control: ${action}`, e);
  }
}
