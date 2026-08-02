import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

type Action =
  | "approve"
  | "revoke"
  | "generateCode"
  | "listCodes"
  | "redeemCode"
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
  const ownerIdent = (process.env.OWNER_IDENTIFIER || "0575051487").trim();
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
    return res.status(405).json({ error: "Method not allowed" });
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !anonKey) {
    return res.status(503).json({ error: "missing_env" });
  }

  const action = (req.body?.action || "") as Action;
  const requester = await resolveRequester(req, url, anonKey, serviceKey);
  if (!requester) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const { user, profile, admin } = requester;

  try {
    if (action === "approve" || action === "revoke") {
      if (!profile?.is_owner) {
        return res.status(403).json({ error: "owner_only" });
      }
      const userId = String(req.body?.userId || "");
      if (!userId) return res.status(400).json({ error: "missing_userId" });

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
          return res.status(400).json({ error: error?.message || "approve_failed" });
        }
        if (data.status !== "approved") {
          return res.status(400).json({
            error:
              "approve_blocked_by_trigger — نفّذ supabase/migrate-fix-revoke-trigger.sql في Supabase",
          });
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
        return res.status(400).json({ error: error?.message || "revoke_failed" });
      }
      if (data.status !== "revoked") {
        return res.status(400).json({
          error:
            "revoke_blocked_by_trigger — نفّذ supabase/migrate-fix-revoke-trigger.sql في Supabase",
        });
      }
      return res.status(200).json({ ok: true, profile: data });
    }

    if (action === "generateCode") {
      if (!profile?.is_owner) {
        return res.status(403).json({ error: "owner_only" });
      }
      const customRaw = String(req.body?.code || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");

      if (customRaw) {
        if (customRaw.length < 4 || customRaw.length > 24) {
          return res.status(400).json({
            error: "invalid_code_length",
            message: "الرمز اليدوي يجب أن يكون بين 4 و 24 حرفًا",
          });
        }
        if (!/^[A-Z0-9-]+$/.test(customRaw)) {
          return res.status(400).json({
            error: "invalid_code_chars",
            message: "الرمز يقبل حروفًا إنجليزية وأرقامًا وشرطة فقط",
          });
        }
        const code = customRaw.startsWith("TFZ-") ? customRaw : `TFZ-${customRaw.replace(/^TFZ-?/, "")}`;
        const { error } = await admin.from("activation_codes").insert({ code });
        if (error) {
          if (String(error.message || "").toLowerCase().includes("duplicate")) {
            return res.status(400).json({
              error: "duplicate_code",
              message: "هذا الرمز موجود مسبقًا — اختر رمزًا آخر",
            });
          }
          return res.status(400).json({ error: error.message });
        }
        return res.status(200).json({ ok: true, code });
      }

      let code = makeCode();
      for (let i = 0; i < 8; i++) {
        const { error } = await admin.from("activation_codes").insert({ code });
        if (!error) return res.status(200).json({ ok: true, code });
        if (!String(error.message || "").toLowerCase().includes("duplicate")) {
          return res.status(400).json({ error: error.message });
        }
        code = makeCode();
      }
      return res.status(400).json({ error: "code_collision" });
    }

    if (action === "listCodes") {
      if (!profile?.is_owner) {
        return res.status(403).json({ error: "owner_only" });
      }
      const { data, error } = await admin
        .from("activation_codes")
        .select("code,created_at,used_by")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return res.status(400).json({ error: error.message });
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
      if (!raw) return res.status(400).json({ error: "missing_code" });

      // رمز شخصي ثابت: لا يُفعّل الحساب الموقوف تلقائيًا — يحتاج موافقة المالك أو رمز يولّده المالك
      const normalizedPersonal = raw.replace(/[\s_]+/g, "-");
      if (/^TFZ-U-\d{6}$/.test(normalizedPersonal)) {
        if (profile?.status === "revoked") {
          return res.status(403).json({
            error: "personal_code_blocked_after_revoke",
            message:
              "الحساب موقوف. إعادة التفعيل فقط من الإدارة عبر إدارة التحكم أو برمز تفعيل ترسله الإدارة.",
          });
        }
        let h = 2166136261;
        const id = user.id;
        for (let i = 0; i < id.length; i++) {
          h ^= id.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        const expected = `TFZ-U-${String(Math.abs(h) % 1_000_000).padStart(6, "0")}`;
        if (normalizedPersonal !== expected) {
          return res.status(400).json({ error: "invalid_personal_code" });
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
          return res.status(400).json({
            error: upErr?.message || "profile_update_failed",
            message:
              "تعذّر التفعيل بالرمز الشخصي. إن كان الحساب موقوفًا فالتفعيل من الإدارة فقط.",
          });
        }
        if (updated.status !== "approved") {
          return res.status(400).json({
            error:
              "approve_blocked_by_trigger — نفّذ supabase/migrate-fix-revoke-trigger.sql في Supabase",
          });
        }
        return res.status(200).json({ ok: true, profile: updated });
      }

      const { data: codeRow, error: findErr } = await admin
        .from("activation_codes")
        .select("*")
        .eq("code", raw)
        .is("used_by", null)
        .maybeSingle();
      if (findErr) return res.status(400).json({ error: findErr.message });
      if (!codeRow) return res.status(400).json({ error: "invalid_or_used" });

      const { error: useErr } = await admin
        .from("activation_codes")
        .update({ used_by: user.id })
        .eq("code", raw)
        .is("used_by", null);
      if (useErr) return res.status(400).json({ error: useErr.message });

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
        return res.status(400).json({ error: upErr?.message || "profile_update_failed" });
      }
      return res.status(200).json({ ok: true, profile: updated });
    }

    if (action === "replyFeedback") {
      if (!profile?.is_owner) {
        return res.status(403).json({ error: "owner_only" });
      }
      const threadId = String(req.body?.threadId || "").trim();
      const message = String(req.body?.message || "").trim();
      if (!threadId || !message) {
        return res.status(400).json({ error: "missing_thread_or_message" });
      }

      // دعم الرسائل القديمة: قد يكون thread_id فارغًا والـ UI يمرّر id الرسالة
      let { data: root, error: rootErr } = await admin
        .from("feedback")
        .select("id, user_id, identifier, thread_id")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (rootErr) return res.status(400).json({ error: rootErr.message });

      if (!root) {
        const byId = await admin
          .from("feedback")
          .select("id, user_id, identifier, thread_id")
          .eq("id", threadId)
          .maybeSingle();
        if (byId.error) return res.status(400).json({ error: byId.error.message });
        root = byId.data;
      }
      if (!root) return res.status(404).json({ error: "thread_not_found" });

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
        return res.status(400).json({
          error:
            insertErr.message.includes("from_owner") || insertErr.message.includes("thread_id")
              ? "نفّذ ملف supabase/migrate-feedback-chat.sql في Supabase أولًا"
              : insertErr.message,
        });
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
        return res.status(403).json({ error: "owner_only" });
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
        if (error) return res.status(400).json({ error: error.message });
      }
      if (identifier) {
        const { error } = await admin
          .from("feedback")
          .update({ read: true })
          .eq("identifier", identifier)
          .eq("from_owner", false);
        if (error) return res.status(400).json({ error: error.message });
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
        return res.status(400).json({ error: "missing_target" });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "unknown_action" });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "server_error" });
  }
}
