/**
 * استدعاء Gemini Interactions API مع أداة google_maps (Grounding with Google Maps).
 *
 * المفتاح يُقرأ من البيئة فقط عبر readGeminiKey — لا يُمرَّر من المتصفح.
 * الوثائق: https://ai.google.dev/gemini-api/docs/maps-grounding
 */

export const GEMINI_MAPS_MODEL = "gemini-3.6-flash";
export const GEMINI_INTERACTIONS_URL =
  "https://generativelanguage.googleapis.com/v1beta/interactions";

export type MapsAssistAction = "resolve" | "locate" | "track";

export interface MapsLatLng {
  lat: number;
  lng: number;
}

export interface PlaceCitation {
  name: string;
  url: string;
}

export interface GeminiMapsResult {
  text: string;
  places: PlaceCitation[];
  /** حقول مستخرجة من رد JSON إن وُجد */
  placeName?: string | null;
  street?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  mapUrl?: string | null;
  summary?: string | null;
}

interface InteractionTextBlock {
  type?: string;
  text?: string;
  annotations?: Array<{
    type?: string;
    name?: string;
    url?: string;
    title?: string;
    uri?: string;
  }>;
}

interface InteractionStep {
  type?: string;
  content?: InteractionTextBlock[];
}

interface InteractionResponse {
  steps?: InteractionStep[];
  outputs?: InteractionTextBlock[];
  error?: { message?: string };
}

function buildPrompt(action: MapsAssistAction, opts: {
  query?: string;
  location?: MapsLatLng | null;
  points?: MapsLatLng[];
}): string {
  if (action === "locate") {
    const loc = opts.location;
    return [
      "أنت مساعد مواقع لتطبيق فرز لوحات ميداني في السعودية.",
      "استخدم بيانات Google Maps لتحديد أقرب عنوان/شارع/حي للموقع المعطى.",
      loc
        ? `الإحداثيات: ${loc.lat}, ${loc.lng}`
        : "لا توجد إحداثيات — استنتج من السياق إن أمكن.",
      "أجب بالعربية فقط، وأعد JSON صارمًا بدون Markdown بهذا الشكل:",
      JSON.stringify({
        placeName: "اسم المكان إن وُجد",
        street: "اسم الشارع",
        neighborhood: "الحي",
        city: "المدينة",
        lat: loc?.lat ?? 0,
        lng: loc?.lng ?? 0,
        mapUrl: "رابط Google Maps",
        summary: "وصف قصير للموقع في جملة واحدة",
      }),
    ].join("\n");
  }

  if (action === "track") {
    const pts = (opts.points ?? []).slice(0, 40);
    const listed = pts.map((p, i) => `${i + 1}) ${p.lat},${p.lng}`).join("\n");
    return [
      "أنت مساعد تتبع مسار ميداني لتطبيق فرز لوحات.",
      "حلّل نقاط GPS التالية عبر Google Maps ولخّص المسار:",
      listed || "(لا نقاط)",
      opts.query ? `سياق إضافي: ${opts.query}` : "",
      "أجب بالعربية فقط، وأعد JSON صارمًا بدون Markdown بهذا الشكل:",
      JSON.stringify({
        placeName: "منطقة المسار",
        street: "أبرز شارع على المسار",
        neighborhood: "الحي",
        city: "المدينة",
        lat: pts[0]?.lat ?? 0,
        lng: pts[0]?.lng ?? 0,
        mapUrl: "رابط Google Maps لبداية المسار أو المنطقة",
        summary: "ملخص قصير للمسار والاتجاه والحي/الشارع",
      }),
    ]
      .filter(Boolean)
      .join("\n");
  }

  // resolve
  return [
    "أنت مساعد تحديد مواقع لتطبيق فرز لوحات مركبات.",
    "استخدم Google Maps لإيجاد أفضل تطابق للموقع التالي وإرجاع إحداثياته.",
    `الاستعلام: ${opts.query?.trim() || "(فارغ)"}`,
    opts.location
      ? `موقع تقريبي للمستخدم (للتحسين المحلي): ${opts.location.lat}, ${opts.location.lng}`
      : "",
    "أجب بالعربية فقط، وأعد JSON صارمًا بدون Markdown بهذا الشكل:",
    JSON.stringify({
      placeName: "اسم المكان",
      street: "الشارع",
      neighborhood: "الحي",
      city: "المدينة",
      lat: 24.7136,
      lng: 46.6753,
      mapUrl: "https://www.google.com/maps?q=...",
      summary: "وصف قصير",
    }),
  ]
    .filter(Boolean)
    .join("\n");
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asFiniteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s ? s : null;
}

function parsePlaces(blocks: InteractionTextBlock[]): PlaceCitation[] {
  const places: PlaceCitation[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    for (const ann of block.annotations ?? []) {
      if (ann.type && ann.type !== "place_citation") continue;
      const name = (ann.name || ann.title || "").trim();
      const url = (ann.url || ann.uri || "").trim();
      if (!name && !url) continue;
      const key = `${name}|${url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      places.push({ name: name || url, url: url || "" });
    }
  }
  return places;
}

function collectTextBlocks(data: InteractionResponse): InteractionTextBlock[] {
  const blocks: InteractionTextBlock[] = [];
  for (const step of data.steps ?? []) {
    if (step.type && step.type !== "model_output") continue;
    for (const content of step.content ?? []) {
      if (!content.type || content.type === "text") blocks.push(content);
    }
  }
  if (blocks.length === 0) {
    for (const content of data.outputs ?? []) {
      if (!content.type || content.type === "text") blocks.push(content);
    }
  }
  return blocks;
}

export function parseGeminiMapsResponse(data: InteractionResponse): GeminiMapsResult {
  const blocks = collectTextBlocks(data);
  const text = blocks
    .map((b) => b.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
  const places = parsePlaces(blocks);
  const json = text ? extractJsonObject(text) : null;

  let lat = asFiniteNumber(json?.lat);
  let lng = asFiniteNumber(json?.lng);
  if (lat != null && (Math.abs(lat) > 90)) lat = null;
  if (lng != null && (Math.abs(lng) > 180)) lng = null;

  let mapUrl = asNonEmptyString(json?.mapUrl) ?? asNonEmptyString(json?.mapsUrl);
  if (!mapUrl && places[0]?.url) mapUrl = places[0].url;
  if (!mapUrl && lat != null && lng != null) {
    mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  }

  return {
    text,
    places,
    placeName: asNonEmptyString(json?.placeName) ?? places[0]?.name ?? null,
    street: asNonEmptyString(json?.street),
    neighborhood: asNonEmptyString(json?.neighborhood),
    city: asNonEmptyString(json?.city),
    lat,
    lng,
    mapUrl,
    summary: asNonEmptyString(json?.summary) ?? (text || null),
  };
}

export async function callGeminiMaps(opts: {
  apiKey: string;
  action: MapsAssistAction;
  query?: string;
  location?: MapsLatLng | null;
  points?: MapsLatLng[];
}): Promise<GeminiMapsResult> {
  const tool: Record<string, unknown> = { type: "google_maps" };
  const loc =
    opts.location ??
    (opts.points && opts.points.length > 0
      ? opts.points[opts.points.length - 1]
      : null);
  if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
    tool.latitude = loc.lat;
    tool.longitude = loc.lng;
  }

  const response = await fetch(GEMINI_INTERACTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": opts.apiKey,
    },
    body: JSON.stringify({
      model: GEMINI_MAPS_MODEL,
      input: buildPrompt(opts.action, {
        query: opts.query,
        location: opts.location ?? loc,
        points: opts.points,
      }),
      tools: [tool],
    }),
  });

  const rawText = await response.text().catch(() => "");
  let data: InteractionResponse = {};
  try {
    data = rawText ? (JSON.parse(rawText) as InteractionResponse) : {};
  } catch {
    data = { error: { message: rawText.slice(0, 400) } };
  }

  if (!response.ok) {
    const detail = data.error?.message || rawText || `HTTP ${response.status}`;
    throw new GeminiMapsUpstreamError(response.status, detail);
  }

  const parsed = parseGeminiMapsResponse(data);
  if (!parsed.text && parsed.places.length === 0) {
    throw new GeminiMapsUpstreamError(502, "empty_gemini_maps_response");
  }
  return parsed;
}

export class GeminiMapsUpstreamError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`gemini-maps upstream ${status}`);
    this.status = status;
    this.detail = detail;
  }
}
