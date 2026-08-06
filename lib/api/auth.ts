/**
 * التحقق من هوية الطالب للدوال التي تستهلك موارد مدفوعة أو حسّاسة.
 *
 * `api/recognize-plate.ts` كان مفتوحًا بلا أي مصادقة: أي أحد على الإنترنت يقدر
 * يرسل صورًا فتُمرَّر لمزوّد الذكاء بمفتاح المالك وعلى حسابه. الآن يلزم توكن
 * جلسة صالح لحساب حالته `approved`.
 */
import { createClient } from "@supabase/supabase-js";
import { isMissingConfig, readAnonKey, readSupabaseSecrets } from "./env.js";

export interface ApprovedRequester {
  userId: string;
  isOwner: boolean;
}

export type AuthResult =
  | { ok: true; user: ApprovedRequester }
  | { ok: false; reason: "missing_env"; missing: string[] }
  | { ok: false; reason: "unauthorized" }
  | { ok: false; reason: "not_approved" };

/**
 * يفشل مغلقًا: نقص الإعدادات أو غياب الترويسة يعني رفض، لا تجاوز. ما يرجع أي
 * تفصيل عن سبب الرفض للمتصل غير المصنّف — المستدعي هو من يقرر نص الرد.
 */
export async function resolveApprovedUser(authHeader: string | undefined): Promise<AuthResult> {
  const secrets = readSupabaseSecrets();
  const anonKey = readAnonKey();
  if (isMissingConfig(secrets) || !anonKey) {
    const missing = isMissingConfig(secrets) ? [...secrets.missing] : [];
    if (!anonKey) missing.push("VITE_SUPABASE_ANON_KEY");
    return { ok: false, reason: "missing_env", missing };
  }
  if (!authHeader) return { ok: false, reason: "unauthorized" };

  const userClient = createClient(secrets.url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return { ok: false, reason: "unauthorized" };

  const admin = createClient(secrets.url, secrets.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile } = await admin
    .from("profiles")
    .select("status,is_owner")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || profile.status !== "approved") return { ok: false, reason: "not_approved" };
  return { ok: true, user: { userId: data.user.id, isOwner: !!profile.is_owner } };
}
