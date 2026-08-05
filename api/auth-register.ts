import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { fail, failWithCause } from "../lib/api/errors.js";
import { isMissingConfig, readOwnerIdentifier, readSupabaseSecrets } from "../lib/api/env.js";

/**
 * إنشاء حساب مؤكَّد مباشرة عبر service role حتى لا يعتمد التسجيل
 * على إيميلات التأكيد (سبب email rate limit ورفض تسجيل الدخول).
 *
 * يتطلب في Vercel:
 * - SUPABASE_URL أو VITE_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

type IdentifierType = "email" | "phone";

/**
 * يترجم أخطاء Supabase Auth لرسالة عربية مكتوبة عندنا.
 *
 * ما نرجّع نص الخطأ الأصلي للمتصفح: صيغته تتغيّر بين إصدارات Supabase، ويكشف
 * أننا نستعمل Supabase وكيف نبني البريد الداخلي من رقم الجوال.
 */
function authFailureMessage(cause: unknown): string {
  const text = (cause instanceof Error ? cause.message : String(cause ?? "")).toLowerCase();
  if (text.includes("already registered") || text.includes("already been registered")) {
    return "هذا الحساب مسجّل مسبقًا. استخدم تسجيل الدخول بدل إنشاء حساب جديد.";
  }
  if (text.includes("rate limit") || text.includes("too many")) {
    return "تم تجاوز الحد المسموح مؤقتًا. انتظر دقيقة ثم أعد المحاولة.";
  }
  if (text.includes("password")) {
    return "كلمة المرور غير مقبولة. اختر كلمة أطول وأقوى.";
  }
  if (text.includes("invalid") && text.includes("email")) {
    return "البريد أو رقم الجوال غير صالح. تأكد من كتابته بشكل صحيح.";
  }
  return "تعذّر إنشاء الحساب. أعد المحاولة، وإن تكرر تواصل مع الإدارة.";
}

function toAuthEmail(type: IdentifierType, identifier: string): string {
  if (type === "email") return identifier.trim().toLowerCase();
  const digits = identifier.replace(/\D/g, "");
  return `phone${digits}@users.tafriz.app`;
}

async function findUserIdByEmail(
  url: string,
  serviceKey: string,
  email: string
): Promise<string | null> {
  const endpoint = `${url.replace(/\/$/, "")}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
  const resp = await fetch(endpoint, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!resp.ok) return null;
  const json = (await resp.json()) as { users?: { id: string; email?: string }[] };
  const hit = (json.users ?? []).find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
  return hit?.id ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return fail(res, 405, "method_not_allowed", "الطريقة غير مسموحة.");
  }

  // 503 مقصود: العميل يفهمه كإشارة ليكمل بالمسار الاحتياطي في backend-supabase.ts
  const secrets = readSupabaseSecrets();
  if (isMissingConfig(secrets)) {
    return fail(
      res,
      503,
      "missing_service_role",
      `إعدادات الخادم ناقصة (${secrets.missing.join(", ")}) — أضفها في Vercel.`
    );
  }
  const { url, serviceKey } = secrets;

  const { identifierType, identifier, password, profile } = req.body ?? {};
  if (
    (identifierType !== "email" && identifierType !== "phone") ||
    !identifier ||
    typeof password !== "string"
  ) {
    return fail(res, 400, "invalid_payload", "بيانات الطلب غير مكتملة أو غير صحيحة.");
  }
  // متوسط فأعلى: 8+ وتشمل حرفًا ورقمًا على الأقل
  {
    const p = password;
    const hasLetter = /[A-Za-z\u0600-\u06FF]/.test(p);
    const hasDigit = /\d/.test(p);
    const hasSpecial = /[^A-Za-z0-9\u0600-\u06FF]/.test(p);
    const hasMixed = /[a-z]/.test(p) && /[A-Z]/.test(p);
    const classes = [hasLetter, hasDigit, hasSpecial || hasMixed].filter(Boolean).length;
    if (p.length < 8 || classes < 2) {
      return fail(
        res,
        400,
        "weak_password",
        "كلمة المرور يجب أن تكون متوسطة على الأقل: 8 أحرف أو أكثر وتشمل حرفًا ورقمًا"
      );
    }
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const authEmail = toAuthEmail(identifierType, identifier);
  const ownerId = readOwnerIdentifier();
  const isOwner = String(identifier) === ownerId;

  let userId = await findUserIdByEmail(url, serviceKey, authEmail);

  if (userId) {
    const { data, error } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      return failWithCause(
        res,
        400,
        "update_failed",
        authFailureMessage(error),
        "auth-register: updateUserById",
        error
      );
    }
    userId = data.user.id;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: { identifierType, identifier },
    });
    if (error || !data.user) {
      // سباق نادر: أُنشئ الحساب بين البحث والإنشاء
      const again = await findUserIdByEmail(url, serviceKey, authEmail);
      if (!again) {
        return failWithCause(
          res,
          400,
          "create_failed",
          authFailureMessage(error),
          "auth-register: createUser",
          error
        );
      }
      const upd = await admin.auth.admin.updateUserById(again, {
        password,
        email_confirm: true,
      });
      if (upd.error || !upd.data.user) {
        return failWithCause(
          res,
          400,
          "update_failed",
          authFailureMessage(upd.error),
          "auth-register: updateUserById after race",
          upd.error
        );
      }
      userId = upd.data.user.id;
    } else {
      userId = data.user.id;
    }
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      identifier_type: identifierType,
      identifier,
      status: isOwner ? "approved" : "pending",
      is_owner: isOwner,
      full_name: profile?.fullName || null,
      city: profile?.city || null,
      package_name: isOwner ? "مالك التطبيق" : null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (profileError) {
    return failWithCause(
      res,
      400,
      "profile_upsert_failed",
      "تم إنشاء الحساب لكن تعذّر حفظ بياناتك. سجّل الدخول وأعد المحاولة.",
      "auth-register: profiles upsert",
      profileError
    );
  }

  return res.status(200).json({ ok: true, email: authEmail, userId });
}
