import { normalizePlate } from "./normalize";
import { ParsedSheet } from "./xlsx-utils";
import { coordsFromMapsUrl, findMapsUrlInRow } from "./map-coords";

export interface SortResultRow {
  street: string;
  plate: string;
  /** رابط Google Maps إن وُجد في صف الداتا */
  mapUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface SortResult {
  matchedRows: SortResultRow[]; // لوحات مفرزة (found in referral file)
  unsortedCount: number; // غير مفرزة
  distinctMatchedPlates: number; // فرز من الإحالة
}

/**
 * Matches every row of the data sheet against the referral plate list.
 * A row "sorts" when its normalized plate number exists in the referral file.
 */
export function runSort(
  data: ParsedSheet,
  dataPlateColumn: string,
  dataStreetColumn: string,
  referral: ParsedSheet,
  referralPlateColumn: string,
  dataMapColumn?: string
): SortResult {
  const referralPlates = new Set(
    referral.rows
      .map((r) => normalizePlate(r[referralPlateColumn]))
      .filter((p) => p.length > 0)
  );

  const matchedRows: SortResultRow[] = [];
  const distinctMatched = new Set<string>();
  let unsortedCount = 0;

  for (const row of data.rows) {
    const plateRaw = String(row[dataPlateColumn] ?? "");
    const plateNorm = normalizePlate(plateRaw);
    const street = String(row[dataStreetColumn] ?? "");

    if (plateNorm.length > 0 && referralPlates.has(plateNorm)) {
      const mapUrl = findMapsUrlInRow(row, dataMapColumn);
      const coords = mapUrl ? coordsFromMapsUrl(mapUrl) : null;
      matchedRows.push({
        street,
        plate: plateRaw,
        mapUrl,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      });
      distinctMatched.add(plateNorm);
    } else {
      unsortedCount += 1;
    }
  }

  return {
    matchedRows,
    unsortedCount,
    distinctMatchedPlates: distinctMatched.size,
  };
}

/** فرز على دفعات حتى لا يتجمّد الواجهة مع ملفات مئات الآلاف */
export async function runSortChunked(
  data: ParsedSheet,
  dataPlateColumn: string,
  dataStreetColumn: string,
  referral: ParsedSheet,
  referralPlateColumn: string,
  dataMapColumn?: string,
  chunkSize = 8000
): Promise<SortResult> {
  const referralPlates = new Set(
    referral.rows
      .map((r) => normalizePlate(r[referralPlateColumn]))
      .filter((p) => p.length > 0)
  );

  const matchedRows: SortResultRow[] = [];
  const distinctMatched = new Set<string>();
  let unsortedCount = 0;
  const rows = data.rows;

  for (let start = 0; start < rows.length; start += chunkSize) {
    const end = Math.min(start + chunkSize, rows.length);
    for (let i = start; i < end; i++) {
      const row = rows[i];
      const plateRaw = String(row[dataPlateColumn] ?? "");
      const plateNorm = normalizePlate(plateRaw);
      const street = String(row[dataStreetColumn] ?? "");

      if (plateNorm.length > 0 && referralPlates.has(plateNorm)) {
        const mapUrl = findMapsUrlInRow(row, dataMapColumn);
        const coords = mapUrl ? coordsFromMapsUrl(mapUrl) : null;
        matchedRows.push({
          street,
          plate: plateRaw,
          mapUrl,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        });
        distinctMatched.add(plateNorm);
      } else {
        unsortedCount += 1;
      }
    }
    // أفس الإطارات للواجهة
    if (end < rows.length) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  return {
    matchedRows,
    unsortedCount,
    distinctMatchedPlates: distinctMatched.size,
  };
}
