import * as React from "react";
import { ArrowRight, Search, Database, FileSpreadsheet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { backend } from "@/lib/backend";
import { SortHistoryEntry, SortHistorySearchHit, UploadedSheetEntry, UploadSearchHit } from "@/lib/backend-types";

export default function DatabasePage({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = React.useState("");
  const [history, setHistory] = React.useState<SortHistoryEntry[]>([]);
  const [uploads, setUploads] = React.useState<UploadedSheetEntry[]>([]);
  const [sortResults, setSortResults] = React.useState<SortHistorySearchHit[]>([]);
  const [uploadResults, setUploadResults] = React.useState<UploadSearchHit[]>([]);
  const [loading, setLoading] = React.useState(true);

  const isSearching = query.trim().length > 0;

  React.useEffect(() => {
    backend.listSortHistory().then(setHistory);
    backend.listUploads().then(setUploads).finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (!isSearching) {
      setSortResults([]);
      setUploadResults([]);
      return;
    }
    backend.searchSortHistory(query).then(setSortResults);
    backend.searchUploads(query).then(setUploadResults);
  }, [query, isSearching]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-28 pt-4">
      <header className="flex items-center gap-2 py-2">
        <button onClick={onBack} className="text-muted-foreground">
          <ArrowRight className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-black">قاعدة البيانات</h1>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="بحث متقدم بأي حرف أو رقم عبر كل بياناتك المرفوعة..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pr-10 text-right"
        />
      </div>

      {isSearching ? (
        <div className="flex flex-col gap-3">
          {uploadResults.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold text-muted-foreground">
                من الملفات المرفوعة كاملة ({uploadResults.length})
              </p>
              {uploadResults.map((hit, i) => (
                <Card key={i}>
                  <CardContent className="flex flex-col gap-1 pt-4">
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <FileSpreadsheet className="h-3 w-3" />
                      {hit.entry.fileName}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-right text-xs">
                      {hit.entry.headers.map((h) => (
                        <span key={h}>
                          <span className="text-muted-foreground">{h}: </span>
                          <span className="font-bold">{String(hit.row[h] ?? "")}</span>
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {sortResults.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold text-muted-foreground">
                من نتائج الفرز المكتملة ({sortResults.length})
              </p>
              {sortResults.map((hit, i) => (
                <Card key={i}>
                  <CardContent className="flex items-center justify-between pt-4">
                    <span className="text-xs text-muted-foreground">
                      {new Date(hit.entry.createdAt).toLocaleDateString("ar-SA")}
                    </span>
                    <div className="text-right">
                      <p className="text-sm font-bold">{hit.row.plate}</p>
                      <p className="text-xs text-muted-foreground">{hit.row.street}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {uploadResults.length === 0 && sortResults.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">لا توجد نتائج مطابقة</p>
          )}
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            كل ملف ترفعه (داتا أو إحالة) يُحفظ هنا كاملًا فور الرفع — مو بس بعد
            الفرز. استخدم البحث أعلاه للوصول لأي صف بأي حرف أو رقم فورًا.
          </p>

          {loading && <p className="text-center text-sm text-muted-foreground">جاري التحميل...</p>}

          {!loading && (
            <>
              <div className="flex flex-col gap-2">
                <p className="text-xs font-bold text-muted-foreground">
                  الملفات المرفوعة ({uploads.length})
                </p>
                {uploads.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground">لا توجد ملفات مرفوعة بعد</p>
                )}
                {uploads.map((u) => (
                  <Card key={u.id}>
                    <CardContent className="flex flex-col gap-1 pt-4">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <FileSpreadsheet className="h-3 w-3" />
                          {new Date(u.uploadedAt).toLocaleString("ar-SA")}
                        </span>
                        <span className="text-sm font-bold">
                          {u.truncated ? `${u.rows.length}+ من ${u.totalRowsInFile}` : u.rows.length} صف
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{u.fileName}</p>
                      {u.truncated && (
                        <p className="text-[11px] text-destructive">
                          ⚠️ الملف كبير — تم حفظ أول {u.rows.length} صف فقط بسبب حدود التخزين
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs font-bold text-muted-foreground">
                  عمليات الفرز المكتملة ({history.length})
                </p>
                {history.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground">لا توجد عمليات فرز محفوظة بعد</p>
                )}
                {history.map((entry) => (
                  <Card key={entry.id}>
                    <CardContent className="flex flex-col gap-1 pt-4">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Database className="h-3 w-3" />
                          {new Date(entry.createdAt).toLocaleString("ar-SA")}
                        </span>
                        <span className="text-sm font-bold">{entry.matchedRows.length} لوحة مفرزة</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {entry.dataFileName} ← {entry.referralFileName}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
