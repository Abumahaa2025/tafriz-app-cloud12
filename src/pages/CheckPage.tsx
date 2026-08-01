import * as React from "react";
import { CheckSquare, Plus, Trash2, Check, ArrowRight, Search, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadLocal, saveLocal } from "@/lib/storage";
import { backend } from "@/lib/backend";
import { SortHistorySearchHit } from "@/lib/backend-types";
import { matchesPlateStreet, normalizeSearchText } from "@/lib/search-text";

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

  function persist(next: ChecklistItem[]) {
    setItems(next);
    saveLocal("checklist", next);
  }

  function addItem() {
    if (!text.trim()) return;
    persist([{ id: crypto.randomUUID(), text: text.trim(), done: false }, ...items]);
    setText("");
  }

  const q = normalizeSearchText(query);
  const isSearching = q.length > 0;

  // بحث حي بأي حرف أو رقم: يفلتر عناصر التشييك، ويبحث كمان داخل نتائج
  // الفرز المحفوظة (رقم اللوحة / الشارع) عشان يطلع "كافة البيانات المرتبطة"
  const filteredItems = React.useMemo(
    () =>
      isSearching
        ? items.filter((i) => normalizeSearchText(i.text).includes(q))
        : items,
    [items, q, isSearching]
  );

  React.useEffect(() => {
    if (!isSearching) {
      setDataHits([]);
      return;
    }
    let cancelled = false;
    const requested = query.trim();
    backend.searchSortHistory(requested).then((hits) => {
      if (cancelled) return;
      // حماية من نتائج طلب بحث قديم + تأكيد المطابقة على الحرف المطلوب
      setDataHits(hits.filter((h) => matchesPlateStreet(h.row.plate, h.row.street, requested)));
    });
    return () => {
      cancelled = true;
    };
  }, [query, isSearching]);

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
        {filteredItems.length === 0 && !isSearching && (
          <p className="text-center text-sm text-muted-foreground">لا توجد عناصر بعد</p>
        )}
        {filteredItems.length === 0 && isSearching && dataHits.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">لا توجد نتائج مطابقة</p>
        )}
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-xl border border-border px-3 py-2"
          >
            <button
              onClick={() => persist(items.filter((i) => i.id !== item.id))}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <span className={`flex-1 px-2 text-right text-sm ${item.done ? "text-muted-foreground line-through" : ""}`}>
              {item.text}
            </span>
            <button
              onClick={() =>
                persist(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))
              }
              className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                item.done ? "border-primary bg-primary text-primary-foreground" : "border-border"
              }`}
            >
              {item.done && <Check className="h-3.5 w-3.5" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
