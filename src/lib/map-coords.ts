export interface LatLng {
  lat: number;
  lng: number;
}

const MAPS_URL_RE =
  /(?:https?:\/\/)?(?:maps\.app\.goo\.gl\/[^\s]+|goo\.gl\/maps\/[^\s]+|www\.google\.[^\s/]+\/maps[^\s]*|maps\.google\.[^\s]+)/i;

/** يستخرج أول رابط خرائط من نص حر */
export function extractMapsUrl(raw: string): string | null {
  const m = String(raw ?? "").match(MAPS_URL_RE);
  if (!m) return null;
  let url = m[0];
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/[)\]>,.]+$/, "");
}

/**
 * يحاول قراءة إحداثيات من رابط Google Maps كامل.
 * الروابط المختصرة (goo.gl) غالبًا بلا إحداثيات ظاهرة — تُفتح في Google Maps مباشرة.
 */
export function coordsFromMapsUrl(url: string): LatLng | null {
  const u = String(url ?? "");
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /[?&](?:q|query|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/i,
    /[?&]center=(-?\d+\.\d+),(-?\d+\.\d+)/i,
    /\/search\/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/,
  ];
  for (const re of patterns) {
    const m = u.match(re);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }
  return null;
}

/** يبحث عن رابط خرائط داخل صف الداتا (عمود محدد أو أي خلية) */
export function findMapsUrlInRow(
  row: Record<string, string | number>,
  mapColumn?: string
): string | null {
  if (mapColumn) {
    const fromCol = extractMapsUrl(String(row[mapColumn] ?? ""));
    if (fromCol) return fromCol;
  }
  for (const value of Object.values(row)) {
    const found = extractMapsUrl(String(value ?? ""));
    if (found) return found;
  }
  return null;
}

export function googleMapsOpenUrl(opts: {
  mapUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
  query?: string | null;
}): string {
  if (opts.mapUrl) return opts.mapUrl;
  if (opts.lat != null && opts.lng != null) {
    return `https://www.google.com/maps?q=${opts.lat},${opts.lng}`;
  }
  const q = (opts.query ?? "").trim();
  if (q) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  return "https://www.google.com/maps";
}

export function osmEmbedUrl(lat: number, lng: number, delta = 0.012): string {
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&marker=${lat}%2C${lng}&layer=mapnik`;
}

export function osmBboxEmbedUrl(points: LatLng[]): string | null {
  if (points.length === 0) return null;
  if (points.length === 1) return osmEmbedUrl(points[0].lat, points[0].lng);
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  const padLat = Math.max((maxLat - minLat) * 0.15, 0.01);
  const padLng = Math.max((maxLng - minLng) * 0.15, 0.01);
  const bbox = `${minLng - padLng},${minLat - padLat},${maxLng + padLng},${maxLat + padLat}`;
  // علامة على أول نقطة + إطار يشمل الكل
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&marker=${points[0].lat}%2C${points[0].lng}&layer=mapnik`;
}
