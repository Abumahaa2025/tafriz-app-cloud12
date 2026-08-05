import * as React from "react";
import { MapPin, LocateFixed, ArrowRight, Car, ExternalLink, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadLocalCached } from "@/lib/storage";
import { SortResult } from "@/lib/sort-logic";
import { googleMapsOpenUrl } from "@/lib/map-coords";
import { ClusterMap } from "@/components/ClusterMap";

interface LastSortState {
  result: SortResult | null;
}

// نفس حجم صفحة ResultsTable في شاشة الفرز. بدون هذا الحد كانت القائمة تبني عنصرًا
// لكل لوحة مفروزة، أي آلاف عناصر DOM تُعاد مع كل حرف في مربع البحث.
const LIST_PAGE_SIZE = 80;

type FleetItem = {
  plate: string;
  street: string;
  mapUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export default function MapsPage({ onBack }: { onBack?: () => void }) {
  const [myCoords, setMyCoords] = React.useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [selectedPlate, setSelectedPlate] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<"fleet" | "me">("fleet");

  // إعادة القراءة عند إظهار الصفحة فقط (بدون polling كل ثوانٍ)
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const onVis = () => {
      if (document.visibilityState === "visible") bump();
    };
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const liveFleet = React.useMemo(() => {
    const state = loadLocalCached<LastSortState>("last_sort_state", { result: null });
    return (state.result?.matchedRows ?? []) as FleetItem[];
  }, [tick]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return liveFleet;
    return liveFleet.filter(
      (r) =>
        r.plate.toLowerCase().includes(q) ||
        (r.street ?? "").toLowerCase().includes(q)
    );
  }, [liveFleet, query]);

  const [visibleCount, setVisibleCount] = React.useState(LIST_PAGE_SIZE);
  React.useEffect(() => {
    setVisibleCount(LIST_PAGE_SIZE);
  }, [filtered]);
  const visibleRows = filtered.length > visibleCount ? filtered.slice(0, visibleCount) : filtered;

  const selected = filtered.find((r) => r.plate === selectedPlate) ?? filtered[0] ?? null;

  React.useEffect(() => {
    if (selected && selectedPlate !== selected.plate) {
      setSelectedPlate(selected.plate);
    }
  }, [selected, selectedPlate]);

  function locate() {
    if (!navigator.geolocation) {
      setError("المتصفح لا يدعم تحديد الموقع");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setError(null);
        setMode("me");
      },
      () => setError("تعذّر الحصول على الموقع — تأكد من منح إذن الموقع للمتصفح")
    );
  }

  React.useEffect(() => {
    locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // لا بد أن تبقى هوية هذه المصفوفة ثابتة: clusterPoints يعتمد عليها، وهي بدورها
  // تُمرَّر كـ points للخريطة. لو أُعيد حسابها في كل رسم لصارت مرجعًا جديدًا كل مرة،
  // فيسقط useMemo أدناه وتُهدم كل الدبابيس وتُبنى من جديد عند أي رسم — ولو لسبب
  // لا علاقة له بالخريطة كتحديث بيانات المستخدم كل دقيقة أو حرف في مربع البحث.
  const fleetPoints = React.useMemo(
    () =>
      liveFleet.filter(
        (r): r is FleetItem & { lat: number; lng: number } =>
          r.lat != null && r.lng != null && Number.isFinite(r.lat) && Number.isFinite(r.lng)
      ),
    [liveFleet]
  );

  const clusterPoints = React.useMemo(() => {
    if (mode === "me" && myCoords) {
      return [
        {
          id: "me",
          lat: myCoords.lat,
          lng: myCoords.lng,
          label: "موقعي",
          sub: `${myCoords.lat.toFixed(5)}, ${myCoords.lng.toFixed(5)}`,
        },
      ];
    }
    return fleetPoints.map((r, i) => ({
      id: `${r.plate}-${i}`,
      lat: r.lat,
      lng: r.lng,
      label: r.plate,
      sub: r.street || "",
    }));
  }, [mode, myCoords, fleetPoints]);

  const focusPoint = React.useMemo(() => {
    if (mode === "me" && myCoords) return myCoords;
    if (selected?.lat != null && selected?.lng != null) {
      return { lat: selected.lat, lng: selected.lng };
    }
    return null;
  }, [mode, myCoords, selected]);

  const withLocation = React.useMemo(
    () => liveFleet.filter((r) => r.mapUrl || (r.lat != null && r.lng != null) || r.street).length,
    [liveFleet]
  );

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-28 pt-4">
      <header className="flex items-center gap-2 py-2">
        {onBack && (
          <button onClick={onBack} className="text-muted-foreground">
            <ArrowRight className="h-5 w-5" />
          </button>
        )}
        <MapPin className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-black">الخرائط</h1>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("fleet")}
          className={`rounded-xl px-3 py-2 text-sm font-bold ${
            mode === "fleet" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
          }`}
        >
          أسطول الفرز ({liveFleet.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("me");
            if (!myCoords) locate();
          }}
          className={`rounded-xl px-3 py-2 text-sm font-bold ${
            mode === "me" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
          }`}
        >
          موقعي الحالي
        </button>
      </div>

      {clusterPoints.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <ClusterMap
            className="h-72 w-full"
            points={clusterPoints}
            focus={focusPoint}
            onSelect={(id) => {
              if (id === "me") return;
              const plate = id.split("-")[0];
              setSelectedPlate(plate);
              setMode("fleet");
            }}
          />
        </div>
      ) : (
        <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground">
          <MapPin className="h-8 w-8" />
          <span className="px-4 text-center text-sm">
            {error ??
              (liveFleet.length === 0
                ? "لا توجد لوحات مفروزة بعد — نفّذ فرزًا من تبويب الفرز أولًا"
                : "لا توجد إحداثيات ظاهرة — افتح الموقع من زر Google Maps في القائمة")}
          </span>
        </div>
      )}

      <p className="text-center text-xs font-bold text-primary">
        {fleetPoints.length} سيارة على الخريطة (تجميع دبابيس)
      </p>

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={locate}>
          <LocateFixed className="h-4 w-4" />
          تحديث موقعي
        </Button>
        {selected && (
          <Button
            className="flex-1"
            onClick={() =>
              window.open(
                googleMapsOpenUrl({
                  mapUrl: selected.mapUrl,
                  lat: selected.lat,
                  lng: selected.lng,
                  query: selected.street || selected.plate,
                }),
                "_blank"
              )
            }
          >
            <ExternalLink className="h-4 w-4" />
            Google Maps
          </Button>
        )}
      </div>

      <Button
        className="w-full"
        onClick={() => {
          setMode("fleet");
          setTick((t) => t + 1);
        }}
      >
        عرض آخر نتيجة فرز
      </Button>
      <p className="text-xs text-muted-foreground">
        من نتائج آخر فرز: {liveFleet.length} لوحة · {withLocation} لها موقع/وصف ·{" "}
        {fleetPoints.length} بإحداثيات مباشرة
      </p>

      {mode === "fleet" && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ابحث بلوحة أو شارع..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pr-10 text-right"
            />
          </div>

          <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {liveFleet.length === 0
                  ? "نفّذ فرزًا ثم ارجع هنا لعرض الأسطول على الخريطة"
                  : "لا نتائج مطابقة للبحث"}
              </p>
            )}
            {visibleRows.map((row, i) => {
              const active = selected?.plate === row.plate;
              const hasPin = row.lat != null && row.lng != null;
              return (
                <button
                  key={`${row.plate}-${i}`}
                  type="button"
                  onClick={() => {
                    setSelectedPlate(row.plate);
                    setMode("fleet");
                  }}
                  className={`flex items-start justify-between gap-2 rounded-xl border px-3 py-2 text-right ${
                    active ? "border-primary bg-primary/10" : "border-border bg-secondary/30"
                  }`}
                >
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="flex items-center gap-1 text-sm font-black">
                      <Car className="h-3.5 w-3.5 text-primary" />
                      {row.plate}
                    </span>
                    <span className="text-xs text-muted-foreground">{row.street || "بدون وصف موقع"}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {hasPin ? "إحداثيات جاهزة" : row.mapUrl ? "رابط خريطة" : "وصف فقط"}
                    </span>
                  </div>
                  <span
                    role="link"
                    tabIndex={0}
                    className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(
                        googleMapsOpenUrl({
                          mapUrl: row.mapUrl,
                          lat: row.lat,
                          lng: row.lng,
                          query: row.street || row.plate,
                        }),
                        "_blank"
                      );
                    }}
                  >
                    فتح
                  </span>
                </button>
              );
            })}
            {filtered.length > visibleCount && (
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => setVisibleCount((c) => c + LIST_PAGE_SIZE)}
              >
                عرض المزيد ({visibleCount} / {filtered.length})
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
