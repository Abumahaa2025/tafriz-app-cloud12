import { idbGet, idbSet } from "./idb";
import type { ParsedSheet } from "./xlsx-utils";

export interface SortLibraryFile {
  id: string;
  fileName: string;
  uploadedAt: string;
  /** true = يدخل في الفرز (فرز) · false = مستبعد (خارج) */
  enabled: boolean;
  headers: string[];
  rows: Record<string, string | number>[];
}

const LIBRARY_KEY = "sort_data_library_v1";
const MAX_FILES = 20;

export async function loadSortLibrary(): Promise<SortLibraryFile[]> {
  const list = await idbGet<SortLibraryFile[]>(LIBRARY_KEY);
  return Array.isArray(list) ? list : [];
}

export async function saveSortLibrary(files: SortLibraryFile[]): Promise<void> {
  await idbSet(LIBRARY_KEY, files.slice(0, MAX_FILES));
}

export function createLibraryFile(
  fileName: string,
  sheet: ParsedSheet,
  enabled = true
): SortLibraryFile {
  return {
    id: crypto.randomUUID(),
    fileName,
    uploadedAt: new Date().toISOString(),
    enabled,
    headers: sheet.headers,
    rows: sheet.rows,
  };
}

/** دمج كل الملفات المفعّلة في ورقة واحدة للفرز */
export function mergeEnabledSheets(files: SortLibraryFile[]): ParsedSheet | null {
  const enabled = files.filter((f) => f.enabled && f.rows.length > 0);
  if (enabled.length === 0) return null;

  const headerSet = new Set<string>();
  for (const f of enabled) {
    for (const h of f.headers) headerSet.add(h);
  }
  const headers = [...headerSet];
  const rows: Record<string, string | number>[] = [];

  for (const f of enabled) {
    for (const row of f.rows) {
      const next: Record<string, string | number> = {};
      for (const h of headers) {
        next[h] = row[h] ?? "";
      }
      rows.push(next);
    }
  }
  return { headers, rows };
}

/** إلحاق صفوف ملف على إدخال موجود (مع توحيد الأعمدة) */
export function appendSheetToFile(
  target: SortLibraryFile,
  sheet: ParsedSheet
): SortLibraryFile {
  const headerSet = new Set([...target.headers, ...sheet.headers]);
  const headers = [...headerSet];
  const rows = [
    ...target.rows.map((row) => {
      const next: Record<string, string | number> = {};
      for (const h of headers) next[h] = row[h] ?? "";
      return next;
    }),
    ...sheet.rows.map((row) => {
      const next: Record<string, string | number> = {};
      for (const h of headers) next[h] = row[h] ?? "";
      return next;
    }),
  ];
  return { ...target, headers, rows };
}

/**
 * تحويل نص ملصوق (سطر = لوحة) إلى ورقة إحالة جاهزة للفرز.
 */
export function platesFromPasteText(text: string): ParsedSheet {
  const header = "اللوحة";
  const rows: Record<string, string | number>[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const plate = line.trim();
    if (!plate) continue;
    const key = plate.replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ [header]: plate });
  }
  return { headers: [header], rows };
}

export function totalPlateEstimate(files: SortLibraryFile[]): number {
  return files.reduce((sum, f) => sum + (f.enabled ? f.rows.length : 0), 0);
}
