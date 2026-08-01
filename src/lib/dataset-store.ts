import { loadLocal, saveLocal } from "./storage";

export interface DatasetEntry {
  id: string;
  fileName: string;
  uploadedAt: string;
  headers: string[];
  rows: Record<string, string | number>[];
}

const KEY = "uploaded_datasets";
const MAX_DATASETS = 15; // يمنع تضخّم التخزين المحلي بمرور الوقت
const MAX_ROWS_PER_DATASET = 2000; // حماية من ملفات ضخمة جدًا تتجاوز سعة localStorage

/** يُستدعى عند كل رفع ملف ناجح — يحفظ الملف كاملًا (كل الصفوف) في قاعدة البيانات المحلية. */
export function addDataset(fileName: string, headers: string[], rows: Record<string, string | number>[]) {
  const datasets = loadLocal<DatasetEntry[]>(KEY, []);
  const entry: DatasetEntry = {
    id: crypto.randomUUID(),
    fileName,
    uploadedAt: new Date().toISOString(),
    headers,
    rows: rows.slice(0, MAX_ROWS_PER_DATASET),
  };
  saveLocal(KEY, [entry, ...datasets].slice(0, MAX_DATASETS));
}

export function listDatasets(): DatasetEntry[] {
  return loadLocal<DatasetEntry[]>(KEY, []);
}

export interface DatasetSearchHit {
  dataset: DatasetEntry;
  row: Record<string, string | number>;
  matchedColumn: string;
  matchedValue: string;
}

/** بحث حي بأي حرف أو رقم عبر كل أعمدة كل الملفات المرفوعة كاملة. */
export function searchDatasets(query: string): DatasetSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: DatasetSearchHit[] = [];
  for (const dataset of listDatasets()) {
    for (const row of dataset.rows) {
      for (const col of dataset.headers) {
        const value = String(row[col] ?? "");
        if (value.toLowerCase().includes(q)) {
          hits.push({ dataset, row, matchedColumn: col, matchedValue: value });
          break; // صف واحد = نتيجة واحدة حتى لو تطابق أكثر من عمود فيه
        }
      }
    }
  }
  return hits;
}
