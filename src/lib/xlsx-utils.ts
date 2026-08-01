import * as XLSX from "xlsx";

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string | number>[];
}

/**
 * يقرأ أول ورقة من ملف xlsx/xls/csv ويحوّلها لعناوين أعمدة + صفوف بيانات.
 *
 * سبب إعادة الكتابة: الطريقة القديمة كانت تعتمد على XLSX.utils.sheet_to_json
 * لاستنتاج العناوين تلقائيًا من مفاتيح أول صف — وهذا يفشل بصمت (يرجع صفر
 * أعمدة) مع ملفات إكسل حقيقية فيها صف عنوان فارغ الخلايا، أو صف أول غير
 * محاذٍ تمامًا، فيصير عمود اللوحة/الشارع فاضي وزر "فرز جديد" يبقى معطّل.
 * الطريقة الجديدة تقرأ الورقة كمصفوفة صفوف خام أولًا (header: 1)، تاخذ أول
 * صف فيه بيانات فعلية كعناوين، وتبني الصفوف يدويًا — أكثر ثباتًا مع أي شكل
 * ملف واقعي.
 */
export async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  // أول صف فيه خلية غير فارغة واحدة على الأقل يُعتبر صف العناوين
  const headerRowIndex = rawRows.findIndex((row) =>
    row.some((cell) => String(cell ?? "").trim() !== "")
  );

  if (headerRowIndex === -1) {
    return { headers: [], rows: [] };
  }

  const headerRow = rawRows[headerRowIndex];
  const headers = headerRow.map((cell, i) => {
    const text = String(cell ?? "").trim();
    return text !== "" ? text : `عمود ${i + 1}`;
  });

  const rows: Record<string, string | number>[] = [];
  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const rawRow = rawRows[r];
    if (!rawRow || rawRow.every((cell) => String(cell ?? "").trim() === "")) continue;

    const rowObj: Record<string, string | number> = {};
    headers.forEach((h, i) => {
      const value = rawRow[i];
      rowObj[h] = value === undefined || value === null ? "" : (value as string | number);
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

/**
 * Finds the header that best matches a keyword (e.g. "لوحة" for plate number columns).
 * `avoid` lets a second call (e.g. street column) skip whatever the first call
 * (e.g. plate column) already picked, so the two never silently collide on
 * the same fallback column when neither keyword matches any header — that
 * collision was producing nonsense results (a column matched against itself).
 */
export function guessColumn(headers: string[], keywords: string[], avoid?: string | null): string | null {
  for (const keyword of keywords) {
    const match = headers.find((h) => h.includes(keyword));
    if (match) return match;
  }
  const fallback = headers.find((h) => h !== avoid);
  return fallback ?? headers[0] ?? null;
}
