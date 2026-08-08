/**
 * حد طلبات بسيط في ذاكرة الدالة الخادمية.
 *
 * على Vercel كل instance لها ذاكرة مستقلة، فالحد «أفضل جهد» وليس موزّعًا
 * عالميًا — يكفي لإبطاء الإساءة الشائعة (تسجيل جماعي، استنزاف OCR/خرائط)
 * بدون الاعتماد على خدمة خارجية. للحدّ العالمي استخدم WAF على النطاق.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fail } from "./errors.js";

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

function pruneExpired(now: number): void {
  if (store.size < MAX_KEYS) return;
  for (const [key, bucket] of store) {
    if (now >= bucket.resetAt) store.delete(key);
  }
  // إن امتلأت رغم التنظيف: احذف الأقدم تقريبًا (أول مفاتيح الخريطة)
  if (store.size >= MAX_KEYS) {
    const excess = store.size - Math.floor(MAX_KEYS * 0.8);
    let removed = 0;
    for (const key of store.keys()) {
      store.delete(key);
      removed += 1;
      if (removed >= excess) break;
    }
  }
}

/** عنوان العميل من ترويسة البروكسي، مع سقوط آمن. */
export function clientIp(req: VercelRequest): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) {
    return xf.split(",")[0]?.trim() || "unknown";
  }
  if (Array.isArray(xf) && xf[0]) {
    return String(xf[0]).split(",")[0]?.trim() || "unknown";
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) return realIp.trim();
  return "unknown";
}

/**
 * نافذة ثابتة: عند أول طلب تُفتح نافذة `windowMs`، ويُحسب العدد حتى تنتهي.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  pruneExpired(now);

  const bucket = store.get(key);
  if (!bucket || now >= bucket.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  bucket.count += 1;
  return { ok: true };
}

/** يكتب 429 مع Retry-After إن تجاوز الحد؛ وإلا لا يفعل شيئًا. */
export function enforceRateLimit(
  res: VercelResponse,
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const result = checkRateLimit(key, limit, windowMs);
  if (result.ok) return true;
  res.setHeader("Retry-After", String(result.retryAfterSec));
  fail(
    res,
    429,
    "rate_limited",
    "تم تجاوز الحد المسموح مؤقتًا. انتظر قليلًا ثم أعد المحاولة."
  );
  return false;
}
