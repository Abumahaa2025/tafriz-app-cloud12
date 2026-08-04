/**
 * منتقي جداول Excel/CSV لأندرويد وChrome:
 * تجنّب accept للكل أو للصور وخاصية capture — لأنها تفتح الكاميرا/المعرض.
 */

const SPREADSHEET_EXT = /\.(xlsx|xls|xlsb|csv|ods)$/i;

/**
 * MIME + امتدادات للمستندات فقط.
 * على أندرويد يفتح «الملفات / My Files / Drive» وليس الكاميرا.
 */
export const SPREADSHEET_ACCEPT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/vnd.ms-excel," +
  "application/vnd.ms-excel.sheet.binary.macroEnabled.12," +
  "application/vnd.oasis.opendocument.spreadsheet," +
  "text/csv," +
  "text/comma-separated-values," +
  "application/csv," +
  ".xlsx,.xls,.xlsb,.csv,.ods";

export function isMobileFilePicker(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
}

export function isSpreadsheetFile(file: File): boolean {
  if (SPREADSHEET_EXT.test(file.name)) return true;
  const t = (file.type || "").toLowerCase();
  if (!t) return true;
  return (
    t.includes("sheet") ||
    t.includes("excel") ||
    t.includes("csv") ||
    t === "application/octet-stream" ||
    t === "text/plain" ||
    t === "application/zip"
  );
}

type FilePickerWindow = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ getFile: () => Promise<File> }[]>;
};

/**
 * يفتح منتقي مستندات Excel/CSV (بدون كاميرا/معرض).
 */
export function pickSpreadsheetFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const mobile = isMobileFilePicker();
    const win = window as FilePickerWindow;

    // سطح المكتب فقط — على الجوال نستخدم input بـ MIME مستندات
    if (!mobile && typeof win.showOpenFilePicker === "function") {
      win
        .showOpenFilePicker({
          multiple: false,
          excludeAcceptAllOption: false,
          types: [
            {
              description: "ملفات Excel",
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
          openDocumentInput(resolve);
        });
      return;
    }

    openDocumentInput(resolve);
  });
}

function openDocumentInput(resolve: (file: File | null) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = false;
  // لا تستخدم قبول الكل أو الصور أو capture
  input.accept = SPREADSHEET_ACCEPT;
  input.removeAttribute("capture");

  let settled = false;
  const finish = (file: File | null) => {
    if (settled) return;
    settled = true;
    try {
      input.remove();
    } catch {
      /* ignore */
    }
    resolve(file);
  };

  input.onchange = () => {
    const file = input.files?.[0] ?? null;
    if (!file) {
      finish(null);
      return;
    }
    finish(isSpreadsheetFile(file) ? file : null);
  };

  input.addEventListener("cancel", () => finish(null), { once: true });

  // إبقاء العنصر في الـ DOM أثناء فتح المنتقي (أوثق على أندرويد)
  input.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;width:1px;height:1px;";
  document.body.appendChild(input);
  input.click();
}
