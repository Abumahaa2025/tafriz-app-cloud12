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

  React.useEffect(() => {
    const map = mapRef.current;
    const cluster = clusterRef.current;
    if (!map || !cluster) return;
    const LC = L as AnyL;

    cluster.clearLayers();
    const latLngs: [number, number][] = [];

    for (const p of points) {
      const marker = LC.marker([p.lat, p.lng], { title: p.label });
      marker.bindPopup(
        `<div style="text-align:right;font-family:Tajawal,sans-serif"><b>${escapeHtml(
          p.label
        )}</b><br/>${escapeHtml(p.sub ?? "")}</div>`
      );
      marker.on("click", () => onSelect?.(p.id));
      cluster.addLayer(marker);
      latLngs.push([p.lat, p.lng]);
    }

    if (focus) {
      map.setView([focus.lat, focus.lng], Math.max(map.getZoom(), 14));
    } else if (latLngs.length === 1) {
      map.setView(latLngs[0], 14);
    } else if (latLngs.length > 1) {
      map.fitBounds(LC.latLngBounds(latLngs), { padding: [28, 28] });
    }
  }, [points, focus, onSelect]);

  return <div ref={containerRef} className={className ?? "h-72 w-full rounded-xl"} />;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
