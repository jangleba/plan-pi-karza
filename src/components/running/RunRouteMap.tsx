import { useEffect, useRef, useState } from "react";
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
  const instance = useRef<{
    L: typeof import("leaflet");
    map: import("leaflet").Map;
    layer: import("leaflet").LayerGroup;
  } | null>(null);
  const [mode, setMode] = useState<"loading" | "map" | "sketch">("loading");
  const hasPosition = route.length > 0;

  // One map per mounted host. New GPS samples update layers, never the map itself.
  useEffect(() => {
    if (!hasPosition || !host.current) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void (async () => {
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
        const layer = L.layerGroup().addTo(map);
        let failures = 0;
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        })
          .on("tileerror", () => {
            if (++failures >= 3 && !cancelled) setMode("sketch");
          })
          .addTo(map);
        instance.current = { L, map, layer };
        const resize =
          typeof ResizeObserver === "undefined"
            ? null
            : new ResizeObserver(() => map.invalidateSize());
        resize?.observe(host.current);
        dispose = () => {
          resize?.disconnect();
          map.remove();
          instance.current = null;
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
  }, [hasPosition]);

  useEffect(() => {
    const state = instance.current;
    if (!state || !route.length || mode !== "map") return;
    const { L, map, layer } = state;
    layer.clearLayers();
    for (const segment of routeSegments(route))
      if (segment.length > 1)
        L.polyline(segment, { color: ROUTE_COLOR, weight: 4, opacity: 0.95 }).addTo(layer);
    const last = route[route.length - 1];
    L.circleMarker([last.lat, last.lng], {
      radius: 6,
      color: "#fff",
      weight: 2,
      fillColor: ROUTE_COLOR,
      fillOpacity: 1,
    }).addTo(layer);
    if (route.length === 1) map.setView([last.lat, last.lng], 17);
    else
      map.fitBounds(L.latLngBounds(route.map((p) => [p.lat, p.lng])), {
        padding: [18, 18],
        maxZoom: 17,
        animate: false,
      });
  }, [route, mode]);

  if (!hasPosition)
    return (
      <div
        className="bw-run-map flex items-center justify-center p-4 text-center text-xs text-muted-foreground"
        style={{ height }}
        role="status"
      >
        Włącz lokalizację, aby przygotować mapę. Bez pozycji GPS nie rysujemy trasy.
      </div>
    );
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
      {mode === "loading" && (
        <p role="status" className="p-3 text-xs">
          Przygotowuję mapę…
        </p>
      )}
      {mode === "sketch" && (
        <>
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
            {route.length === 1 && <circle cx="160" cy={height / 2} r="5" fill={ROUTE_COLOR} />}
          </svg>
          <p
            role="status"
            className="absolute bottom-2 left-2 right-2 rounded-lg bg-background/90 p-2 text-xs"
          >
            Podkład mapy niedostępny. GPS i zapis śladu działają niezależnie.
          </p>
        </>
      )}
    </div>
  );
}
