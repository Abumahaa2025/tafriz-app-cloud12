import * as React from "react";
import { Download, Upload, MessageCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { nativeShareText } from "@/lib/native-share";
import { isMobileFilePicker, isSpreadsheetFile, spreadsheetAcceptForDevice } from "@/lib/pick-spreadsheet";
import { cn } from "@/lib/utils";

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
  const importId = React.useId();
  const [status, setStatus] = React.useState<string | null>(null);
  const mobile = isMobileFilePicker();

  function flashStatus(msg: string) {
    setStatus(msg);
    setTimeout(() => setStatus(null), 2500);
  }

  async function handleExport() {
    const text = buildExportText();

    const usedNativeShare = await nativeShareText(exportFileName, text, "نتائج الفرز");
    if (usedNativeShare) return;

    const file = new File([text], exportFileName, { type: "text/plain" });
    const nav = navigator as NavShare;

    if (nav.share) {
      if (nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: "نتائج الفرز", text });
          return;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
        }
      }
      try {
        await nav.share({ title: "نتائج الفرز", text });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName;
    a.click();
    URL.revokeObjectURL(url);
    flashStatus("متصفحك لا يدعم قائمة المشاركة، تم تنزيل الملف بدل ذلك");
  }

  function handleOpenWhatsApp() {
    const text = buildExportText();
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  function onImportChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!isSpreadsheetFile(f)) {
      flashStatus("اختر ملف Excel أو CSV من الملفات — وليس الكاميرا");
      return;
    }
    onImport(f);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <label
          htmlFor={importId}
          className={cn(buttonVariants({ variant: "secondary" }), "flex-1 cursor-pointer")}
        >
          <input
            id={importId}
            type="file"
            {...(mobile ? {} : { accept: spreadsheetAcceptForDevice() })}
            className="sr-only"
            onChange={onImportChange}
          />
          <Upload className="h-4 w-4" />
          استيراد
        </label>
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
