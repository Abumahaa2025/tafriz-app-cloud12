import { supabase } from "./supabase-client";

export type MapsAssistAction = "resolve" | "locate" | "track";

export interface MapsAssistPlace {
  name: string;
  url: string;
}

export interface MapsAssistResult {
  action: MapsAssistAction;
  placeName?: string | null;
  street?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  mapUrl?: string | null;
  summary?: string | null;
  places?: MapsAssistPlace[];
  source?: string;
}

export interface MapsAssistRequest {
  action: MapsAssistAction;
  query?: string;
  location?: { lat: number; lng: number } | null;
  points?: Array<{ lat: number; lng: number }>;
}

/**
 * ينادي /api/maps-assist (Gemini + أداة google_maps على الخادم).
 * يتطلب جلسة مستخدم موافق عليه ومفتاح GEMINI_API_KEY على الاستضافة.
 */
export async function requestMapsAssist(input: MapsAssistRequest): Promise<MapsAssistResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch("/api/maps-assist", {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: input.action,
      query: input.query,
      location: input.location ?? undefined,
      points: input.points,
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message || "تعذّر استخدام خدمة الخرائط الذكية");
  }

  return (await res.json()) as MapsAssistResult;
}
