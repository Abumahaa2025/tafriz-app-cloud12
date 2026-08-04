import * as React from "react";
import { BarChart3, FileText, Eraser, Share2, Copy, ListChecks, ChevronDown, ScanLine, Download, Trash2, ArrowUpFromLine, ClipboardPaste } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileDropCard } from "@/components/FileDropCard";
import { SegmentedToggle } from "@/components/SegmentedToggle";
import { SortSummaryCard } from "@/components/SortSummaryCard";
import { PercentStepper } from "@/components/PercentStepper";
import { StatPill } from "@/components/StatPill";
import { ResultsTable } from "@/components/ResultsTable";
import { ImportExportBar } from "@/components/ImportExportBar";
import { AppMenu, MenuTarget } from "@/components/AppMenu";
import * as XLSX from "xlsx";
import { Capacitor } from "@capacitor/core";
import { parseSpreadsheet, guessColumn, ParsedSheet } from "@/lib/xlsx-utils";
import { runSortChunked, matchedPlateNorms, SortResult } from "@/lib/sort-logic";
import { loadLocal, saveLocal } from "@/lib/storage";
import { idbGet, idbRemove, idbSet } from "@/lib/idb";
import { consumeSharedFile } from "@/lib/shared-file";
import { listenForNativeSharedFile } from "@/lib/native-import";
import { backend } from "@/lib/backend";
import { SPREADSHEET_ACCEPT } from "@/lib/pick-spreadsheet";
import { useAuth } from "@/context/AuthContext";
import {
  loadSortLibrary,
  saveSortLibrary,
  createLibraryFile,
  mergeEnabledSheets,
  appendSheetToFile,
  platesFromPasteText,
  totalPlateEstimate,
  type SortLibraryFile,
} from "@/lib/sort-file-library";

const SORT_DATA_IDB = "sort_data_sheet_v1";
const SORT_REFERRAL_IDB = "sort_referral_sheet_v1";
/** لوحات سبق ظهورها في فرز كلي/جديد — أساس استبعاد «فرز جديد» */
const SORT_BASELINE_IDB = "sort_baseline_plates_v1";

type NavShare = Navigator & {
  canShare?: (data: { files?: File[]; text?: string; title?: string }) => boolean;
  share?: (data: ShareData) => Promise<void>;
};

type SortMode = "full" | "new";
type FileMeta = { name: string };

interface PersistedSortState {
  dataFileMeta: FileMeta | null;
  referralFileMeta: FileMeta | null;
  plateColumn: string;
  streetColumn: string;
  mapColumn: string;
  referralPlateColumn: string;
  result: SortResult | null;
  /** قديمة — لا تُحفظ بعد الآن (كانت تسبب بطئًا شديدًا) */
  dataSheet?: ParsedSheet | null;
  referralSheet?: ParsedSheet | null;
}

const EMPTY_STATE: PersistedSortState = {
  dataFileMeta: null,
  referralFileMeta: null,
  plateColumn: "",
  streetColumn: "",
  mapColumn: "",
  referralPlateColumn: "",
  result: null,
};

function guessMapColumn(headers: string[]): string {
  const keywords = ["خريط", "maps", "map", "gps", "موقع", "رابط", "goo", "إحداث", "coordinates"];
  for (const keyword of keywords) {
    const match = headers.find((h) => h.toLowerCase().includes(keyword.toLowerCase()));
    if (match) return match;
  }
  return "";
}

// تُقرأ مرة واحدة بشكل متزامن (وليس داخل useEffect) حتى لا يحدث فيها سباق
// مع عملية الحفظ — كانت هذه بالضبط سبب اختفاء البيانات بمجرد الانتقال لتبويب
// آخر: كانت useEffect الحفظ تكتب فوق البيانات المحفوظة بقيم فارغة قبل ما
// تكتمل استعادتها.
function readPersistedState(): PersistedSortState {
  const raw = loadLocal<PersistedSortState>("last_sort_state", EMPTY_STATE);
  // تنظيف التخزين القديم الثقيل مرة واحدة (لو بقي من نسخة سابقة)
  if (raw.dataSheet || raw.referralSheet) {
    const light: PersistedSortState = {
      dataFileMeta: raw.dataFileMeta,
      referralFileMeta: raw.referralFileMeta,
      plateColumn: raw.plateColumn,
      streetColumn: raw.streetColumn,
      mapColumn: raw.mapColumn ?? "",
      referralPlateColumn: raw.referralPlateColumn,
      result: raw.result,
    };
    saveLocal("last_sort_state", light);
    return light;
  }
  return raw;
}

interface SortPageProps {
  onNavigate?: (target: MenuTarget | "ai-scan") => void;
}

export default function SortPage({ onNavigate }: SortPageProps = {}) {
  const { user } = useAuth();
  const [mode, setMode] = React.useState<SortMode>("full");
  const [menuOpen, setMenuOpen] = React.useState(false);

  const initial = React.useRef(readPersistedState()).current;

  // data file state (fileMeta persists the file NAME across reloads even
  // though the raw File object itself can't be stored in localStorage)
  const [dataFile, setDataFile] = React.useState<File | FileMeta | null>(initial.dataFileMeta);
  const [dataSheet, setDataSheet] = React.useState<ParsedSheet | null>(null);
  const [dataProgress, setDataProgress] = React.useState<number | null>(null);
  const [dataPassword, setDataPassword] = React.useState("");
  const [plateColumn, setPlateColumn] = React.useState<string>(initial.plateColumn);
  const [streetColumn, setStreetColumn] = React.useState<string>(initial.streetColumn);
  const [mapColumn, setMapColumn] = React.useState<string>(initial.mapColumn ?? "");

  // referral file state
  const [referralFile, setReferralFile] = React.useState<File | FileMeta | null>(initial.referralFileMeta);
  const [referralSheet, setReferralSheet] = React.useState<ParsedSheet | null>(null);
  const [referralProgress, setReferralProgress] = React.useState<number | null>(null);
  const [referralPassword, setReferralPassword] = React.useState("");
  const [referralPlateColumn, setReferralPlateColumn] = React.useState<string>(initial.referralPlateColumn);

  const [zoom, setZoom] = React.useState(100);
  const [result, setResult] = React.useState<SortResult | null>(initial.result);
  const [actionNotice, setActionNotice] = React.useState<string | null>(null);
  const resultsRef = React.useRef<HTMLDivElement | null>(null);
  const noticeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const baselineRef = React.useRef<Set<string>>(new Set());
  const [library, setLibrary] = React.useState<SortLibraryFile[]>([]);
  const [pasteText, setPasteText] = React.useState("");
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const appendInputRef = React.useRef<HTMLInputElement | null>(null);
  const appendTargetId = React.useRef<string | null>(null);



  async function persistLibrary(next: SortLibraryFile[]) {
    setLibrary(next);
    await saveSortLibrary(next);
    const merged = mergeEnabledSheets(next);
    if (merged) {
      setDataSheet(merged);
      setDataFile({ name: `${next.filter((f) => f.enabled).length} ملف مفعّل` });
      const guessedPlate = guessColumn(merged.headers, ["لوحة", "اللوحة", "Plate"]);
      if (guessedPlate) setPlateColumn(guessedPlate);
      const street = guessColumn(merged.headers, ["شارع", "الشارع", "Street"], guessedPlate);
      if (street) setStreetColumn(street);
      const map = guessMapColumn(merged.headers);
      if (map) setMapColumn(map);
    } else {
      setDataSheet(null);
      setDataFile(null);
    }
  }

  // استعادة أوراق الداتا الثقيلة من IndexedDB (بدون تجميد الواجهة)
  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      idbGet<ParsedSheet>(SORT_DATA_IDB),
      idbGet<ParsedSheet>(SORT_REFERRAL_IDB),
      idbGet<string[]>(SORT_BASELINE_IDB),
      loadSortLibrary(),
    ]).then(([data, referral, baseline, lib]) => {
      if (cancelled) return;
      if (referral?.rows?.length) setReferralSheet(referral);
      if (Array.isArray(baseline) && baseline.length) {
        baselineRef.current = new Set(baseline.filter(Boolean));
      }
      if (lib.length > 0) {
        setLibrary(lib);
        const merged = mergeEnabledSheets(lib);
        if (merged) {
          setDataSheet(merged);
          setDataFile({ name: `${lib.filter((f) => f.enabled).length} ملف مفعّل` });
        }
      } else if (data?.rows?.length) {
        const seeded = [createLibraryFile(initial.dataFileMeta?.name ?? "الداتا.xlsx", data, true)];
        setLibrary(seeded);
        saveSortLibrary(seeded).catch(() => {});
        setDataSheet(data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // استقبال ملف شارَك المستخدم من تطبيق ثاني (مثل واتساب) عبر public/sw.js —
  // هذا وحده يحتاج useEffect لأنه يعتمد على رابط الصفحة (async)
  React.useEffect(() => {
    consumeSharedFile().then((file) => {
      if (file) handleDataSelect(file);
    });

    // نفس الفكرة لكن للتطبيق الأصلي (Android) بعد تحويله عبر Capacitor —
    // لا يفعل شيئًا على الويب العادي (راجع lib/native-import.ts)
    const removeNativeListener = listenForNativeSharedFile(handleDataSelect);
    return removeNativeListener;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // حفظ خفيف فقط في localStorage — الأوراق الكبيرة تذهب لـ IndexedDB
  React.useEffect(() => {
    const light: PersistedSortState = {
      dataFileMeta: dataFile ? { name: dataFile.name } : null,
      referralFileMeta: referralFile ? { name: referralFile.name } : null,
      plateColumn,
      streetColumn,
      mapColumn,
      referralPlateColumn,
      result,
    };
    const timer = setTimeout(() => saveLocal("last_sort_state", light), 200);
    return () => clearTimeout(timer);
  }, [dataFile, referralFile, plateColumn, streetColumn, mapColumn, referralPlateColumn, result]);

  React.useEffect(() => {
    if (dataSheet) idbSet(SORT_DATA_IDB, dataSheet).catch(() => {});
    else idbRemove(SORT_DATA_IDB).catch(() => {});
  }, [dataSheet]);

  React.useEffect(() => {
    if (referralSheet) idbSet(SORT_REFERRAL_IDB, referralSheet).catch(() => {});
    else idbRemove(SORT_REFERRAL_IDB).catch(() => {});
  }, [referralSheet]);

  async function handleDataSelect(file: File) {
    setDataFile(file);
    setDataProgress(0);
    const timer = fakeProgress(setDataProgress);
    try {
      const parsed = await parseSpreadsheet(file);
      backend.saveUpload(file.name, parsed.headers, parsed.rows).catch(() => {});
      const entry = createLibraryFile(file.name, parsed, true);
      const current = await loadSortLibrary();
      await persistLibrary([entry, ...current].slice(0, 20));
    } catch (err) {
      await backend.logError(
        err instanceof Error ? err.message : "تعذّر قراءة ملف الداتا",
        `أثناء رفع الملف: ${file.name}`
      );
    } finally {
      clearInterval(timer);
      setDataProgress(100);
    }
  }

  async function handleReferralSelect(file: File) {
    setReferralFile(file);
    setReferralProgress(0);
    const timer = fakeProgress(setReferralProgress);
    try {
      const parsed = await parseSpreadsheet(file);
      setReferralSheet(parsed);
      backend.saveUpload(file.name, parsed.headers, parsed.rows).catch(() => {});
      setReferralPlateColumn(guessColumn(parsed.headers, ["لوحة", "اللوحة", "Plate"]) ?? "");
    } catch (err) {
      await backend.logError(
        err instanceof Error ? err.message : "تعذّر قراءة ملف الإحالة",
        `أثناء رفع الملف: ${file.name}`
      );
    } finally {
      clearInterval(timer);
      setReferralProgress(100);
    }
  }

  function handleClearAll() {
    setDataFile(null);
    setDataSheet(null);
    setDataProgress(null);
    setPlateColumn("");
    setStreetColumn("");
    setMapColumn("");
    setReferralFile(null);
    setReferralSheet(null);
    setReferralProgress(null);
    setReferralPlateColumn("");
    setResult(null);
    baselineRef.current = new Set();
    setLibrary([]);
    setPasteText("");
    saveSortLibrary([]).catch(() => {});
    idbRemove(SORT_DATA_IDB).catch(() => {});
    idbRemove(SORT_REFERRAL_IDB).catch(() => {});
    idbRemove(SORT_BASELINE_IDB).catch(() => {});
  }

  async function persistBaseline(next: Set<string>) {
    baselineRef.current = next;
    await idbSet(SORT_BASELINE_IDB, [...next]);
  }


  async function toggleLibraryFile(id: string) {
    const next = library.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f));
    await persistLibrary(next);
  }

  async function deleteLibraryFile(id: string) {
    const next = library.filter((f) => f.id !== id);
    await persistLibrary(next);
  }

  async function downloadLibraryFile(file: SortLibraryFile) {
    const ws = XLSX.utils.json_to_sheet(
      file.rows.map((row) => {
        const o: Record<string, string | number> = {};
        for (const h of file.headers) o[h] = row[h] ?? "";
        return o;
      })
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "data");
    const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as number[];
    const blob = new Blob([new Uint8Array(bytes)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.fileName.endsWith(".xlsx") ? file.fileName : `${file.fileName}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function requestAppend(id: string) {
    appendTargetId.current = id;
    appendInputRef.current?.click();
  }

  async function handleAppendFile(file: File) {
    const targetId = appendTargetId.current;
    appendTargetId.current = null;
    if (!targetId) return;
    try {
      const parsed = await parseSpreadsheet(file);
      const next = library.map((f) => (f.id === targetId ? appendSheetToFile(f, parsed) : f));
      await persistLibrary(next);
      flashNotice(`تم إلحاق ${parsed.rows.length} صف`);
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : "تعذّر الإلحاق");
    }
  }

  function applyPastePlates() {
    const sheet = platesFromPasteText(pasteText);
    if (sheet.rows.length === 0) {
      flashNotice("لا توجد لوحات في النص الملصوق");
      return;
    }
    setReferralSheet(sheet);
    setReferralFile({ name: `لصق-${sheet.rows.length}-لوحة.txt` });
    setReferralPlateColumn("اللوحة");
    setReferralProgress(100);
    flashNotice(`تم لصق ${sheet.rows.length} لوحة كإحالة`);
    setPasteOpen(false);
  }

  async function handleRunSort() {
    if (!dataSheet || !referralSheet || !plateColumn || !streetColumn || !referralPlateColumn) {
      return;
    }
    const isNewMode = mode === "new";
    const excludePlates = isNewMode ? baselineRef.current : null;
    const res = await runSortChunked(
      dataSheet,
      plateColumn,
      streetColumn,
      referralSheet,
      referralPlateColumn,
      mapColumn || undefined,
      8000,
      { excludePlates }
    );
    setResult(res);

    const norms = matchedPlateNorms(res);
    if (!isNewMode) {
      // فرز كلي: يعيد أساس المقارنة من الصفر
      await persistBaseline(new Set(norms));
    } else if (norms.length > 0) {
      // فرز جديد: يضيف اللوحات الجديدة للأساس حتى لا تظهر مرة أخرى
      const merged = new Set(baselineRef.current);
      for (const n of norms) merged.add(n);
      await persistBaseline(merged);
    }

    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    if (isNewMode) {
      flashNotice(
        res.matchedRows.length === 0
          ? "فرز جديد: لا توجد لوحات جديدة عن الفرز السابق"
          : `فرز جديد: ${res.matchedRows.length} لوحة جديدة`
      );
    }

    backend.saveSortHistoryEntry({
      dataFileName: dataFile?.name ?? "الداتا",
      referralFileName: referralFile?.name ?? "الإحالة",
      unsortedCount: res.unsortedCount,
      distinctMatchedPlates: res.distinctMatchedPlates,
      matchedRows: res.matchedRows,
    }).catch(() => {});
  }

  function flashNotice(msg: string) {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setActionNotice(msg);
    noticeTimer.current = setTimeout(() => setActionNotice(null), 2000);
  }

  function buildResultsText() {
    if (!result || result.matchedRows.length === 0) return "";
    return result.matchedRows.map((r) => r.plate).join("\n");
  }

  function resultsTableRows() {
    if (!result || result.matchedRows.length === 0) return null;
    return result.matchedRows.map((r, i) => ({
      "#": i + 1,
      "رقم اللوحة": r.plate,
      الشارع: r.street || "",
      "رابط الخريطة": r.mapUrl || "",
    }));
  }

  function buildSharePayload(): {
    xlsxFile: File;
    plainCsvFile: File;
    csvText: string;
  } | null {
    const table = resultsTableRows();
    if (!table) return null;

    const ws = XLSX.utils.json_to_sheet(table);
    ws["!cols"] = [{ wch: 6 }, { wch: 18 }, { wch: 36 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "نتائج الفرز");
    const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as number[];
    const csvBody = XLSX.utils.sheet_to_csv(ws);
    const csvText = "\uFEFF" + csvBody;
    const stamp = new Date().toISOString().slice(0, 10);
    // أسماء ASCII + text/plain: أندرويد/TWA يفتح قائمة التطبيقات بهذا الشكل بثبات
    const xlsxFile = new File(
      [new Uint8Array(bytes)],
      `tafriz-results-${stamp}.xlsx`,
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    );
    const plainCsvFile = new File([csvText], `tafriz-results-${stamp}.csv`, {
      type: "text/plain",
    });
    return { xlsxFile, plainCsvFile, csvText };
  }

  async function shareExcelNative(file: File, title: string): Promise<boolean> {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const buf = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) {
        binary += String.fromCharCode(...buf.subarray(i, i + chunk));
      }
      const base64 = btoa(binary);
      await Filesystem.writeFile({
        path: file.name,
        data: base64,
        directory: Directory.Cache,
      });
      const { uri } = await Filesystem.getUri({ path: file.name, directory: Directory.Cache });
      await Share.share({ title, url: uri, dialogTitle: title });
      return true;
    } catch {
      return false;
    }
  }

  async function handleShareResults() {
    // بناء متزامن ثم share فورًا — أي await قبل share يقتل إيماءة الضغط على أندرويد
    const payload = buildSharePayload();
    if (!payload) {
      flashNotice("لا توجد نتائج لمشاركتها");
      return;
    }
    const { xlsxFile, plainCsvFile, csvText } = payload;
    const title = "نتائج الفرز";
    const nav = navigator as NavShare;

    if (nav.share) {
      // 1) ملف CSV كـ text/plain (الأكثر قبولًا في قائمة مشاركة أندرويد)
      // 2) ثم Excel
      // 3) ثم نص CSV — يفتح التطبيقات حتى لو الملفات مرفوضة
      const fileAttempts: File[] = [plainCsvFile, xlsxFile];
      for (const file of fileAttempts) {
        try {
          const data = { files: [file], title };
          if (nav.canShare && !nav.canShare(data)) continue;
          await nav.share(data);
          return;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
        }
      }
      for (const file of fileAttempts) {
        try {
          await nav.share({ files: [file], title });
          return;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
        }
      }
      try {
        await nav.share({ title, text: csvText });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    if (Capacitor.isNativePlatform()) {
      if (await shareExcelNative(xlsxFile, title)) return;
    }

    const url = URL.createObjectURL(xlsxFile);
    const a = document.createElement("a");
    a.href = url;
    a.download = xlsxFile.name;
    a.click();
    URL.revokeObjectURL(url);
    flashNotice("الجهاز لا يدعم قائمة المشاركة — تم تنزيل Excel");
  }

  async function handleCopyAll() {
    const text = buildResultsText();
    if (!text) {
      flashNotice("لا توجد نتائج لنسخها");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      flashNotice("تم النسخ");
    } catch {
      flashNotice("تعذّر النسخ");
    }
  }

  const canSort = !!dataSheet && !!referralSheet && !!plateColumn && !!streetColumn && !!referralPlateColumn;

  // تنبيه بسيط للمالك بعدد طلبات الدخول الجديدة بانتظار موافقته
  const [pendingRequests, setPendingRequests] = React.useState(0);
  React.useEffect(() => {
    if (!user?.isOwner) return;
    const check = () => {
      backend.listUsers().then((users) => {
        setPendingRequests(users.filter((u) => u.status === "pending").length);
      });
    };
    check();
    const interval = setInterval(check, 20_000);
    return () => clearInterval(interval);
  }, [user?.isOwner]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-28 pt-4">
      <header className="flex items-center justify-between py-2">
        <button className="text-muted-foreground">
          <ListChecks className="h-6 w-6 opacity-0" />
        </button>
        <h1 className="text-xl font-black">الفرز</h1>
        <button
          onClick={() => setMenuOpen(true)}
          className="relative flex h-9 w-9 items-center justify-center text-foreground"
        >
          <span className="sr-only">القائمة</span>
          <div className="flex flex-col gap-1">
            <span className="block h-0.5 w-5 bg-foreground" />
            <span className="block h-0.5 w-5 bg-foreground" />
            <span className="block h-0.5 w-5 bg-foreground" />
          </div>
          {user?.isOwner && pendingRequests > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {pendingRequests}
            </span>
          )}
        </button>
      </header>

      <AppMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={(target) => onNavigate?.(target)}
        isOwner={user?.isOwner}
      />

      <ImportExportBar
        onImport={handleDataSelect}
        buildExportText={() =>
          (result?.matchedRows ?? [])
            .map((r) => `${r.street} - ${r.plate}`)
            .join("\n") || "لا توجد نتائج بعد"
        }
      />

      <Button variant="outline" onClick={() => onNavigate?.("ai-scan")}>
        <ScanLine className="h-4 w-4" />
        التعرف الذكي على اللوحة بالكاميرا
      </Button>

      <SortSummaryCard
        fileCount={library.length + (referralFile ? 1 : 0)}
        plateCount={result?.matchedRows.length ?? totalPlateEstimate(library)}
        ready={canSort}
      >
        <p className="text-xs text-muted-foreground">
          ارفع ملف الداتا وملف الإحالة أدناه، حدد أعمدة رقم اللوحة والشارع، ثم اضغط
          «فرز كلي» لمطابقة اللوحات.
        </p>
      </SortSummaryCard>

      {/* الداتا */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <BarChart3 className="h-5 w-5 text-primary" />
          <CardTitle>الداتا</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <FileDropCard
            label="استيراد ملف الداتا (Excel)"
            hint="يفتح مستندات الجهاز (التنزيلات، الملفات، Drive، واتساب) — بدون كاميرا أو صور"
            file={dataFile}
            progress={dataProgress}
            onSelect={handleDataSelect}
            onClear={() => {
              setDataFile(null);
              setDataSheet(null);
              setDataProgress(null);
            }}
          />

          <input
            ref={appendInputRef}
            type="file"
            accept={SPREADSHEET_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleAppendFile(f);
              e.target.value = "";
            }}
          />

          {library.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-muted-foreground">
                للترتيب · المفتاح يفعّل/يوقف الفرز · الأزرار تحت كل ملف
              </p>
              {library.map((f) => (
                <div key={f.id} className="rounded-xl border border-border bg-secondary/20 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 text-right">
                      <p className="truncate text-sm font-bold">{f.fileName}</p>
                      <p className="text-[11px] text-muted-foreground">{f.rows.length} لوحات</p>
                    </div>
                    <label className="flex flex-col items-center gap-0.5">
                      <input
                        type="checkbox"
                        checked={f.enabled}
                        onChange={() => void toggleLibraryFile(f.id)}
                        className="h-5 w-9 accent-primary"
                      />
                      <span className="text-[10px] font-bold text-muted-foreground">
                        {f.enabled ? "فرز" : "خارج"}
                      </span>
                    </label>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => requestAppend(f.id)}>
                      <ArrowUpFromLine className="h-3.5 w-3.5" />
                      إلحاق
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void downloadLibraryFile(f)}>
                      <Download className="h-3.5 w-3.5" />
                      تنزيل
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => void deleteLibraryFile(f.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      حذف
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" className="shrink-0">
              تأكيد
            </Button>
            <Input
              type="text"
              placeholder="كلمة المرور (إن وجدت)"
              value={dataPassword}
              onChange={(e) => setDataPassword(e.target.value)}
              className="text-right"
            />
          </div>

          {dataSheet && (
            <>
              <ColumnPicker
                title="أعمدة الداتا"
                headers={dataSheet.headers}
                selections={[
                  { label: "عمود رقم اللوحة", value: plateColumn, onChange: setPlateColumn },
                  { label: "عمود الشارع", value: streetColumn, onChange: setStreetColumn },
                  {
                    label: "عمود رابط الخريطة (اختياري)",
                    value: mapColumn,
                    onChange: setMapColumn,
                    allowEmpty: true,
                  },
                ]}
              />
              {plateColumn && plateColumn === streetColumn && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  ⚠️ عمود رقم اللوحة وعمود الشارع محددين على نفس العمود — النتائج
                  راح تكون غلط. افتح "أعمدة الداتا" أعلاه واختر عمودين مختلفين.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <SegmentedToggle
        value={mode}
        onChange={(v) => setMode(v as SortMode)}
        options={[
          { value: "full", label: "فرز كلي" },
          { value: "new", label: "فرز جديد" },
        ]}
      />

      {/* ملف الإحالة */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <FileText className="h-5 w-5 text-primary" />
          <CardTitle>ملف الإحالة</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {/* استيراد Excel أولًا — أوضح للمستخدم من اللصق النصي */}
          <FileDropCard
            label="استيراد ملف إحالة Excel"
            hint="اختر ملف .xlsx أو .xls أو .csv من مستندات الجهاز — بدون كاميرا"
            file={referralFile}
            progress={referralProgress}
            onSelect={handleReferralSelect}
            onClear={() => {
              setReferralFile(null);
              setReferralSheet(null);
              setReferralProgress(null);
            }}
          />

          <div className="rounded-xl border border-dashed border-border p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-sm font-bold text-muted-foreground"
              onClick={() => setPasteOpen((v) => !v)}
            >
              <span className="flex items-center gap-1">
                <ClipboardPaste className="h-4 w-4" />
                أو الصق اللوحات نصًا
              </span>
              <span className="text-[11px] font-normal">
                {pasteOpen ? "إخفاء" : "اختياري"}
              </span>
            </button>
            {pasteOpen && (
              <div className="mt-2 flex flex-col gap-2">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={6}
                  placeholder={"سطر واحد لكل لوحة"}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-right text-sm"
                />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setPasteText("")}>
                    مسح الكل
                  </Button>
                  <Button type="button" className="flex-1" onClick={applyPastePlates}>
                    تطبيق اللصق
                  </Button>
                </div>
              </div>
            )}
          </div>

          {referralSheet && (
            <>
              <p className="text-xs font-bold text-primary">
                ✓ تم الكشف: رقم اللوحة
              </p>
              <ColumnPicker
                title="عمود اللوحات في الإحالة"
                headers={referralSheet.headers}
                selections={[
                  {
                    label: "عمود رقم اللوحة",
                    value: referralPlateColumn,
                    onChange: setReferralPlateColumn,
                  },
                ]}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* نتائج الفرز */}
      <Card ref={resultsRef}>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <PercentStepper value={zoom} onChange={(v) => setZoom(Math.max(50, Math.min(100, v)))} />
          <CardTitle>نتائج الفرز</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3" style={{ fontSize: `${Math.max(50, zoom)}%` }}>
          <div className="flex gap-2">
            {/* ترتيب RTL: لوحات مفرزة يمينًا كما في المرجع */}
            <StatPill label="لوحات مفرزة" value={result?.matchedRows.length ?? 0} tone="green" />
            <StatPill label="فرز من الإحالة" value={result?.distinctMatchedPlates ?? 0} tone="red" />
            <StatPill label="غير مفرزة" value={result?.unsortedCount ?? 0} tone="muted" />
          </div>

          <p className="text-sm font-bold">داتا برنامج {dataFile ? dataFile.name : "xlsx.5"}</p>

          <ResultsTable rows={result?.matchedRows ?? []} />

          {result && (
            <p className="text-center text-xs text-muted-foreground">
              تم عرض {result.matchedRows.length} نتيجة فرز
            </p>
          )}

          <Button variant="destructive" onClick={handleClearAll} className="mt-1">
            <Eraser className="h-4 w-4" />
            مسح
          </Button>
        </CardContent>
      </Card>

      {/* شريط الإجراءات السفلي */}
      <div className="fixed inset-x-0 bottom-16 z-10 mx-auto flex max-w-md flex-col gap-1 bg-background/95 px-4 py-3 backdrop-blur">
        {actionNotice && (
          <p className="text-center text-xs font-bold text-primary">{actionNotice}</p>
        )}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleShareResults} aria-label="مشاركة النتائج">
            <Share2 className="h-5 w-5" />
          </Button>
          <Button className="flex-1" disabled={!canSort} onClick={handleRunSort}>
            <ListChecks className="h-5 w-5" />
            {mode === "full" ? "فرز كلي" : "فرز جديد"}
          </Button>
          <Button variant="outline" size="icon" onClick={handleCopyAll} aria-label="نسخ النتائج">
            <Copy className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ColumnPicker({
  title,
  headers,
  selections,
}: {
  title: string;
  headers: string[];
  selections: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    allowEmpty?: boolean;
  }[];
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <span className="text-xs text-muted-foreground">
          {selections.length}/{headers.length}
        </span>
        <span className="flex items-center gap-2 text-sm font-bold">
          {title}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
          {selections.map((sel) => (
            <label key={sel.label} className="flex flex-col gap-1 text-right">
              <span className="text-xs text-muted-foreground">{sel.label}</span>
              <select
                value={sel.value}
                onChange={(e) => sel.onChange(e.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              >
                {sel.allowEmpty && <option value="">— بدون —</option>}
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Simple simulated progress bar while the file parses (parsing itself is near-instant,
// this just gives the same "يرفع..." upload feel as the reference app).
function fakeProgress(setProgress: (v: number) => void) {
  let value = 0;
  return setInterval(() => {
    value = Math.min(90, value + 15);
    setProgress(value);
  }, 120);
}
