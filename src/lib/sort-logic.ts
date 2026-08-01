import { normalizePlate } from "./normalize";
import { ParsedSheet } from "./xlsx-utils";

export interface SortResultRow {
  street: string;
  plate: string;
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
  referralPlateColumn: string
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
      matchedRows.push({ street, plate: plateRaw });
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
