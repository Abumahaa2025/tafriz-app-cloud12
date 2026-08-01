import { Capacitor } from "@capacitor/core";

/**
 * يشتغل فقط بعد ما تحوّل المشروع لتطبيق أندرويد/آيفون حقيقي عبر Capacitor
 * (راجع "تحويل المشروع لتطبيق جوال حقيقي" في README.md). على الويب العادي
 * ترجع false فورًا بدون أي تأثير، ويكمل الكود القديم (Web Share API) كما هو.
 *
 * الفرق عن Web Share API: هذا يفتح قائمة المشاركة **الحقيقية** لنظام أندرويد/
 * آيفون نفسه (نفس القائمة اللي يفتحها أي تطبيق مثبَّت)، فتظهر فيها واتساب
 * بشكل موثوق دائمًا، بعكس دعم المتصفح للمشاركة اللي يوصف رسميًا بأنه
 * "متفاوت" (spotty) حسب توثيق Capacitor نفسه.
 */
export async function nativeShareText(fileName: string, text: string, title: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");

    await Filesystem.writeFile({
      path: fileName,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });

    await Share.share({ title, text, url: uri, dialogTitle: title });
    return true;
  } catch {
    // المستخدم ألغى المشاركة، أو الإضافات الأصلية غير مثبَّتة بعد — نكمل
    // على منطق الويب الاحتياطي بدل ما نكسر الزر
    return false;
  }
}
