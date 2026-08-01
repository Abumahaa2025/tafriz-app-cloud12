import { Capacitor } from "@capacitor/core";

// Rollup (المستخدم في `vite build`) يحاول يحلّ أي import() حتى لو فيه
// تعليق /* @vite-ignore */، لأن هذا التعليق يوقف تحذير Vite في وضع التطوير
// فقط وليس تحليل Rollup وقت البناء. لتفادي فشل البناء على Vercel بسبب حزمة
// اختيارية (@capgo/capacitor-share-target) غير مثبَّتة، نستخدم import ديناميكي
// حقيقي عبر Function بحيث ما يقدر Rollup يكتشف اسم الحزمة وقت البناء إطلاقًا.
const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<unknown>;

interface NativeSharedFileEvent {
  files?: { name: string; mimeType: string; uri: string }[];
}

/**
 * يستمع لحدث "تمت مشاركة ملف لهذا التطبيق" القادم من نظام أندرويد نفسه —
 * يعني لما يفتح المستخدم واتساب، يضغط "مشاركة" على ملف، ويختار "الفرز" من
 * قائمة التطبيقات، هذا الملف يوصل هنا تلقائيًا ويُمرَّر لنفس منطق رفع
 * "الداتا" الموجود أصلًا.
 *
 * يحتاج تثبيت @capgo/capacitor-share-target (npm install @capgo/capacitor-share-target)
 * بعد تحويل المشروع لتطبيق أندرويد حقيقي — راجع README.md لخطوات الإعداد
 * الكاملة (تعديل AndroidManifest.xml). قبل ذلك، هذه الدالة لا تفعل شيئًا على
 * الويب العادي ولا تكسر أي شيء لو الإضافة غير مثبَّتة بعد — ولا تكسر البناء
 * على Vercel أيضًا (هذا بالضبط ما كان يحدث قبل هذا الإصلاح).
 */
export function listenForNativeSharedFile(onFile: (file: File) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  let removeListener: (() => void) | null = null;
  let cancelled = false;

  (async () => {
    try {
      // dynamic import: لا يكسر أي شيء لو الإضافة غير مثبَّتة بعد
      const mod = await dynamicImport("@capgo/capacitor-share-target").catch(() => null);
      if (!mod || cancelled) return;

      const { CapacitorShareTarget } = mod as {
        CapacitorShareTarget: {
          addListener: (
            event: "shareReceived",
            cb: (event: NativeSharedFileEvent) => void
          ) => Promise<{ remove: () => void }>;
        };
      };

      const handle = await CapacitorShareTarget.addListener("shareReceived", async (event) => {
        const shared = event.files?.[0];
        if (!shared) return;
        try {
          const webPath = Capacitor.convertFileSrc(shared.uri);
          const response = await fetch(webPath);
          const blob = await response.blob();
          onFile(new File([blob], shared.name || "shared-file.xlsx", { type: shared.mimeType }));
        } catch {
          // تعذّرت قراءة الملف المشارَك — تجاهل بصمت بدل ما نكسر التطبيق
        }
      });

      if (cancelled) {
        handle.remove();
      } else {
        removeListener = () => handle.remove();
      }
    } catch {
      // الإضافة غير مثبَّتة بعد أو فشل تسجيل المستمع — لا تأثير على بقية التطبيق
    }
  })();

  return () => {
    cancelled = true;
    removeListener?.();
  };
}
