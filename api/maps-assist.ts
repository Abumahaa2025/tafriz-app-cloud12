/**
 * مساعدة الخرائط والتتبع عبر Gemini + أداة google_maps.
 *
 * يتطلب:
 * - GEMINI_API_KEY في متغيّرات البيئة (خادم فقط)
 * - جلسة مستخدم موافق عليه (مثل /api/recognize-plate)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fail, failInternal, failUpstream } from "../lib/api/errors.js";
import { readGeminiKey } from "../lib/api/env.js";
import { resolveApprovedUser } from "../lib/api/auth.js";
import {
  callGeminiMaps,
  GeminiMapsUpstreamError,
  type MapsAssistAction,
  type MapsLatLng,
} from "../lib/api/gemini-maps.js";
import { enforceRateLimit } from "../lib/api/rate-limit.js";

const MAX_QUERY_CHARS = 500;
const MAX_TRACK_POINTS = 40;

function isAction(value: unknown): value is MapsAssistAction {
  return value === "resolve" || value === "locate" || value === "track";
}

function readLatLng(value: unknown): MapsLatLng | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as { lat?: unknown; lng?: unknown; latitude?: unknown; longitude?: unknown };
  const lat = Number(obj.lat ?? obj.latitude);
  const lng = Number(obj.lng ?? obj.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function readPoints(value: unknown): MapsLatLng[] {
  if (!Array.isArray(value)) return [];
  const out: MapsLatLng[] = [];
  for (const item of value) {
    const p = readLatLng(item);
    if (p) out.push(p);
    if (out.length >= MAX_TRACK_POINTS) break;
  }
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return fail(res, 405, "method_not_allowed", "الطريقة غير مسموحة.");
  }

  const auth = await resolveApprovedUser(req.headers.authorization);
  if (!auth.ok) {
    if (auth.reason === "missing_env") {
      return fail(
        res,
        503,
        "missing_env",
        `إعدادات الخادم ناقصة (${auth.missing.join(", ")}) — أضفها في Vercel.`
      );
    }
    if (auth.reason === "not_approved") {
      return fail(res, 403, "not_approved", "حسابك غير مفعّل بعد. راجع الإدارة.");
    }
    return fail(res, 401, "unauthorized", "الجلسة منتهية. سجّل الدخول من جديد.");
  }

  if (!enforceRateLimit(res, `maps-assist:user:${auth.user.userId}`, 60, 60 * 1000)) {
    return;
  }

  const apiKey = readGeminiKey();
  if (!apiKey) {
    return fail(
      res,
      503,
      "missing_gemini_key",
      "خدمة الخرائط بالذكاء غير مفعّلة. اضبط GEMINI_API_KEY في إعدادات الاستضافة."
    );
  }

  try {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as {
      action?: unknown;
      query?: unknown;
      location?: unknown;
      points?: unknown;
    };

    if (!isAction(body?.action)) {
      return fail(
        res,
        400,
        "invalid_action",
        "الإجراء غير معروف. استخدم resolve أو locate أو track."
      );
    }

    const query =
      typeof body.query === "string" ? body.query.trim().slice(0, MAX_QUERY_CHARS) : "";
    const location = readLatLng(body.location);
    const points = readPoints(body.points);

    if (body.action === "resolve" && !query) {
      return fail(res, 400, "missing_query", "أدخل وصف الموقع أو اسم الشارع.");
    }
    if (body.action === "locate" && !location) {
      return fail(res, 400, "missing_location", "يلزم إرسال إحداثيات الموقع الحالي.");
    }
    if (body.action === "track" && points.length < 2) {
      return fail(res, 400, "missing_points", "يلزم نقطتان GPS على الأقل لتحليل المسار.");
    }

    const result = await callGeminiMaps({
      apiKey,
      action: body.action,
      query: query || undefined,
      location,
      points,
    });

    return res.status(200).json({
      action: body.action,
      placeName: result.placeName,
      street: result.street,
      neighborhood: result.neighborhood,
      city: result.city,
      lat: result.lat,
      lng: result.lng,
      mapUrl: result.mapUrl,
      summary: result.summary,
      places: result.places,
      source: "gemini_google_maps",
    });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return fail(res, 400, "invalid_json", "صيغة الطلب غير صحيحة.");
    }
    if (err instanceof GeminiMapsUpstreamError) {
      return failUpstream(
        res,
        `maps-assist: gemini ${err.status}`,
        err.detail,
        "تعذّر الوصول لخدمة الخرائط الآن. حاول مرة أخرى بعد قليل."
      );
    }
    return failInternal(res, "maps-assist", err);
  }
}
