import * as React from "react";
import { MapPin, LocateFixed, ArrowRight, Car, ExternalLink, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadLocal } from "@/lib/storage";
import { SortResult } from "@/lib/sort-logic";
import { googleMapsOpenUrl, osmBboxEmbedUrl, osmEmbedUrl } from "@/lib/map-coords";

interface LastSortState {
  result: SortResult | null;
}

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

  // إعادة القراءة عند العودة للتبويب بعد فرز جديد
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    const interval = setInterval(() => setTick((t) => t + 1), 4000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, []);

  const liveFleet = React.useMemo(() => {
    const state = loadLocal<LastSortState>("last_sort_state", { result: null });
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

  const fleetPoints = liveFleet.filter(
    (r): r is FleetItem & { lat: number; lng: number } =>
      r.lat != null && r.lng != null && Number.isFinite(r.lat) && Number.isFinite(r.lng)
  );

  const mapSrc = React.useMemo(() => {
    if (mode === "me" && myCoords) {
      return osmEmbedUrl(myCoords.lat, myCoords.lng);
    }
    if (selected?.lat != null && selected?.lng != null) {
      return osmEmbedUrl(selected.lat, selected.lng);
    }
    if (fleetPoints.length > 0) {
      return osmBboxEmbedUrl(fleetPoints);
    }
    if (myCoords) return osmEmbedUrl(myCoords.lat, myCoords.lng);
    return null;
  }, [mode, myCoords, selected, fleetPoints]);

  const withLocation = liveFleet.filter((r) => r.mapUrl || (r.lat != null && r.lng != null) || r.street).length;

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

      {mapSrc ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <iframe title="خريطة الأسطول" className="h-72 w-full" src={mapSrc} />
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
            {filtered.map((row, i) => {
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
          </div>
        </>
      )}
    </div>
  );
}
