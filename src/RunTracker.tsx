import { useEffect, useMemo, useRef, useState } from "react";
import {
  addPoint, averagePace, currentPace, distanceAt, emptyTrack, formatPace, intervalTimeline, kmSplits, localISO, phaseAt,
} from "./engine";
import type { GeoPoint, RunPhase, RunSession, TrackState } from "./engine";

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

type Status = "ready" | "running" | "paused" | "done";

const fmtTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const pace = (p: number | null) => (p ? formatPace(p).replace("/km", "") : "–:––");

function timelineFor(session: RunSession): RunPhase[] {
  if (session.isTest) return [{ kind: "work", seconds: 300, label: "Test MAS – 5 minut" }];
  return session.blocks.flatMap((b) =>
    b.reps > 1 ? intervalTimeline(b) : [{ kind: "work" as const, seconds: b.workS, label: b.label }],
  );
}

/** Szkic trasy (gdy brak tokenu Mapbox): rzut lat/lon na płaszczyznę. */
function RouteSketch({ points }: { points: GeoPoint[] }) {
  if (points.length < 2) {
    return <div className="flex h-full items-center justify-center text-sm text-muted">Trasa pojawi się po starcie</div>;
  }
  const lat0 = points[0]!.lat, k = Math.cos((lat0 * Math.PI) / 180);
  const xy = points.map((p) => ({ x: p.lon * k, y: -p.lat }));
  const xs = xy.map((p) => p.x), ys = xy.map((p) => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1e-6;
  const n = xy.map((p) => ({ x: 8 + ((p.x - minX) / span) * 84, y: 8 + ((p.y - minY) / span) * 84 }));
  const d = n.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const last = n[n.length - 1]!;
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      <path d={d} fill="none" stroke="#1b2a41" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="2" fill="#1b2a41" />
    </svg>
  );
}

/** Mapa Mapbox (kafelki przez Leaflet), ładowana leniwie. */
function MapView({ points }: { points: GeoPoint[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<{ setLatLngs: (p: [number, number][]) => void; follow: (p: [number, number]) => void } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let destroy = () => {};
    void (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !el.current) return;
      const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([52.23, 21.01], 16);
      L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${TOKEN}`, {
        attribution: "© Mapbox © OpenStreetMap",
        maxZoom: 19,
      }).addTo(m);
      const line = L.polyline([], { color: "#1b2a41", weight: 4 }).addTo(m);
      map.current = { setLatLngs: (p) => line.setLatLngs(p), follow: (p) => m.setView(p, m.getZoom(), { animate: true }) };
      destroy = () => m.remove();
    })();
    return () => { cancelled = true; destroy(); };
  }, []);
  useEffect(() => {
    if (!map.current || !points.length) return;
    const ll = points.map((p) => [p.lat, p.lon] as [number, number]);
    map.current.setLatLngs(ll);
    map.current.follow(ll[ll.length - 1]!);
  }, [points]);
  return <div ref={el} className="h-full w-full" />;
}

export interface RunResult { distanceM: number; elapsedMs: number; distanceAt5min: number | null }

export function RunTracker({ session, onClose, onFinish }: {
  session: RunSession;
  onClose: () => void;
  onFinish: (r: RunResult) => void;
}) {
  const timeline = useMemo(() => timelineFor(session), [session]);
  const [status, setStatus] = useState<Status>("ready");
  const [track, setTrack] = useState<TrackState>(emptyTrack);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const base = useRef(0); // ms biegu przed ostatnim wznowieniem
  const resumedAt = useRef(0);
  const watch = useRef<number | null>(null);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const lastPhase = useRef(-1);

  const now = () => base.current + (performance.now() - resumedAt.current);

  const startGps = () => {
    if (!("geolocation" in navigator)) { setError("Ta przeglądarka nie udostępnia GPS."); return; }
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        const t = now();
        setError("");
        setTrack((s) => addPoint(s, { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, t }));
      },
      // przekroczenie czasu (kod 3) zdarza się chwilowo – śledzenie trwa dalej, więc go nie pokazujemy
      (e) => { if (e.code === 1) setError("Brak zgody na lokalizację. Włącz ją w ustawieniach przeglądarki."); else if (e.code === 2) setError("Brak sygnału GPS."); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  };
  const stopGps = () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); watch.current = null; };

  const keepAwake = async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
      wake.current = (await nav.wakeLock?.request("screen")) ?? null;
    } catch { /* brak blokady ekranu – ekran może zgasnąć */ }
  };

  const start = () => { resumedAt.current = performance.now(); setStatus("running"); startGps(); void keepAwake(); };
  const pause = () => { base.current = now(); setStatus("paused"); stopGps(); };
  const finish = () => {
    if (status === "running") base.current = now();
    stopGps(); void wake.current?.release(); setStatus("done");
  };

  useEffect(() => {
    if (status !== "running") return;
    const id = setInterval(() => setElapsed(now()), 250);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => () => { stopGps(); void wake.current?.release(); }, []);

  const ph = phaseAt(timeline, elapsed / 1000);
  useEffect(() => {
    const idx = ph ? ph.index : timeline.length;
    if (status === "running" && idx !== lastPhase.current) {
      if (lastPhase.current !== -1 || idx === 0) navigator.vibrate?.(idx >= timeline.length ? [300, 100, 300, 100, 300] : [250]);
      lastPhase.current = idx;
    }
  }, [ph?.index, status, timeline.length]);

  const phase = ph ? timeline[ph.index]! : null;
  const block = session.blocks[0];
  const splits = kmSplits(track);
  const at5 = elapsed >= 300_000 ? distanceAt(track, 300_000) : null;

  return (
    <div className="bw-sheet fixed inset-0 z-40 flex flex-col bg-canvas">
      <div className="relative h-[42vh] w-full overflow-hidden border-b border-hairline bg-hairline/50">
        {TOKEN ? <MapView points={track.points} /> : <RouteSketch points={track.points} />}
        <button onClick={() => { stopGps(); onClose(); }} className="absolute right-3 top-3 z-[500] rounded-full bg-card/90 px-3 py-1 text-sm text-muted">Zamknij</button>
        {!TOKEN && <span className="absolute bottom-2 left-3 text-[11px] text-muted">Mapa po dodaniu tokenu Mapbox</span>}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-4">
        <div className="text-xs uppercase tracking-wide text-muted">{session.title}</div>
        {phase && status !== "done" ? (
          <div className="mt-2 rounded-2xl border border-hairline bg-card p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">{phase.kind === "work" ? phase.label : phase.label}</span>
              <span className="text-2xl font-semibold tabular-nums">{Math.ceil(ph!.left)} s</span>
            </div>
            {phase.kind === "work" && block && !session.isTest && <div className="text-xs text-muted">Tempo docelowe {block.paceText}</div>}
          </div>
        ) : status === "running" ? (
          <div className="mt-2 rounded-2xl border border-hairline bg-card p-3 text-sm">Plan zrobiony – możesz zakończyć.</div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            ["Czas", fmtTime(elapsed)],
            ["Dystans", `${(track.distanceM / 1000).toFixed(2)} km`],
            ["Tempo teraz", pace(currentPace(track, elapsed))],
            ["Tempo średnie", pace(averagePace(track.distanceM, elapsed))],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-hairline bg-card p-3">
              <div className="text-xs text-muted">{k}</div>
              <div className="text-xl font-semibold tabular-nums">{v}</div>
            </div>
          ))}
        </div>

        {splits.length > 0 && (
          <div className="mt-4 rounded-2xl border border-hairline bg-card p-3 text-sm">
            <div className="mb-1 text-xs text-muted">Odcinki km</div>
            {splits.map((s, i) => (
              <div key={i} className="flex justify-between py-0.5 tabular-nums"><span>{i + 1} km</span><span>{formatPace(s)}</span></div>
            ))}
          </div>
        )}

        {status === "done" && session.isTest && (
          <div className="mt-4 rounded-2xl border border-hairline bg-card p-3 text-sm">
            {at5 ? `Dystans po 5 minutach: ${Math.round(at5)} m.` : "Test trwał krócej niż 5 minut – wynik nie jest ważny."}
          </div>
        )}
        {error && <p className="mt-3 rounded-xl border border-hairline bg-card p-3 text-sm text-red-ink">{error}</p>}
        <p className="mt-3 text-[11px] text-muted">
          {status === "ready" ? "Rozgrzej się przed startem. Ekran pozostanie włączony – w przeglądarce GPS działa tylko z włączonym ekranem." : ""}
        </p>
      </div>

      <div className="flex gap-2 px-5 pb-8 pt-3">
        {status === "ready" && <button onClick={start} className="flex-1 rounded-2xl bw-grad py-3.5 text-base font-medium text-white">Start</button>}
        {status === "running" && <button onClick={pause} className="flex-1 rounded-2xl border border-hairline bg-card py-3.5 text-base">Pauza</button>}
        {status === "paused" && <button onClick={start} className="flex-1 rounded-2xl bw-grad py-3.5 text-base font-medium text-white">Wznów</button>}
        {(status === "running" || status === "paused") && (
          <button onClick={finish} className="flex-1 rounded-2xl bw-grad py-3.5 text-base font-medium text-white">Zakończ</button>
        )}
        {status === "done" && (
          <button
            onClick={() => {
              saveRun(track, elapsed);
              onFinish({ distanceM: track.distanceM, elapsedMs: elapsed, distanceAt5min: at5 });
            }}
            className="flex-1 rounded-2xl bw-grad py-3.5 text-base font-medium text-white"
          >
            {session.isTest && at5 ? "Zapisz MAS i bieg" : "Zapisz bieg"}
          </button>
        )}
      </div>
    </div>
  );
}

function saveRun(track: TrackState, elapsedMs: number) {
  try {
    const runs = JSON.parse(localStorage.getItem("runs") ?? "[]") as unknown[];
    runs.push({
      date: localISO(),
      distanceM: Math.round(track.distanceM),
      elapsedMs: Math.round(elapsedMs),
      splits: kmSplits(track).map((s) => Math.round(s)),
      // co 5. punkt wystarcza do narysowania trasy
      route: track.points.filter((_, i) => i % 5 === 0).map((p) => [Number(p.lat.toFixed(5)), Number(p.lon.toFixed(5))]),
    });
    localStorage.setItem("runs", JSON.stringify(runs));
  } catch { /* brak pamięci */ }
}
