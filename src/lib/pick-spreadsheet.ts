/**
 * منتقي ملفات جداول (xlsx/xls/csv) متوافق مع أندرويد:
 * الامتدادات الضيقة وحدها كثيرًا ما تفتح الكاميرا/المعرض بدل مستكشف الملفات.
 */

const SPREADSHEET_EXT = /\.(xlsx|xls|xlsb|csv|ods)$/i;

/** MIME + امتدادات للمستندات — بدون image/* حتى لا تظهر الكاميرا */
export const SPREADSHEET_ACCEPT_DESKTOP =
  ".xlsx,.xls,.xlsb,.csv,.ods," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/vnd.ms-excel," +
  "application/vnd.ms-excel.sheet.binary.macroEnabled.12," +
  "application/vnd.oasis.opendocument.spreadsheet," +
  "text/csv,text/comma-separated-values,application/csv,text/plain," +
  "application/octet-stream";

/** على الجوال: accept نجمي يفتح قائمة تطبيقات النظام (الملفات، Drive، التنزيلات، واتساب...) */
export const SPREADSHEET_ACCEPT_MOBILE = "*/*";

export function isMobileFilePicker(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

export function isSpreadsheetFile(file: File): boolean {
  if (SPREADSHEET_EXT.test(file.name)) return true;
  const t = (file.type || "").toLowerCase();
  if (!t) return true; // أندرويد أحيانًا لا يرسل MIME — نسمح بالاسم لاحقًا
  return (
    t.includes("sheet") ||
    t.includes("excel") ||
    t.includes("csv") ||
    t === "application/octet-stream" ||
    t === "text/plain" ||
    t === "application/zip" // بعض xlsx تُبلَّغ كـ zip
  );
}

type FilePickerWindow = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: { description: string; accept: Record<string, string[]> }[];
    excludeAcceptAllOption?: boolean;
  }) => Promise<{ getFile: () => Promise<File> }[]>;
};

/**
 * يفتح منتقي ملفات يفضّل مستندات الجهاز/التطبيقات على الجوال.
 * يُرجع الملف أو null إذا ألغى المستخدم أو رفض النوع.
 */
export function pickSpreadsheetFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const mobile = isMobileFilePicker();
    const win = window as FilePickerWindow;

    // showOpenFilePicker غير موثوق على أندرويد — نتجاوزه للجوال
    if (!mobile && typeof win.showOpenFilePicker === "function") {
      win
        .showOpenFilePicker({
          multiple: false,
          excludeAcceptAllOption: false,
          types: [
            {
              description: "جداول بيانات",
              accept: {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
                "application/vnd.ms-excel": [".xls", ".xlsb"],
                "text/csv": [".csv"],
                "application/vnd.oasis.opendocument.spreadsheet": [".ods"],
              },
            },
          ],
        })
        .then(async ([handle]) => {
          const file = await handle.getFile();
          resolve(isSpreadsheetFile(file) ? file : null);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") {
            resolve(null);
            return;
          }
          // فشل API — نكمل على input عادي
          openInput(resolve, mobile);
        });
      return;
    }

    openInput(resolve, mobile);
  });
}

function openInput(resolve: (file: File | null) => void, mobile: boolean) {
  const input = document.createElement("input");
  input.type = "file";
  // مهم: لا نضع capture إطلاقًا
  input.accept = mobile ? SPREADSHEET_ACCEPT_MOBILE : SPREADSHEET_ACCEPT_DESKTOP;
  input.multiple = false;
  // يساعد بعض متصفحات أندرويد على تفضيل مستندات لا وسائط
  input.setAttribute("data-document-picker", "1");

  let settled = false;
  const finish = (file: File | null) => {
    if (settled) return;
    settled = true;
    resolve(file);
    input.remove();
  };

  input.onchange = () => {
    const file = input.files?.[0] ?? null;
    if (!file) {
      finish(null);
      return;
    }
    if (!isSpreadsheetFile(file) && !SPREADSHEET_EXT.test(file.name)) {
      // على */* قد يختار صورة بالخطأ
      finish(null);
      return;
    }
    finish(file);
  };

  // إلغاء بدون onchange على بعض الأجهزة
  window.setTimeout(() => {
    input.addEventListener(
      "cancel",
      () => finish(null),
      { once: true }
    );
  }, 0);

  input.style.position = "fixed";
  input.style.left = "-9999px";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.click();
}
