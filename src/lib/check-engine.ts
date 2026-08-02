import { normalizePlate } from "./normalize";
import { extractMapsUrl, findMapsUrlInRow } from "./map-coords";
import { extractPlateLetters, normalizeSearchText } from "./search-text";
import { ParsedSheet } from "./xlsx-utils";

export interface CheckSheetRow {
  plate: string;
  plateNorm: string;
  gps: string;
  mapUrl: string | null;
}

export interface CheckSheetData {
  fileName: string;
  loadedAt: string;
  plateColumn: string;
  gpsColumn: string;
  rows: CheckSheetRow[];
}

export const CHECK_IDB_KEY = "check_sheet_v1";

export function guessCheckPlateColumn(headers: string[]): string {
  const keys = ["لوحة", "اللوحه", "اللوحة", "plate"];
  for (const k of keys) {
    const hit = headers.find((h) => h.toLowerCase().includes(k.toLowerCase()) || h.includes(k));
    if (hit) return hit;
  }
  return headers[0] ?? "";
}

export function guessCheckGpsColumn(headers: string[]): string {
  const keys = ["gps", "خريط", "maps", "map", "موقع", "رابط", "إحداث"];
  for (const k of keys) {
    const hit = headers.find((h) => h.toLowerCase().includes(k.toLowerCase()));
    if (hit) return hit;
  }
  return "";
}

export function buildCheckSheet(
  sheet: ParsedSheet,
  fileName: string,
  plateColumn: string,
  gpsColumn = ""
): CheckSheetData {
  const rows: CheckSheetRow[] = [];
  for (const raw of sheet.rows) {
    const plate = String(raw[plateColumn] ?? "").trim();
    const plateNorm = normalizePlate(plate);
    if (!plateNorm) continue;
    const gpsRaw = gpsColumn ? String(raw[gpsColumn] ?? "").trim() : "";
    const mapUrl =
      extractMapsUrl(gpsRaw) || findMapsUrlInRow(raw, gpsColumn || undefined) || null;
    rows.push({
      plate,
      plateNorm,
      gps: gpsRaw || mapUrl || "",
      mapUrl,
    });
  }
  return {
    fileName,
    loadedAt: new Date().toISOString(),
    plateColumn,
    gpsColumn,
    rows,
  };
}

export function indexCheckSheet(data: CheckSheetData): Map<string, CheckSheetRow> {
  const map = new Map<string, CheckSheetRow>();
  for (const row of data.rows) {
    if (!map.has(row.plateNorm)) map.set(row.plateNorm, row);
  }
  return map;
}

function plateDigits(raw: string): string {
  return normalizeSearchText(raw).replace(/[^0-9]/g, "");
}

function plateLettersJoined(raw: string): string {
  return extractPlateLetters(normalizeSearchText(raw)).join("");
}

function uniqueOrNull(hits: CheckSheetRow[]): CheckSheetRow | null {
  if (hits.length === 1) return hits[0];
  return null;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    let prev = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cur = a[i] === b[j] ? row[j] : Math.min(row[j], row[j + 1], prev) + 1;
      row[j] = prev;
      prev = cur;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

function findSimilarDigitPlate(
  index: Map<string, CheckSheetRow>,
  digitsOnly: string
): CheckSheetRow | null {
  if (digitsOnly.length < 2) return null;
  let best: CheckSheetRow | null = null;
  let bestDist = Infinity;
  for (const [, row] of index) {
    const d = plateDigits(row.plate);
    if (!d) continue;
    if (Math.abs(d.length - digitsOnly.length) > 1) continue;
    const dist = levenshtein(digitsOnly, d);
    const maxAllowed = digitsOnly.length <= 3 ? 1 : 2;
    if (dist > 0 && dist <= maxAllowed && dist < bestDist) {
      bestDist = dist;
      best = row;
    }
  }
  return best;
}

export function lookupPlate(
  index: Map<string, CheckSheetRow>,
  query: string
): CheckSheetRow | null {
  const norm = normalizePlate(query);
  if (!norm) return null;
  const exact = index.get(norm);
  if (exact) return exact;

  const qSearch = normalizeSearchText(norm).replace(/\s/g, "");
  if (!qSearch) return null;

  const lettersOnly = qSearch.replace(/[0-9]/g, "");
  const digitsOnly = qSearch.replace(/[^0-9]/g, "");

  // حرف أو حروف فقط (عربي/إنجليزي) — مثل البحث اليدوي بحرف اللوحة
  if (lettersOnly.length > 0 && digitsOnly.length === 0) {
    for (const [, row] of index) {
      const p = normalizeSearchText(row.plate).replace(/\s/g, "");
      if (lettersOnly.length === 1) {
        if (extractPlateLetters(normalizeSearchText(row.plate)).includes(lettersOnly)) return row;
        if (p.includes(lettersOnly)) return row;
      } else if (p.includes(lettersOnly)) {
        return row;
      }
    }
    return null;
  }

  if (norm.length >= 3) {
    for (const [key, row] of index) {
      if (key.includes(norm) || norm.includes(key)) return row;
    }
  }

  // أرقام فقط بطول 2–3: أول لوحة تحتوي الرقم
  if (digitsOnly.length >= 2 && lettersOnly.length === 0) {
    for (const [key, row] of index) {
      if (key.includes(digitsOnly)) return row;
    }
  }

  // رقم + حرف قصير (مثل 7ج / ج522)
  if (lettersOnly.length > 0 && qSearch.length >= 2) {
    for (const [, row] of index) {
      const p = normalizeSearchText(row.plate).replace(/\s/g, "");
      if (p.includes(qSearch)) return row;
    }
  }

  return null;
}

export type VoicePlateLookup =
  | { status: "exact"; row: CheckSheetRow }
  | { status: "similar"; row: CheckSheetRow; query: string }
  | { status: "none"; query: string };

/**
 * مطابقة صوتية دقيقة:
 * - لا تلتقط مقطعًا قصيرًا (مثل 10 قبل 20)
 * - عند غياب التطابق تُرجع أقرب رقم مشابه مع تنبيه
 */
export function lookupPlateVoiceDetailed(
  index: Map<string, CheckSheetRow>,
  query: string
): VoicePlateLookup {
  const norm = normalizePlate(query);
  const qSearch = normalizeSearchText(norm).replace(/\s/g, "");
  if (!qSearch) return { status: "none", query: String(query ?? "") };

  const exactNorm = index.get(norm);
  if (exactNorm) return { status: "exact", row: exactNorm };
  for (const [, row] of index) {
    if (normalizePlate(row.plate) === norm) return { status: "exact", row };
  }

  const qLetters = qSearch.replace(/[0-9]/g, "");
  const digitsOnly = qSearch.replace(/[^0-9]/g, "");

  if (digitsOnly.length > 0 && qLetters.length === 0) {
    const exactDigitHits: CheckSheetRow[] = [];
    for (const [, row] of index) {
      const d = plateDigits(row.plate);
      if (d && d === digitsOnly) exactDigitHits.push(row);
    }
    if (exactDigitHits.length >= 1) {
      return { status: "exact", row: exactDigitHits[0] };
    }

    if (digitsOnly.length >= 4) {
      const containHits: CheckSheetRow[] = [];
      for (const [, row] of index) {
        const d = plateDigits(row.plate);
        if (d && d.includes(digitsOnly)) containHits.push(row);
      }
      const one = uniqueOrNull(containHits);
      if (one) return { status: "exact", row: one };
    }

    const similar = findSimilarDigitPlate(index, digitsOnly);
    if (similar) return { status: "similar", row: similar, query: digitsOnly };
    return { status: "none", query: digitsOnly };
  }

  if (qLetters.length > 0 && digitsOnly.length === 0) {
    const exactLetterHits: CheckSheetRow[] = [];
    const containHits: CheckSheetRow[] = [];
    for (const [, row] of index) {
      const letters = plateLettersJoined(row.plate);
      if (!letters) continue;
      if (letters === qLetters) exactLetterHits.push(row);
      else if (letters.includes(qLetters)) containHits.push(row);
    }
    if (exactLetterHits.length === 1) return { status: "exact", row: exactLetterHits[0] };
    const one = uniqueOrNull(containHits);
    if (one) return { status: "exact", row: one };
    return { status: "none", query: qLetters };
  }

  if (qLetters.length > 0 && digitsOnly.length > 0) {
    const hits: CheckSheetRow[] = [];
    for (const [, row] of index) {
      const p = normalizeSearchText(row.plate).replace(/\s/g, "");
      const d = plateDigits(row.plate);
      const letters = plateLettersJoined(row.plate);
      if (p.includes(qSearch) || (d === digitsOnly && letters === qLetters)) {
        hits.push(row);
      }
    }
    const one = uniqueOrNull(hits);
    if (one) return { status: "exact", row: one };
    if (digitsOnly.length >= 3) {
      const similar = findSimilarDigitPlate(index, digitsOnly);
      if (similar) return { status: "similar", row: similar, query: qSearch };
    }
    return { status: "none", query: qSearch };
  }

  return { status: "none", query: qSearch };
}

/** توافق خلفي: تطابق دقيق فقط (بدون مشابه) */
export function lookupPlateVoice(
  index: Map<string, CheckSheetRow>,
  query: string
): CheckSheetRow | null {
  const r = lookupPlateVoiceDetailed(index, query);
  return r.status === "exact" ? r.row : null;
}
