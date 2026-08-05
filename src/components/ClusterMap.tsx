import * as React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyL = typeof L & { markerClusterGroup: (options?: Record<string, unknown>) => any };

export type ClusterPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  sub?: string;
};

type Props = {
  points: ClusterPoint[];
  focus?: { lat: number; lng: number } | null;
  className?: string;
  onSelect?: (id: string) => void;
};

/** خريطة Leaflet مع تجميع دبابيس (clustering) */
export function ClusterMap({ points, focus, className, onSelect }: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = React.useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clusterRef = React.useRef<any>(null);

  /**
   * onSelect تُمرَّر عادةً كدالة سهمية مكتوبة داخل JSX، أي مرجع جديد عند كل
   * إعادة رسم. لو بقيت في مصفوفة اعتماديات تأثير الدبابيس أدناه، كان كل حرف
   * يكتبه المستخدم في البحث يهدم كل الدبابيس ويعيد بناءها — وهذا سبب تعليق
   * التطبيق عند دخول صفحة الخريطة. نحفظها في مرجع فتُقرأ آخر نسخة عند النقر
   * بدون أن تكون سببًا لإعادة البناء.
   */
  const onSelectRef = React.useRef(onSelect);
  React.useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  /** إحداثيات ما هو معروض حاليًا، لإعادة التأطير عند إلغاء الاختيار بدون إعادة بناء */
  const boundsRef = React.useRef<[number, number][] | null>(null);

  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const LC = L as AnyL;

    const map = LC.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([24.7136, 46.6753], 6);

    LC.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);

    const cluster = LC.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 55,
      spiderfyOnMaxZoom: true,
      // مع آلاف الدبابيس تبني addLayers الشجرة في نداء واحد يحجب الخيط الرئيسي
      // ثوانٍ على الجوال. chunkedLoading يقسّمها دفعات ويترك المتصفح يتنفّس
      // بينها، فتظهر الخريطة فورًا وتبقى الواجهة مستجيبة أثناء الامتلاء.
      chunkedLoading: true,
    });
    cluster.addTo(map);
    mapRef.current = map;
    clusterRef.current = cluster;

    return () => {
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, []);

  /**
   * بناء الدبابيس يعتمد على points فقط. كان focus في نفس المصفوفة، فاختيار لوحة
   * من القائمة أو من البحث — وكل ما يفعله أنه يحرّك الكاميرا — كان يهدم كل
   * الدبابيس ويعيد بناءها من الصفر.
   */
  React.useEffect(() => {
    const map = mapRef.current;
    const cluster = clusterRef.current;
    if (!map || !cluster) return;
    const LC = L as AnyL;

    cluster.clearLayers();
    const latLngs: [number, number][] = [];
    const markers: L.Marker[] = [];

    for (const p of points) {
      const marker = LC.marker([p.lat, p.lng], { title: p.label });
      // نص النافذة يُبنى عند أول فتح فقط: بناؤه لكل نقطة مقدّمًا يعني آلاف عمليات
      // تهريب HTML وتركيب نصوص على الخيط الرئيسي قبل ظهور الخريطة
      marker.bindPopup(
        () =>
          `<div style="text-align:right;font-family:Tajawal,sans-serif"><b>${escapeHtml(
            p.label
          )}</b><br/>${escapeHtml(p.sub ?? "")}</div>`
      );
      marker.on("click", () => onSelectRef.current?.(p.id));
      markers.push(marker);
      latLngs.push([p.lat, p.lng]);
    }

    // إضافة كل الدبابيس دفعة واحدة: addLayer المفردة تعيد حساب شجرة التجميع
    // في كل نداء، وهي أبطأ بمراتب من addLayers مع آلاف النقاط
    cluster.addLayers(markers);

    boundsRef.current = latLngs.length > 0 ? latLngs : null;
    // focus مقروءة هنا لكنها ليست في الاعتماديات عن قصد: التأطير التلقائي مطلوب
    // فقط عند تغيّر النقاط، أما تغيّر focus وحده فيتولّاه التأثير الذي يليه.
    if (!focus) {
      if (latLngs.length === 1) {
        map.setView(latLngs[0], 14);
      } else if (latLngs.length > 1) {
        map.fitBounds(LC.latLngBounds(latLngs), { padding: [28, 28] });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  const hadFocusRef = React.useRef(false);
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const LC = L as AnyL;

    if (focus) {
      hadFocusRef.current = true;
      map.setView([focus.lat, focus.lng], Math.max(map.getZoom(), 14));
      return;
    }
    // رجوعٌ من نقطة مختارة إلى العرض العام: أعِد التأطير على ما هو معروض حاليًا.
    // أول تشغيل بلا focus يتولّاه تأثير الدبابيس، فلا نكرّر التأطير هنا.
    if (!hadFocusRef.current) return;
    hadFocusRef.current = false;
    const latLngs = boundsRef.current;
    if (!latLngs) return;
    if (latLngs.length === 1) {
      map.setView(latLngs[0], 14);
    } else {
      map.fitBounds(LC.latLngBounds(latLngs), { padding: [28, 28] });
    }
  }, [focus]);

  return <div ref={containerRef} className={className ?? "h-72 w-full rounded-xl"} />;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
