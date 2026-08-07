/**
 * منتقي جداول Excel/CSV لأندرويد وChrome.
 *
 * على أندرويد/سامسونج:
 * - بدون accept → Intent عام يفتح «اختيار إجراء: كاميرا / صور»
 * - MIME عريض مثل application/* → نفس المشكلة أو أسوأ
 * - امتدادات فقط (.xlsx,.xls,…) → يفضّل مستندات/ملفات على أغلب الأجهزة
 */

const SPREADSHEET_EXT = /\.(xlsx|xls|xlsb|csv|ods)$/i;

/** سطح المكتب: MIME + امتدادات */
export const SPREADSHEET_ACCEPT_DESKTOP =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/vnd.ms-excel," +
  "text/csv," +
  ".xlsx,.xls,.xlsb,.csv,.ods";

/**
 * الجوال: امتدادات فقط (بدون MIME).
 * هذا ما يدفع أندرويد لفتح «الملفات / المستندات» وليس الكاميرا.
 */
export const SPREADSHEET_ACCEPT_MOBILE = ".xlsx,.xls,.xlsb,.csv,.ods";

/** توافق خلفي — يُفضّل spreadsheetAcceptForDevice() */
export const SPREADSHEET_ACCEPT = SPREADSHEET_ACCEPT_DESKTOP;

export function isMobileFilePicker(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true;
  }
  if (/Android/i.test(ua)) return true;
  return false;
}

export function spreadsheetAcceptForDevice(): string {
  return isMobileFilePicker() ? SPREADSHEET_ACCEPT_MOBILE : SPREADSHEET_ACCEPT_DESKTOP;
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

export type SpreadsheetPickResult =
  | { status: "picked"; file: File }
  | { status: "cancel" }
  | { status: "rejected" };

/**
 * يفتح منتقي مستندات Excel/CSV (بدون كاميرا/معرض قدر الإمكان).
 * يجب استدعاؤه مباشرة من onClick (إيماءة المستخدم).
 */
export function pickSpreadsheetFile(): Promise<File | null> {
  return pickSpreadsheetDetailed().then((r) => (r.status === "picked" ? r.file : null));
}

/** نفس المنتقي مع تمييز الإلغاء عن ملف مرفوض */
export function pickSpreadsheetDetailed(): Promise<SpreadsheetPickResult> {
  return new Promise((resolve) => {
    const mobile = isMobileFilePicker();
    const win = window as FilePickerWindow;

    // سطح المكتب فقط — File System Access API
    if (!mobile && typeof win.showOpenFilePicker === "function") {
      win
        .showOpenFilePicker({
          multiple: false,
          excludeAcceptAllOption: true,
          types: [
            {
              description: "Excel",
              accept: {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
                "application/vnd.ms-excel": [".xls", ".xlsb"],
                "text/csv": [".csv"],
              },
            },
          ],
        })
        .then(async ([handle]) => {
          const file = await handle.getFile();
          resolve(isSpreadsheetFile(file) ? { status: "picked", file } : { status: "rejected" });
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") {
            resolve({ status: "cancel" });
            return;
          }
          openDocumentInput(resolve);
        });
      return;
    }

    openDocumentInput(resolve);
  });
}

function openDocumentInput(resolve: (result: SpreadsheetPickResult) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = false;

  // امتدادات على الجوال — بدون MIME عريض وبدون ترك الحقل فارغًا (يفتح الكاميرا على سامسونج)
  const accept = spreadsheetAcceptForDevice();
  input.setAttribute("accept", accept);
  input.accept = accept;
  input.removeAttribute("capture");

  let settled = false;
  const finish = (result: SpreadsheetPickResult) => {
    if (settled) return;
    settled = true;
    window.removeEventListener("focus", onFocusCheck);
    try {
      input.remove();
    } catch {
      /* ignore */
    }
    resolve(result);
  };

  input.onchange = () => {
    const file = input.files?.[0] ?? null;
    if (!file) {
      finish({ status: "cancel" });
      return;
    }
    finish(isSpreadsheetFile(file) ? { status: "picked", file } : { status: "rejected" });
  };

  input.addEventListener("cancel", () => finish({ status: "cancel" }), { once: true });

  const onFocusCheck = () => {
    window.setTimeout(() => {
      if (!settled && !input.files?.length) finish({ status: "cancel" });
    }, 400);
  };
  window.addEventListener("focus", onFocusCheck, { once: true });

  input.style.cssText =
    "position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
  document.body.appendChild(input);
  input.click();
}
