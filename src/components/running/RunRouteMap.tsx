import { useEffect, useMemo, useRef, useState } from "react";
import type { RoutePoint } from "@/lib/running/types";

/**
 * Mapa trasy biegu: OpenStreetMap przez Leaflet (ładowany dopiero, gdy mapa
 * jest potrzebna). Bez sieci albo bez Leafleta zostaje sam kształt trasy.
 */

export function routeSegments(route: RoutePoint[]): [number, number][][] {
  const segments: [number, number][][] = [];
  route.forEach((point, index) => {
    if (index === 0 || route[index - 1].segment !== point.segment) segments.push([]);
    segments[segments.length - 1].push([point.lat, point.lng]);
  });
  return segments.filter((segment) => segment.length > 0);
}

/** Rzut trasy do prostokąta (szkic bez kafelków mapy). */
export function projectRoute(
  route: RoutePoint[],
  width: number,
  height: number,
  pad = 12,
): string[] {
  if (route.length < 2) return [];
  const midLat = route.reduce((s, p) => s + p.lat, 0) / route.length;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = route.map((p) => p.lng * kx);
  const ys = route.map((p) => -p.lat);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const scale = Math.min(
    (width - pad * 2) / Math.max(1e-9, maxX - minX),
    (height - pad * 2) / Math.max(1e-9, maxY - minY),
  );
  const offX = (width - (maxX - minX) * scale) / 2;
  const offY = (height - (maxY - minY) * scale) / 2;
  const paths: string[] = [];
  route.forEach((point, index) => {
    const x = (xs[index] - minX) * scale + offX;
    const y = (ys[index] - minY) * scale + offY;
    const move = index === 0 || route[index - 1].segment !== point.segment;
    if (move) paths.push("");
    paths[paths.length - 1] += `${move ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return paths;
}

const ROUTE_COLOR = "#16a34a";

export function RunRouteMap({ route, height = 220 }: { route: RoutePoint[]; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"loading" | "map" | "sketch">("loading");
  const segments = useMemo(() => routeSegments(route), [route]);

  useEffect(() => {
    if (route.length < 2 || !host.current) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    (async () => {
      try {
        const [{ default: L }] = await Promise.all([
          import("leaflet"),
          import("leaflet/dist/leaflet.css"),
        ]);
        if (cancelled || !host.current) return;
        const map = L.map(host.current, {
          zoomControl: false,
          attributionControl: true,
          scrollWheelZoom: false,
        });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }).addTo(map);
        const lines = segments.map((segment) =>
          L.polyline(segment, { color: ROUTE_COLOR, weight: 4, opacity: 0.95 }).addTo(map),
        );
        const first = route[0];
        const last = route[route.length - 1];
        L.circleMarker([first.lat, first.lng], {
          radius: 6,
          color: "#fff",
          weight: 2,
          fillColor: ROUTE_COLOR,
          fillOpacity: 1,
        }).addTo(map);
        L.circleMarker([last.lat, last.lng], {
          radius: 6,
          color: "#fff",
          weight: 2,
          fillColor: "#111827",
          fillOpacity: 1,
        }).addTo(map);
        const bounds = L.featureGroup(lines).getBounds();
        map.fitBounds(bounds, { padding: [18, 18] });
        // Mapa w zwiniętej sekcji ma zerowy rozmiar — dopasuj po rozwinięciu.
        const resize =
          typeof ResizeObserver === "undefined"
            ? null
            : new ResizeObserver(() => {
                map.invalidateSize();
                map.fitBounds(bounds, { padding: [18, 18] });
              });
        resize?.observe(host.current);
        dispose = () => {
          resize?.disconnect();
          map.remove();
        };
        setMode("map");
      } catch {
        if (!cancelled) setMode("sketch");
      }
    })();
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [route, segments]);

  if (route.length < 2) return null;
  const paths = mode === "sketch" ? projectRoute(route, 320, height) : [];
  return (
    <div className="bw-run-map" style={{ height }}>
      <div
        ref={host}
        className="bw-run-map-canvas"
        role="img"
        aria-label="Mapa trasy biegu"
        hidden={mode === "sketch"}
      />
      {mode === "sketch" && (
        <svg
          viewBox={`0 0 320 ${height}`}
          className="bw-run-map-canvas"
          role="img"
          aria-label="Kształt trasy biegu"
        >
          {paths.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={ROUTE_COLOR}
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
        </svg>
      )}
    </div>
  );
}
