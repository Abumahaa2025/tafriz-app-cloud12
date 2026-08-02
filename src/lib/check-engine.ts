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

/**
 * مطابقة صوتية دقيقة — ترفض النتائج الجزئية الغلط (مثل مطابقة «12» لأول لوحة).
 * تُستخدم مع أوامر الصوت فقط؛ البحث اليدوي يبقى على lookupPlate.
 */
export function lookupPlateVoice(
  index: Map<string, CheckSheetRow>,
  query: string
): CheckSheetRow | null {
  const norm = normalizePlate(query);
  if (!norm) return null;

  const exact = index.get(norm);
  if (exact) return exact;

  // تطابق تطبيع كامل على قيمة اللوحة المعروضة
  for (const [, row] of index) {
    if (normalizePlate(row.plate) === norm) return row;
  }

  const qSearch = normalizeSearchText(norm).replace(/\s/g, "");
  if (!qSearch) return null;
  const qLetters = qSearch.replace(/[0-9]/g, "");
  const digitsOnly = qSearch.replace(/[^0-9]/g, "");

  // أرقام فقط
  if (digitsOnly.length > 0 && qLetters.length === 0) {
    const exactDigitHits: CheckSheetRow[] = [];
    const containHits: CheckSheetRow[] = [];
    for (const [, row] of index) {
      const d = plateDigits(row.plate);
      if (!d) continue;
      if (d === digitsOnly) exactDigitHits.push(row);
      else if (d.includes(digitsOnly)) containHits.push(row);
    }
    const exactHit = uniqueOrNull(exactDigitHits) ?? (exactDigitHits[0] ?? null);
    if (exactHit) return exactHit;
    // مقطع قصير (2–3) فقط إذا كان وحيدًا تمامًا — يمنع «12» ثم «34» من التقاط لوحة غلط
    if (digitsOnly.length >= 2 && digitsOnly.length <= 3) {
      return uniqueOrNull(containHits);
    }
    if (digitsOnly.length >= 4) {
      return uniqueOrNull(containHits);
    }
    return null;
  }

  // حروف فقط
  if (qLetters.length > 0 && digitsOnly.length === 0) {
    const exactLetterHits: CheckSheetRow[] = [];
    const containHits: CheckSheetRow[] = [];
    for (const [, row] of index) {
      const letters = plateLettersJoined(row.plate);
      if (!letters) continue;
      if (letters === qLetters) exactLetterHits.push(row);
      else if (letters.includes(qLetters)) containHits.push(row);
    }
    if (exactLetterHits.length === 1) return exactLetterHits[0];
    // حرف/حروف: لا نُرجع نتيجة غامضة (عدة لوحات)
    return uniqueOrNull(containHits);
  }

  // رقم + حرف معًا
  if (qLetters.length > 0 && digitsOnly.length > 0) {
    const hits: CheckSheetRow[] = [];
    for (const [, row] of index) {
      const p = normalizeSearchText(row.plate).replace(/\s/g, "");
      const d = plateDigits(row.plate);
      const letters = plateLettersJoined(row.plate);
      if (p.includes(qSearch) || (d.includes(digitsOnly) && letters.includes(qLetters))) {
        hits.push(row);
      }
    }
    return uniqueOrNull(hits);
  }

  return null;
}
