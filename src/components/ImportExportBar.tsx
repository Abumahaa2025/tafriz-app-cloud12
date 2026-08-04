import * as React from "react";
import { Download, Upload, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { nativeShareText } from "@/lib/native-share";
import { SPREADSHEET_ACCEPT, pickSpreadsheetFile } from "@/lib/pick-spreadsheet";

interface ImportExportBarProps {
  /** Called with the picked file so the parent can route it into its own upload logic. */
  onImport: (file: File) => void;
  /** Builds the text to export (e.g. matched plate numbers) when the user taps "تصدير". */
  buildExportText: () => string;
  exportFileName?: string;
}

type NavShare = Navigator & {
  canShare?: (data: { files?: File[]; text?: string; title?: string }) => boolean;
  share?: (data: ShareData) => Promise<void>;
};


export function ImportExportBar({
  onImport,
  buildExportText,
  exportFileName = "نتائج-الفرز.txt",
}: ImportExportBarProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [status, setStatus] = React.useState<string | null>(null);

  function flashStatus(msg: string) {
    setStatus(msg);
    setTimeout(() => setStatus(null), 2500);
  }

  async function handleExport() {
    const text = buildExportText();

    // لو التطبيق مبني كتطبيق أندرويد/آيفون حقيقي (Capacitor)، هذا يفتح
    // قائمة المشاركة الحقيقية لنظام التشغيل نفسه (واتساب يظهر فيها دائمًا).
    const usedNativeShare = await nativeShareText(exportFileName, text, "نتائج الفرز");
    if (usedNativeShare) return;

    const file = new File([text], exportFileName, { type: "text/plain" });
    const nav = navigator as NavShare;

    // المحاولة الأولى: مشاركة الملف نفسه — تفتح قائمة تطبيقات النظام
    // (واتساب، البريد، درايف...) مباشرة على الجوال وعلى ويندوز 10/11.
    if (nav.share) {
      if (nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: "نتائج الفرز", text });
          return;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return; // المستخدم ألغى بنفسه
        }
      }
      // المحاولة الثانية: مشاركة نص فقط (بعض المتصفحات/الأنظمة تدعم النص
      // ولا تدعم الملفات، لكنها تفتح نفس قائمة التطبيقات).
      try {
        await nav.share({ title: "نتائج الفرز", text });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    // آخر حل: تنزيل الملف (متصفحات لا تدعم المشاركة إطلاقًا، مثل بعض متصفحات سطح المكتب)
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName;
    a.click();
    URL.revokeObjectURL(url);
    flashStatus("متصفحك لا يدعم قائمة المشاركة، تم تنزيل الملف بدل ذلك");
  }


  /** زر مباشر لواتساب كما في نسخة كلاود / الفيديو */
  function handleOpenWhatsApp() {
    const text = buildExportText();
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  async function handleImport() {
    const file = await pickSpreadsheetFile();
    if (!file) {
      flashStatus("اختر ملف Excel/CSV من الملفات أو التطبيقات");
      return;
    }
    onImport(file);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={SPREADSHEET_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = "";
          }}
        />
        <Button variant="secondary" className="flex-1" onClick={handleImport}>
          <Upload className="h-4 w-4" />
          استيراد
        </Button>
        <Button variant="secondary" className="flex-1" onClick={handleExport}>
          <Download className="h-4 w-4" />
          تصدير
        </Button>
      </div>
      <Button
        className="w-full bg-[#25D366] text-white hover:bg-[#25D366]/90"
        onClick={handleOpenWhatsApp}
      >
        <MessageCircle className="h-4 w-4" />
        فتح واتساب مباشرة
      </Button>
      {status && <p className="text-center text-[11px] text-muted-foreground">{status}</p>}
      <p className="text-center text-[11px] leading-5 text-muted-foreground">
        لاستيراد ملف من واتساب مباشرة: ثبّت التطبيق على شاشتك الرئيسية، وبعدها
        استخدم زر «مشاركة» داخل واتساب واختر «الفرز» من القائمة.
      </p>
    </div>
  );
}
