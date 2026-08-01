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
 * يستخرج حروف اللوحة فقط (رموز مفردة أو كتلة 1–3 أحرف ملتصقة بالرقم).
 * لا يعامل أسماء الشوارع داخل حقل اللوحة كحروف لوحة.
 */
export function extractPlateLetters(plateNorm: string): string[] {
  const out = new Set<string>();

  // "5227 د ر" أو "د ر 5227"
  for (const t of plateNorm.split(" ").map((x) => x.trim())) {
    if (/^[\u0600-\u06FF]$/.test(t)) out.add(t);
  }

  // "5227ابج" / "ابج5227" — كتلة حروف اللوحة الملتصقة بالرقم فقط
  for (const m of plateNorm.matchAll(/[0-9]+([\u0600-\u06FF]{1,3})|([\u0600-\u06FF]{1,3})[0-9]+/g)) {
    const block = m[1] || m[2] || "";
    for (const ch of block) out.add(ch);
  }

  return [...out];
}

/**
 * مطابقة بحث التشييك/سجل الفرز:
 * - حرف عربي واحد: يطابق فقط حروف اللوحة، وليس الشارع
 *   (حتى لا تظهر لوحات د/ر بسبب كلمة مثل «جدة» في الشارع).
 * - غير ذلك: يبحث في اللوحة والشارع بعد التطبيع.
 */
export function matchesPlateStreet(plate: string, street: string, query: string): boolean {
  const q = normalizeSearchText(query);
  if (!q) return false;
  const p = normalizeSearchText(plate);
  const s = normalizeSearchText(street);

  const isSingleArabicLetter = /^[\u0600-\u06FF]$/.test(q);
  if (isSingleArabicLetter) {
    return extractPlateLetters(p).includes(q);
  }

  return p.includes(q) || s.includes(q);
}
