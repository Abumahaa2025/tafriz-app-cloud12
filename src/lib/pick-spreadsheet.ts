/**
 * منتقي جداول Excel/CSV لأندرويد وChrome.
 * على أندرويد: accept بالامتدادات فقط — قوائم MIME الطويلة تفتح
 * «اختيار إجراء: كاميرا / صور» بدل المستندات على أجهزة كثيرة (سامسونج وغيرها).
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
  // كروم أندرويد أحيانًا بدون كلمة Mobile في UA
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

/**
 * يفتح منتقي مستندات Excel/CSV (بدون كاميرا/معرض).
 * يجب استدعاؤه مباشرة من onClick (إيماءة المستخدم).
 */
export function pickSpreadsheetFile(): Promise<File | null> {
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

  const accept = spreadsheetAcceptForDevice();
  // setAttribute أوثق من الخاصية على بعض WebView أندرويد
  input.setAttribute("accept", accept);
  input.accept = accept;
  input.removeAttribute("capture");

  let settled = false;
  const finish = (file: File | null) => {
    if (settled) return;
    settled = true;
    window.removeEventListener("focus", onFocusCheck);
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

  // إن أغلق المستخدم المنتقي بدون onchange/cancel
  const onFocusCheck = () => {
    window.setTimeout(() => {
      if (!settled && !input.files?.length) finish(null);
    }, 400);
  };
  window.addEventListener("focus", onFocusCheck, { once: true });

  // مرئي بصفر شفافية داخل الشاشة — بعض أجهزة سامسونج تتجاهل input خارج الشاشة
  input.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;opacity:0.001;z-index:2147483647;pointer-events:none;";
  document.body.appendChild(input);

  // نقرة متزامنة ضمن إيماءة المستخدم
  input.click();
}
