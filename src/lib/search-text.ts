/**
 * تطبيع نص البحث/اللوحات للمقارنة دون لبس بين أشكال الأحرف العربية.
 */
export function normalizeSearchText(raw: string): string {
  let out = String(raw ?? "").trim().toLowerCase();
  out = out.replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
  out = out.replace(/[\u064B-\u065F\u0670]/g, ""); // تشكيل
  out = out.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString());
  out = out.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d).toString());
  out = out.replace(/ـ/g, "");
  out = out.replace(/[\s\-_./\\]+/g, " ").trim();
  return out;
}

/**
 * مطابقة دقيقة للبحث في التشييك/سجل الفرز:
 * - حرف عربي واحد: يظهر كرمز مستقل في اللوحة، أو ضمن الجزء الحرفي، أو في الشارع
 * - غير ذلك: تضمين عادي بعد التطبيع
 */
export function matchesPlateStreet(plate: string, street: string, query: string): boolean {
  const q = normalizeSearchText(query);
  if (!q) return false;
  const p = normalizeSearchText(plate);
  const s = normalizeSearchText(street);

  const isSingleArabicLetter = /^[\u0600-\u06FF]$/.test(q);
  if (isSingleArabicLetter) {
    const tokens = p.split(" ").filter(Boolean);
    if (tokens.some((t) => t === q)) return true;
    // أجزاء حرفية بعد إزالة الأرقام: "1234 ا ب ج" أو "1234ابج"
    const letterChunks = p
      .replace(/[0-9]+/g, " ")
      .split(" ")
      .filter(Boolean);
    if (letterChunks.some((chunk) => chunk === q || [...chunk].includes(q))) return true;
    return [...s].includes(q) || s.split(" ").includes(q);
  }

  return p.includes(q) || s.includes(q);
}
