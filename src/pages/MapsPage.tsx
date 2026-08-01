import * as React from "react";
import { MapPin, LocateFixed, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MapsPage({ onBack }: { onBack?: () => void }) {
  const [coords, setCoords] = React.useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function locate() {
    if (!navigator.geolocation) {
      setError("المتصفح لا يدعم تحديد الموقع");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setError("تعذّر الحصول على الموقع — تأكد من منح إذن الموقع للمتصفح")
    );
  }

  React.useEffect(locate, []);

  const bbox = coords
    ? `${coords.lng - 0.01},${coords.lat - 0.01},${coords.lng + 0.01},${coords.lat + 0.01}`
    : null;

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

      {coords ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <iframe
            title="الموقع الحالي"
            className="h-80 w-full"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${coords.lat},${coords.lng}`}
          />
        </div>
      ) : (
        <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground">
          <MapPin className="h-8 w-8" />
          <span className="text-sm">{error ?? "جاري تحديد موقعك..."}</span>
        </div>
      )}

      <Button variant="secondary" onClick={locate}>
        <LocateFixed className="h-4 w-4" />
        تحديث موقعي الحالي
      </Button>
    </div>
  );
}
