/**
 * إذا فتح التطبيق برابط "?imported=1" (بعد مشاركة ملف من واتساب مثلًا عبر
 * public/sw.js)، هذه الدالة تسحب الملف من التخزين المؤقت وتعيده كملف عادي.
 */
export async function consumeSharedFile(): Promise<File | null> {
  const params = new URLSearchParams(window.location.search);
  if (params.get("imported") !== "1") return null;

  // نظّف الرابط فورًا حتى لا يُعاد نفس الملف عند تحديث الصفحة
  window.history.replaceState({}, "", window.location.pathname);

  if (!("caches" in window)) return null;

  try {
    const cache = await caches.open("tafriz-shared");
    const response = await cache.match("/__shared-file");
    if (!response) return null;

    const name = response.headers.get("x-shared-file-name") || "shared-file.xlsx";
    const blob = await response.blob();
    await cache.delete("/__shared-file");
    return new File([blob], name);
  } catch {
    return null;
  }
}
