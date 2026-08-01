// Converts Arabic-Indic (٠١٢٣٤٥٦٧٨٩) and Persian digits to Western digits,
// strips spaces/dashes, and trims — so "٥٢٢٧ دله" and "5227دله" match.
const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

export function normalizePlate(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  let s = String(raw).trim();

  s = s.replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)));
  s = s.replace(/[۰-۹]/g, (d) => String(PERSIAN.indexOf(d)));

  // remove whitespace, dashes, and tatweel so formatting differences don't break a match
  s = s.replace(/[\s\-_ـ]/g, "");

  return s;
}

export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase();
}
