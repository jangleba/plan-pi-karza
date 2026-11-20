import { useEffect, useMemo, useRef } from "react";
import { coloredRuns, decimate, headingOf, routeBounds, type RoutePoint } from "./engine/routeMap";

/** Token Mapbox (publiczny, `pk.`): bez niego zamiast mapy rysujemy samą trasę. */
export const MAP_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
export const HAS_MAP = !!MAP_TOKEN;

const MAX_DRAW = 800;
const START = "#2e9e62", END = "#1b2a41";

/** Znacznik pozycji: kropka z obwódką i strzałką kierunku (obrót w stopniach od północy). */
const positionIcon = (heading: number | null) =>
  `<div style="position:relative;width:26px;height:26px">${heading !== null ? `<svg viewBox="0 0 26 26" width="26" height="26" style="position:absolute;inset:0;transform:rotate(${heading}deg)"><path d="M13 1 L19 11 L13 8.5 L7 11 Z" fill="#2f6fb3"/></svg>` : ""}<div style="position:absolute;left:6px;top:6px;width:14px;height:14px;border-radius:50%;background:#2f6fb3;border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25),0 2px 6px rgba(0,0,0,.3)"></div></div>`;

/** Szkic trasy bez mapy: rzut współrzędnych na płaszczyznę, kolory tempa i znacznik pozycji. */
function RouteSketch({ points, live }: { points: RoutePoint[]; live: boolean }) {
  const view = useMemo(() => {
    const pts = decimate(points, MAX_DRAW);
    if (pts.length < 2) return null;
    const k = Math.cos((pts[0]!.lat * Math.PI) / 180);
    const xy = (p: RoutePoint) => ({ x: p.lon * k, y: -p.lat });
    const all = pts.map(xy), xs = all.map((p) => p.x), ys = all.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys), span = Math.max(maxX - minX, maxY - minY) || 1e-6;
    // trasa wyśrodkowana w kadrze, z marginesem 8%
    const map = (p: RoutePoint) => { const q = xy(p); return `${(50 + ((q.x - (minX + maxX) / 2) / span) * 84).toFixed(2)},${(50 + ((q.y - (minY + maxY) / 2) / span) * 84).toFixed(2)}`; };
    const runs = coloredRuns(pts).map((r) => ({ color: r.color, d: r.line.map(([lat, lon], i) => `${i ? "L" : "M"}${map({ lat, lon })}`).join(" ") }));
    const [sx, sy] = map(pts[0]!).split(",").map(Number) as [number, number], [ex, ey] = map(pts[pts.length - 1]!).split(",").map(Number) as [number, number];
    return { runs, sx, sy, ex, ey, heading: headingOf(pts) };
  }, [points]);
  if (!view) return <div className="flex h-full items-center justify-center text-sm text-muted">Trasa pojawi się po starcie</div>;
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label="Trasa biegu">
      {view.runs.map((r, i) => <path key={i} d={r.d} fill="none" stroke={r.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />)}
      <circle cx={view.sx} cy={view.sy} r="2" fill={START} stroke="#fff" strokeWidth="0.8" />
      {live ? (
        <g transform={`translate(${view.ex} ${view.ey})`}>
          {view.heading !== null && <path d="M0 -5.5 L2.6 -1 L0 -2.2 L-2.6 -1 Z" fill="#2f6fb3" transform={`rotate(${view.heading})`} />}
          <circle r="2.6" fill="#2f6fb3" stroke="#fff" strokeWidth="1" />
        </g>
      ) : <circle cx={view.ex} cy={view.ey} r="2" fill={END} stroke="#fff" strokeWidth="0.8" />}
    </svg>
  );
}

type Api = { update: (pts: RoutePoint[]) => void; destroy: () => void };

/**
 * Mapa biegu. Z tokenem Mapbox: prawdziwa mapa (Leaflet), trasa pokolorowana tempem (zielony szybko → czerwony wolno), start,
 * a na żywo kropka pozycji ze strzałką kierunku i podążanie za biegaczem. Bez tokenu: szkic trasy z tymi samymi kolorami.
 * `live` – bieg trwa (mapa podąża); w przeciwnym razie mapa pokazuje całą trasę.
 */
export function RunMap({ points, live }: { points: RoutePoint[]; live: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const latest = useRef({ points, live });
  latest.current = { points, live };
  const lastDrawn = useRef({ n: -1, t: 0, live });

  useEffect(() => {
    if (!HAS_MAP) return;
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !el.current) return;
      const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([52.23, 21.01], 16);
      L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${MAP_TOKEN}`, { attribution: "© Mapbox © OpenStreetMap", maxZoom: 19 }).addTo(m);
      const lines = L.layerGroup().addTo(m);
      let start: ReturnType<typeof L.circleMarker> | null = null, me: ReturnType<typeof L.marker> | null = null, first = true;
      api.current = {
        update: (all) => {
          const pts = decimate(all, MAX_DRAW), isLive = latest.current.live;
          lines.clearLayers();
          for (const r of coloredRuns(pts)) L.polyline(r.line, { color: r.color, weight: 5, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(lines);
          if (!pts.length) return;
          const f = pts[0]!, e = pts[pts.length - 1]!;
          if (!start) start = L.circleMarker([f.lat, f.lon], { radius: 6, color: "#fff", weight: 2, fillColor: START, fillOpacity: 1 }).addTo(m); else start.setLatLng([f.lat, f.lon]);
          if (isLive) {
            const icon = L.divIcon({ html: positionIcon(headingOf(pts)), className: "", iconSize: [26, 26], iconAnchor: [13, 13] });
            if (!me) me = L.marker([e.lat, e.lon], { icon, interactive: false, keyboard: false }).addTo(m); else { me.setLatLng([e.lat, e.lon]); me.setIcon(icon); }
            m.setView([e.lat, e.lon], first ? 17 : m.getZoom(), { animate: !first });
            first = false;
          } else {
            if (me) { me.remove(); me = null; }
            const b = routeBounds(pts);
            if (b && pts.length > 1) m.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [28, 28], maxZoom: 17, animate: false });
          }
        },
        destroy: () => m.remove(),
      };
      api.current.update(latest.current.points);
    })();
    return () => { cancelled = true; api.current?.destroy(); api.current = null; };
  }, []);

  // odświeżanie mapy: na żywo co kilka punktów lub 2 s (tysiące łamanych przy każdym odczycie GPS to za dużo), po zakończeniu od razu
  useEffect(() => {
    if (!HAS_MAP || !api.current) return;
    const d = lastDrawn.current, now = Date.now();
    const changedMode = d.live !== live;
    if (!changedMode && live && points.length - d.n < 3 && now - d.t < 2000 && d.n >= 0) return;
    lastDrawn.current = { n: points.length, t: now, live };
    api.current.update(points);
  }, [points, live]);

  if (!HAS_MAP) return <RouteSketch points={points} live={live} />;
  return <div ref={el} className="h-full w-full" />;
}
