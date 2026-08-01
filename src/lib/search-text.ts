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

function plateLetterTokens(plateNorm: string): string[] {
  return plateNorm
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => /^[\u0600-\u06FF]+$/.test(t));
}

/**
 * مطابقة بحث التشييك/سجل الفرز:
 * - حرف عربي واحد: يطابق فقط حروف اللوحة (رمز مستقل أو داخل كتلة حروف اللوحة)
 *   ولا يبحث في الشارع حتى لا تظهر لوحات د/ر بسبب كلمة في الشارع فيها «ج».
 * - غير ذلك: يبحث في اللوحة والشارع بعد التطبيع.
 */
export function matchesPlateStreet(plate: string, street: string, query: string): boolean {
  const q = normalizeSearchText(query);
  if (!q) return false;
  const p = normalizeSearchText(plate);
  const s = normalizeSearchText(street);

  const isSingleArabicLetter = /^[\u0600-\u06FF]$/.test(q);
  if (isSingleArabicLetter) {
    const letters = plateLetterTokens(p);
    if (letters.some((t) => t === q)) return true;
    // لوحات ملتصقة مع الرقم مثل "5227ابج" أو "ابج"
    const glued = p
      .replace(/[0-9]+/g, " ")
      .split(" ")
      .filter((t) => /^[\u0600-\u06FF]+$/.test(t));
    if (glued.some((t) => t === q || (t.length > 1 && [...t].includes(q)))) return true;
    return false;
  }

  return p.includes(q) || s.includes(q);
}
