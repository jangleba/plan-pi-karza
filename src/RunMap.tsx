import { useEffect, useMemo, useRef, useState } from "react";
import { coloredRuns, decimate, headingOf, routeBounds, segmentLines, type RoutePoint } from "./engine/routeMap";

/** Token Mapbox (publiczny, `pk.`): bez niego (albo z błędnym) zamiast mapy rysujemy samą trasę. Konfiguracja: docs/BIEG-W-TLE.md. */
const RAW_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
export const MAP_TOKEN = RAW_TOKEN && /^pk\.[\w-]+\.[\w-]+$/.test(RAW_TOKEN.trim()) ? RAW_TOKEN.trim() : undefined;
export const HAS_MAP = !!MAP_TOKEN;

const MAX_DRAW = 800;
const START = "#2e9e62", END = "#1b2a41", BLUE = "#2f6fb3";

/** Bieżąca pozycja biegacza do narysowania na mapie. */
export interface MapPosition { lat: number; lon: number; acc: number; /** stopnie od północy; null = nie znamy wiarygodnego kierunku */ heading: number | null; stale: boolean }
export type TileState = "loading" | "ok" | "error";

/** Znacznik pozycji: niebieska kropka z białą obwódką i (tylko przy wiarygodnym kierunku) strzałką. */
const positionIcon = (heading: number | null, stale: boolean) =>
  `<div style="position:relative;width:26px;height:26px;opacity:${stale ? 0.5 : 1}">${heading !== null ? `<svg viewBox="0 0 26 26" width="26" height="26" style="position:absolute;inset:0;transform:rotate(${heading}deg)"><path d="M13 1 L19 11 L13 8.5 L7 11 Z" fill="${BLUE}"/></svg>` : ""}<div style="position:absolute;left:6px;top:6px;width:14px;height:14px;border-radius:50%;background:${BLUE};border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25),0 2px 6px rgba(0,0,0,.3)"></div></div>`;

/** Szkic RZECZYWISTEJ trasy bez mapy: rzut współrzędnych na płaszczyznę. */
function RouteSketch({ points, mode, position }: { points: RoutePoint[]; mode: "live" | "summary"; position: MapPosition | null }) {
  const view = useMemo(() => {
    const pts = decimate(points, MAX_DRAW);
    if (pts.length < 2) return null;
    const k = Math.cos((pts[0]!.lat * Math.PI) / 180);
    const xy = (p: { lat: number; lon: number }) => ({ x: p.lon * k, y: -p.lat });
    const all = pts.map(xy), xs = all.map((p) => p.x), ys = all.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys), span = Math.max(maxX - minX, maxY - minY) || 1e-6;
    const map = (p: { lat: number; lon: number }) => { const q = xy(p); return { x: 50 + ((q.x - (minX + maxX) / 2) / span) * 84, y: 50 + ((q.y - (minY + maxY) / 2) / span) * 84 }; };
    const lines = mode === "live" ? segmentLines(pts).map((l) => ({ color: BLUE, line: l })) : coloredRuns(pts);
    const runs = lines.map((r) => ({ color: r.color, d: r.line.map(([lat, lon], i) => { const m = map({ lat, lon }); return `${i ? "L" : "M"}${m.x.toFixed(2)},${m.y.toFixed(2)}`; }).join(" ") }));
    const s = map(pts[0]!), e = map(pts[pts.length - 1]!);
    return { runs, s, e, heading: headingOf(pts) };
  }, [points, mode]);
  if (!view) return null;
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label="Trasa biegu">
      {view.runs.map((r, i) => <path key={`o${i}`} d={r.d} fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />)}
      {view.runs.map((r, i) => <path key={i} d={r.d} fill="none" stroke={r.color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />)}
      <circle cx={view.s.x} cy={view.s.y} r="2" fill={START} stroke="#fff" strokeWidth="0.8" />
      {mode === "live" ? (
        <g transform={`translate(${view.e.x} ${view.e.y})`} opacity={position?.stale ? 0.5 : 1}>
          {view.heading !== null && <path d="M0 -5.5 L2.6 -1 L0 -2.2 L-2.6 -1 Z" fill={BLUE} transform={`rotate(${view.heading})`} />}
          <circle r="2.6" fill={BLUE} stroke="#fff" strokeWidth="1" />
        </g>
      ) : <circle cx={view.e.x} cy={view.e.y} r="2" fill={END} stroke="#fff" strokeWidth="0.8" />}
    </svg>
  );
}

interface Api {
  update: (pts: RoutePoint[]) => void; setPosition: (p: MapPosition | null) => void; follow: (on: boolean) => void; recenter: () => void;
  resize: () => void; destroy: () => void;
}

/**
 * Mapa biegu.
 * `mode="live"`: aktywny bieg – jedna niebieska linia przebytej trasy (osobne odcinki po pauzie/utracie GPS), zielony start, kropka pozycji z okręgiem dokładności,
 *   podążanie za biegaczem (wyłączane ręcznym przesunięciem/zoomem, `recenterKey` włącza ponownie).
 * `mode="summary"`: cała trasa w kadrze, pokolorowana tempem (podsumowanie i lista biegów).
 * Bez tokenu, bez sieci albo przy błędzie kafelków: szkic rzeczywistej trasy (jeśli jest) i komunikat.
 */
export function RunMap({ points, live, mode = live ? "live" : "summary", position = null, following = true, recenterKey = 0, recording = false, noLocation = false, bottomInset = 0, onUserMove, onTiles }: {
  points: RoutePoint[]; live: boolean; mode?: "live" | "summary"; position?: MapPosition | null; following?: boolean; recenterKey?: number; recording?: boolean; /** brak zgody na GPS albo GPS niedostępny */ noLocation?: boolean; /** px wolnego miejsca od dołu (np. pod przyciskiem pauzy w powiększonej mapie) */ bottomInset?: number;
  onUserMove?: () => void; onTiles?: (s: TileState) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const latest = useRef({ points, position, following, mode, onUserMove, onTiles });
  latest.current = { points, position, following, mode, onUserMove, onTiles };
  const lastDrawn = useRef({ n: -1, t: 0, mode });
  const [tiles, setTiles] = useState<TileState>(HAS_MAP ? "loading" : "error");
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  useEffect(() => { latest.current.onTiles?.(!HAS_MAP || !online ? "error" : tiles); }, [tiles, online]);

  useEffect(() => {
    if (!HAS_MAP) return;
    let cancelled = false, ro: ResizeObserver | null = null;
    void (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !el.current) return;
      const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([52.0, 19.4], 6);
      m.attributionControl.setPrefix(false); // zostaje atrybucja dostawców map (Mapbox, OpenStreetMap)
      let ok = 0, bad = 0;
      const layer = L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${MAP_TOKEN}`, { attribution: "© Mapbox © OpenStreetMap", maxZoom: 19 }).addTo(m);
      layer.on("tileload", () => { ok++; bad = 0; setTiles("ok"); });
      layer.on("tileerror", () => { bad++; if (bad >= 3 && ok === 0) setTiles("error"); else if (bad >= 6) setTiles("error"); });
      const lines = L.layerGroup().addTo(m);
      let start: ReturnType<typeof L.circleMarker> | null = null, me: ReturnType<typeof L.marker> | null = null, acc: ReturnType<typeof L.circle> | null = null;
      let programmatic = 0, followOn = latest.current.following, firstFix = true;
      const move = (fn: () => void) => { programmatic++; fn(); setTimeout(() => { programmatic = Math.max(0, programmatic - 1); }, 700); };
      const user = () => { if (programmatic === 0 && followOn) { followOn = false; latest.current.onUserMove?.(); } };
      m.on("dragstart", user); m.on("zoomstart", user);
      const center = (p: MapPosition) => move(() => m.setView([p.lat, p.lon], firstFix ? 17 : Math.max(m.getZoom(), 15), { animate: !firstFix }));
      api.current = {
        update: (all) => {
          const pts = decimate(all, MAX_DRAW), md = latest.current.mode;
          lines.clearLayers();
          if (md === "live") {
            for (const l of segmentLines(pts)) {
              L.polyline(l, { color: "#fff", weight: 8, opacity: 0.9, lineCap: "round", lineJoin: "round", interactive: false }).addTo(lines);
              L.polyline(l, { color: BLUE, weight: 5, opacity: 1, lineCap: "round", lineJoin: "round", interactive: false }).addTo(lines);
            }
          } else for (const r of coloredRuns(pts)) L.polyline(r.line, { color: r.color, weight: 5, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(lines);
          if (!pts.length) return;
          const f = pts[0]!;
          if (!start) start = L.circleMarker([f.lat, f.lon], { radius: 7, color: "#fff", weight: 2.5, fillColor: START, fillOpacity: 1, interactive: false }).addTo(m); else start.setLatLng([f.lat, f.lon]);
          if (md === "summary") {
            if (me) { me.remove(); me = null; } if (acc) { acc.remove(); acc = null; }
            const b = routeBounds(pts);
            if (b && pts.length > 1) move(() => m.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [28, 28], maxZoom: 17, animate: false }));
          }
        },
        setPosition: (p) => {
          if (!p || latest.current.mode !== "live") { me?.remove(); me = null; acc?.remove(); acc = null; return; }
          const icon = L.divIcon({ html: positionIcon(p.heading, p.stale), className: "", iconSize: [26, 26], iconAnchor: [13, 13] });
          if (!me) me = L.marker([p.lat, p.lon], { icon, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(m); else { me.setLatLng([p.lat, p.lon]); me.setIcon(icon); }
          const r = Math.min(Math.max(p.acc, 3), 80);
          if (!acc) acc = L.circle([p.lat, p.lon], { radius: r, color: BLUE, weight: 1, opacity: p.stale ? 0.2 : 0.45, fillColor: BLUE, fillOpacity: p.stale ? 0.05 : 0.12, interactive: false }).addTo(m); else { acc.setLatLng([p.lat, p.lon]); acc.setRadius(r); }
          if (followOn) { center(p); firstFix = false; }
        },
        follow: (on) => { followOn = on; },
        recenter: () => { const p = latest.current.position; if (p) { followOn = true; firstFix = false; center(p); } },
        resize: () => m.invalidateSize(),
        destroy: () => { ro?.disconnect(); m.remove(); },
      };
      ro = new ResizeObserver(() => api.current?.resize());
      ro.observe(el.current);
      api.current.update(latest.current.points);
      api.current.setPosition(latest.current.position);
    })();
    return () => { cancelled = true; api.current?.destroy(); api.current = null; };
  }, []);

  // linie: na żywo co kilka punktów lub 2 s (tysiące łamanych przy każdym odczycie to za dużo), po zakończeniu od razu
  useEffect(() => {
    if (!HAS_MAP || !api.current) return;
    const d = lastDrawn.current, now = Date.now();
    const changed = d.mode !== mode;
    if (!changed && mode === "live" && points.length - d.n < 3 && now - d.t < 2000 && d.n >= 0) return;
    lastDrawn.current = { n: points.length, t: now, mode };
    api.current.update(points);
  }, [points, mode]);
  useEffect(() => { api.current?.setPosition(position); }, [position?.lat, position?.lon, position?.acc, position?.heading, position?.stale, mode]);
  useEffect(() => { api.current?.follow(following); }, [following]);
  useEffect(() => { if (recenterKey) api.current?.recenter(); }, [recenterKey]);

  const noBase = !HAS_MAP || tiles === "error" || !online;
  const waiting = mode === "live" && !position && points.length === 0;
  const sketchPts = points.length >= 2 ? points : [];
  return (
    <div className="relative h-full w-full bg-hairline/40">
      {HAS_MAP && <div ref={el} className="h-full w-full" />}
      {noBase && (
        <div className="absolute inset-0 z-[400] bg-[#eaf0e7]">
          <div className="absolute inset-x-6 bottom-14 top-14"><RouteSketch points={sketchPts} mode={mode} position={position} /></div>
          <p style={{ bottom: 12 + bottomInset + (HAS_MAP ? 22 : 0) }} className="absolute left-3 whitespace-nowrap rounded-full bg-white/90 px-3 py-1.5 text-[12px] text-muted shadow-[0_1px_4px_rgba(0,0,0,.1)]">{recording ? "Mapa niedostępna — zapis trasy trwa" : "Mapa niedostępna"}</p>
        </div>
      )}
      {waiting && <div className="absolute inset-0 z-[450] flex items-center justify-center bg-white/55 text-[15px] text-muted backdrop-blur-[1px]">{noLocation ? "Lokalizacja niedostępna" : "Czekam na lokalizację…"}</div>}
    </div>
  );
}
