import { normalizePlate } from "./normalize";
import { extractMapsUrl, findMapsUrlInRow } from "./map-coords";
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

export function lookupPlate(
  index: Map<string, CheckSheetRow>,
  query: string
): CheckSheetRow | null {
  const norm = normalizePlate(query);
  if (!norm) return null;
  const exact = index.get(norm);
  if (exact) return exact;
  if (norm.length >= 4) {
    for (const [key, row] of index) {
      if (key.includes(norm) || norm.includes(key)) return row;
    }
  }
  return null;
}
