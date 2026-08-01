import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

type Action = "approve" | "revoke" | "generateCode" | "redeemCode";

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
      .update({ is_owner: true, status: "approved", package_name: "مالك التطبيق" })
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
        return res.status(200).json({ ok: true, profile: data });
      }

      const { data, error } = await admin
        .from("profiles")
        .update({ status: "revoked" })
        .eq("id", userId)
        .select("id,status")
        .maybeSingle();
      if (error || !data) {
        return res.status(400).json({ error: error?.message || "revoke_failed" });
      }
      return res.status(200).json({ ok: true, profile: data });
    }

    if (action === "generateCode") {
      if (!profile?.is_owner) {
        return res.status(403).json({ error: "owner_only" });
      }
      let code = makeCode();
      for (let i = 0; i < 5; i++) {
        const { error } = await admin.from("activation_codes").insert({ code });
        if (!error) return res.status(200).json({ ok: true, code });
        if (!String(error.message || "").toLowerCase().includes("duplicate")) {
          return res.status(400).json({ error: error.message });
        }
        code = makeCode();
      }
      return res.status(400).json({ error: "code_collision" });
    }

    if (action === "redeemCode") {
      const raw = String(req.body?.code || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");
      if (!raw) return res.status(400).json({ error: "missing_code" });

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

    return res.status(400).json({ error: "unknown_action" });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "server_error" });
  }
}
