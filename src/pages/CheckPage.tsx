import * as React from "react";
import {
  CheckSquare,
  Plus,
  Trash2,
  Check,
  ArrowRight,
  Search,
  Database,
  Mic,
  Square,
  Download,
  ExternalLink,
  FileSpreadsheet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileDropCard } from "@/components/FileDropCard";
import { loadLocal, saveLocal } from "@/lib/storage";
import { backend } from "@/lib/backend";
import { SortHistorySearchHit } from "@/lib/backend-types";
import { matchesPlateStreet, normalizeSearchText } from "@/lib/search-text";
import { parseSpreadsheet, ParsedSheet } from "@/lib/xlsx-utils";
import { googleMapsOpenUrl } from "@/lib/map-coords";
import { idbGet, idbRemove, idbSet } from "@/lib/idb";
import {
  buildCheckSheet,
  CHECK_IDB_KEY,
  CheckSheetData,
  CheckSheetRow,
  guessCheckGpsColumn,
  guessCheckPlateColumn,
  indexCheckSheet,
  lookupPlate,
} from "@/lib/check-engine";
import { isSpeechRecognitionSupported, startPlateSpeech } from "@/lib/speech-plate";

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export default function CheckPage({ onBack }: { onBack?: () => void }) {
  const [items, setItems] = React.useState<ChecklistItem[]>(() => loadLocal("checklist", []));
  const [text, setText] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [dataHits, setDataHits] = React.useState<SortHistorySearchHit[]>([]);
  const [checkFile, setCheckFile] = React.useState<{ name: string } | null>(null);
  const [checkSheet, setCheckSheet] = React.useState<ParsedSheet | null>(null);
  const [checkProgress, setCheckProgress] = React.useState<number | null>(null);
  const [plateColumn, setPlateColumn] = React.useState("");
  const [gpsColumn, setGpsColumn] = React.useState("");
  const [checkData, setCheckData] = React.useState<CheckSheetData | null>(null);
  const [index, setIndex] = React.useState<Map<string, CheckSheetRow>>(() => new Map());
  const [checking, setChecking] = React.useState(false);
  const [interim, setInterim] = React.useState("");
  const [speechError, setSpeechError] = React.useState<string | null>(null);
  const [found, setFound] = React.useState<CheckSheetRow | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [manualPlate, setManualPlate] = React.useState("");
  const [hitsLog, setHitsLog] = React.useState<{ plate: string; at: string }[]>([]);
  const speechRef = React.useRef<{ stop: () => void } | null>(null);

  React.useEffect(() => {
    idbGet<CheckSheetData>(CHECK_IDB_KEY).then((saved) => {
      if (!saved?.rows?.length) return;
      setCheckData(saved);
      setCheckFile({ name: saved.fileName });
      setPlateColumn(saved.plateColumn);
      setGpsColumn(saved.gpsColumn || "");
      setIndex(indexCheckSheet(saved));
    });
    return () => {
      speechRef.current?.stop();
      speechRef.current = null;
    };
  }, []);

  function persistChecklist(next: ChecklistItem[]) {
    setItems(next);
    saveLocal("checklist", next);
  }

  function addItem() {
    if (!text.trim()) return;
    persistChecklist([{ id: crypto.randomUUID(), text: text.trim(), done: false }, ...items]);
    setText("");
  }

  const q = normalizeSearchText(query);
  const isSearching = q.length > 0;
  const filteredItems = React.useMemo(
    () => (isSearching ? items.filter((i) => normalizeSearchText(i.text).includes(q)) : items),
    [items, q, isSearching]
  );

  React.useEffect(() => {
    setDataHits([]);
    if (!isSearching) return;
    let cancelled = false;
    const requested = query.trim();
    backend.searchSortHistory(requested).then((hits) => {
      if (cancelled) return;
      setDataHits(hits.filter((h) => matchesPlateStreet(h.row.plate, h.row.street, requested)));
    });
    return () => {
      cancelled = true;
    };
  }, [query, isSearching]);

  async function handleCheckFile(file: File) {
    setCheckProgress(0);
    setCheckFile(file);
    setFound(null);
    try {
      const parsed = await parseSpreadsheet(file);
      setCheckSheet(parsed);
      setCheckProgress(60);
      const plateCol = guessCheckPlateColumn(parsed.headers);
      const gpsCol = guessCheckGpsColumn(parsed.headers);
      setPlateColumn(plateCol);
      setGpsColumn(gpsCol);
      const built = buildCheckSheet(parsed, file.name, plateCol, gpsCol);
      setCheckData(built);
      setIndex(indexCheckSheet(built));
      await idbSet(CHECK_IDB_KEY, built);
      backend.saveUpload(file.name, parsed.headers, parsed.rows).catch(() => {});
      setCheckProgress(100);
    } catch (err) {
      setSpeechError(err instanceof Error ? err.message : "تعذّر قراءة ملف التشيك");
      setCheckProgress(null);
    }
  }

  function rebuildFromColumns(nextPlate: string, nextGps: string) {
    if (!checkSheet || !checkFile) return;
    const built = buildCheckSheet(checkSheet, checkFile.name, nextPlate, nextGps);
    setCheckData(built);
    setIndex(indexCheckSheet(built));
    idbSet(CHECK_IDB_KEY, built).catch(() => {});
  }

  function clearCheckFile() {
    stopChecking();
    setCheckFile(null);
    setCheckSheet(null);
    setCheckData(null);
    setIndex(new Map());
    setPlateColumn("");
    setGpsColumn("");
    setCheckProgress(null);
    setFound(null);
    idbRemove(CHECK_IDB_KEY).catch(() => {});
  }

  function tryLookup(raw: string) {
    const hit = lookupPlate(index, raw);
    if (!hit) return false;
    setFound(hit);
    setDetailOpen(true);
    setHitsLog((prev) =>
      [{ plate: hit.plate, at: new Date().toLocaleTimeString("ar-SA") }, ...prev].slice(0, 40)
    );
    return true;
  }

  function openFoundDetails(row: CheckSheetRow) {
    setFound(row);
    setDetailOpen(true);
  }

  function closeDetails() {
    setDetailOpen(false);
  }

  function startChecking() {
    setSpeechError(null);
    setFound(null);
    setDetailOpen(false);
    if (!checkData?.rows.length) {
      setSpeechError("ارفع ملف التشيك أولًا");
      return;
    }
    if (!isSpeechRecognitionSupported()) {
      setSpeechError("التعرف الصوتي غير مدعوم هنا — استخدم الإدخال اليدوي بالأسفل");
      setChecking(true);
      return;
    }
    const handle = startPlateSpeech({
      onFinal: (_t, candidate) => {
        if (candidate) tryLookup(candidate);
        // بعد انتهاء الأمر الصوتي يتوقف التشيك تلقائيًا
        stopChecking();
      },
      onInterim: setInterim,
      onError: setSpeechError,
      onEnd: () => setChecking(false),
    });
    if (!handle) return;
    speechRef.current = handle;
    setChecking(true);
  }

  function stopChecking() {
    speechRef.current?.stop();
    speechRef.current = null;
    setChecking(false);
    setInterim("");
  }

  function exportHits() {
    const blob = new Blob([hitsLog.map((h) => h.plate).join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "تشييك-نتائج.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  const previewRows = (checkData?.rows ?? []).slice(0, 30);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-28 pt-4">
      <header className="flex items-center gap-2 py-2">
        {onBack && (
          <button onClick={onBack} className="text-muted-foreground">
            <ArrowRight className="h-5 w-5" />
          </button>
        )}
        <CheckSquare className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-black">التشيك</h1>
      </header>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">ملف التشيك</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <FileDropCard
            label="ارفع ملف التشيك"
            file={checkFile}
            progress={checkProgress}
            onSelect={handleCheckFile}
            onClear={clearCheckFile}
          />
          {checkData && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-secondary/50 px-3 py-2 text-center">
                  <p className="text-xl font-black text-primary">{checkData.rows.length}</p>
                  <p className="text-[11px] font-bold text-muted-foreground">لوحات التشيك</p>
                </div>
                <div className="rounded-xl bg-secondary/50 px-3 py-2 text-center">
                  <p className="text-xs font-bold">
                    {new Date(checkData.loadedAt).toLocaleDateString("ar-SA")}
                  </p>
                  <p className="text-[11px] font-bold text-muted-foreground">نسخة التشيك</p>
                </div>
              </div>
              <label className="flex flex-col gap-1 text-right text-xs">
                <span className="text-muted-foreground">عمود اللوحة</span>
                <select
                  value={plateColumn}
                  onChange={(e) => {
                    setPlateColumn(e.target.value);
                    rebuildFromColumns(e.target.value, gpsColumn);
                  }}
                  className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                >
                  {(checkSheet?.headers ?? [plateColumn]).filter(Boolean).map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <span className="font-bold text-primary">✓ تم الكشف: {plateColumn || "—"}</span>
              </label>
              <label className="flex flex-col gap-1 text-right text-xs">
                <span className="text-muted-foreground">عمود GPS / الموقع (اختياري)</span>
                <select
                  value={gpsColumn}
                  onChange={(e) => {
                    setGpsColumn(e.target.value);
                    rebuildFromColumns(plateColumn, e.target.value);
                  }}
                  className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">— بدون —</option>
                  {(checkSheet?.headers ?? []).map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </CardContent>
      </Card>

      {found && (
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className="rounded-2xl border border-primary/30 bg-primary/15 px-4 py-6 text-center"
        >
          <p className="text-2xl font-black">{found.plate}</p>
          <p className="mt-2 inline-block rounded-full bg-background px-3 py-1 text-xs font-bold text-primary">
            موجود في الشيت
          </p>
          <p className="mt-3 text-sm font-bold text-muted-foreground">اضغط لعرض التفاصيل</p>
        </button>
      )}

      {detailOpen && found && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
          onClick={closeDetails}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-border bg-background p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="تفاصيل التشيك"
          >
            <button
              type="button"
              onClick={closeDetails}
              className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground"
              aria-label="إغلاق"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex flex-col gap-3 pt-2 text-right">
              <p className="text-xs font-bold text-primary">تفاصيل التشيك</p>
              <p className="text-2xl font-black">{found.plate}</p>
              <p className="inline-flex w-fit self-end rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
                موجود في الشيت
              </p>
              {found.gps ? (
                <div className="rounded-xl bg-secondary/40 px-3 py-2">
                  <p className="text-[11px] font-bold text-muted-foreground">GPS / الموقع</p>
                  <p className="break-all text-sm">{found.gps}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">لا يوجد موقع محفوظ لهذه اللوحة</p>
              )}
              {(found.mapUrl || found.gps) && (
                <Button
                  className="w-full"
                  onClick={() =>
                    window.open(
                      googleMapsOpenUrl({ mapUrl: found.mapUrl, query: found.gps || found.plate }),
                      "_blank"
                    )
                  }
                >
                  <ExternalLink className="h-4 w-4" />
                  فتح الموقع في الخرائط
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={exportHits}
          disabled={hitsLog.length === 0}
          aria-label="تنزيل"
        >
          <Download className="h-5 w-5" />
        </Button>
        <Button
          className="flex-1"
          size="lg"
          variant={checking ? "destructive" : "default"}
          onClick={checking ? stopChecking : startChecking}
          disabled={!checkData?.rows.length}
        >
          {checking ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          {checking ? "إيقاف التشيك" : "ابدأ التشيك"}
        </Button>
      </div>

      {checking && (
        <p className="text-center text-xs text-muted-foreground">
          {interim ? ("يسمع: " + interim) : "جاهز — انطق رقم اللوحة"}
        </p>
      )}
      {speechError && <p className="text-center text-xs text-destructive">{speechError}</p>}

      <div className="flex gap-2">
        <Input
          placeholder="أدخل لوحة يدويًا للفحص..."
          value={manualPlate}
          onChange={(e) => setManualPlate(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && manualPlate.trim()) {
              if (!tryLookup(manualPlate.trim())) setSpeechError("غير موجود في الشيت");
              else setSpeechError(null);
            }
          }}
          className="text-right"
        />
        <Button
          onClick={() => {
            if (!manualPlate.trim()) return;
            if (!tryLookup(manualPlate.trim())) setSpeechError("غير موجود في الشيت");
            else setSpeechError(null);
          }}
        >
          فحص
        </Button>
      </div>

      {checkData && (
        <Card>
          <CardHeader className="space-y-0">
            <CardTitle className="text-sm">
              جدول التشيك ({previewRows.length} من {checkData.rows.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            <div className="grid grid-cols-[1fr_1.2fr] gap-2 border-b border-border pb-1 text-[11px] font-bold text-muted-foreground">
              <span className="text-right">رقم اللوحة</span>
              <span className="text-right">GPS</span>
            </div>
            {previewRows.map((row, i) => (
              <div key={row.plateNorm + "-" + i} className="grid grid-cols-[1fr_1.2fr] gap-2 text-xs">
                <button type="button" className="text-right font-bold" onClick={() => openFoundDetails(row)}>
                  {row.plate}
                </button>
                <div className="flex items-center justify-end gap-1 text-muted-foreground">
                  <span className="truncate">{row.gps || "—"}</span>
                  {(row.mapUrl || row.gps) && (
                    <button
                      type="button"
                      onClick={() =>
                        window.open(
                          googleMapsOpenUrl({ mapUrl: row.mapUrl, query: row.gps || row.plate }),
                          "_blank"
                        )
                      }
                    >
                      <ExternalLink className="h-3 w-3 text-primary" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {hitsLog.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-bold text-muted-foreground">
            آخر اللوحات الموجودة ({hitsLog.length})
          </p>
          {hitsLog.slice(0, 8).map((h, i) => (
            <button
              key={h.plate + "-" + i}
              type="button"
              className="text-right text-xs"
              onClick={() => {
                const row = lookupPlate(index, h.plate);
                if (row) openFoundDetails(row);
              }}
            >
              <span className="font-bold text-primary">{h.plate}</span>
              <span className="text-muted-foreground"> · {h.at}</span>
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="ابحث بحرف اللوحة أو رقمها — مثال: ج أو 5227..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pr-10 text-right"
        />
      </div>

      {!isSearching && (
        <div className="flex gap-2">
          <Input
            placeholder="أضف عنصر تشييك جديد..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            className="text-right"
          />
          <Button size="icon" onClick={addItem}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}

      {isSearching && dataHits.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
            <Database className="h-3.5 w-3.5" />
            من بيانات الفرز ({dataHits.length})
          </p>
          {dataHits.map((hit, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 px-3 py-2"
            >
              <span className="text-xs text-muted-foreground">
                {new Date(hit.entry.createdAt).toLocaleDateString("ar-SA")}
              </span>
              <div className="text-right">
                <p className="text-sm font-bold">{hit.row.plate}</p>
                <p className="text-xs text-muted-foreground">{hit.row.street}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {isSearching && (
          <p className="text-xs font-bold text-muted-foreground">
            من عناصر التشييك ({filteredItems.length})
          </p>
        )}
        {filteredItems.length === 0 && !isSearching && !checkData && (
          <p className="text-center text-sm text-muted-foreground">
            ارفع ملف التشيك أو أضف عناصر يدوية
          </p>
        )}
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-xl border border-border px-3 py-2"
          >
            <button
              onClick={() => persistChecklist(items.filter((i) => i.id !== item.id))}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <span
              className={
                "flex-1 px-2 text-right text-sm " +
                (item.done ? "text-muted-foreground line-through" : "")
              }
            >
              {item.text}
            </span>
            <button
              onClick={() =>
                persistChecklist(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))
              }
              className={
                "flex h-6 w-6 items-center justify-center rounded-full border " +
                (item.done
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border")
              }
            >
              {item.done && <Check className="h-3.5 w-3.5" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
