import { useEffect, useMemo, useRef, useState } from "react";
import {
  addPoint, averagePace, currentPace, distanceAt, emptyTrack, formatPace, intervalTimeline, kmSplits, localISO, paceSeries, phaseAt, phaseResults,
} from "./engine";
import type { GeoPoint, RunPhase, RunSession, TrackState } from "./engine";
import { scoped } from "./lib/store";
import { beep, buzz, prepareAudio } from "./tools/feedback";

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

/** Podsumowanie po biegu: wykres tempa w czasie i porównanie powtórzeń (tylko z tego, co zmierzył GPS). */
function RunSummary({ track, elapsedMs, timeline }: { track: TrackState; elapsedMs: number; timeline: RunPhase[] }) {
  const series = useMemo(() => paceSeries(track, elapsedMs), [track, elapsedMs]);
  const reps = useMemo(() => (timeline.length > 1 ? phaseResults(timeline, track, elapsedMs).filter((r) => r.paceSPerKm !== null) : []), [timeline, track, elapsedMs]);
  if (series.length < 2 && reps.length < 2) return null;
  const paces = series.map((p) => p.pace);
  const lo = Math.min(...paces), hi = Math.max(...paces), span = Math.max(hi - lo, 20);
  const W = 300, H = 90, maxT = series.length ? series[series.length - 1]!.tS : 1;
  const pts = series.map((p) => `${(p.tS / maxT) * W},${6 + ((p.pace - lo) / span) * (H - 12)}`); // szybciej = wyżej
  const best = reps.length ? Math.min(...reps.map((r) => r.paceSPerKm!)) : 0;
  return (
    <div className="mt-4 rounded-2xl border border-hairline bg-card p-3 text-sm">
      <div className="text-xs text-muted">Podsumowanie</div>
      {series.length >= 2 && (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label="Tempo w czasie">
            <polyline points={pts.join(" ")} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <div className="mt-1 flex justify-between text-[11px] text-muted tabular-nums"><span>start</span><span>najszybciej {pace(lo)} · najwolniej {pace(hi)}</span><span>{fmtTime(elapsedMs)}</span></div>
        </>
      )}
      {reps.length >= 2 && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-muted">Powtórzenia</div>
          {reps.map((r, i) => (
            <div key={i} className="flex justify-between py-0.5 tabular-nums">
              <span>{r.label}</span>
              <span>{Math.round(r.distanceM)} m · {formatPace(r.paceSPerKm!)}{r.paceSPerKm === best ? " ★" : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
  const lastFix = useRef(0); // chwila (performance.now) ostatniego odczytu GPS, także odrzuconego przez filtr
  const lastAcc = useRef<number | null>(null);
  const lastBeepS = useRef(-1);
  const [weak, setWeak] = useState<"" | "silent" | "inaccurate">("");
  const [flash, setFlash] = useState<{ kind: RunPhase["kind"]; n: number } | null>(null);

  const now = () => base.current + (performance.now() - resumedAt.current);

  const startGps = () => {
    if (!("geolocation" in navigator)) { setError("Ta przeglądarka nie udostępnia GPS."); return; }
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        const t = now();
        lastFix.current = performance.now();
        lastAcc.current = pos.coords.accuracy;
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

  const start = () => { prepareAudio(); resumedAt.current = performance.now(); lastFix.current = performance.now(); setStatus("running"); startGps(); void keepAwake(); };
  const pause = () => { base.current = now(); setStatus("paused"); stopGps(); };
  const finish = () => {
    if (status === "running") base.current = now();
    stopGps(); void wake.current?.release(); setStatus("done");
  };

  useEffect(() => {
    if (status !== "running") return;
    const id = setInterval(() => {
      setElapsed(now());
      const silentMs = performance.now() - lastFix.current;
      setWeak(silentMs > 10_000 ? "silent" : lastAcc.current !== null && lastAcc.current > 25 ? "inaccurate" : "");
    }, 250);
    return () => clearInterval(id);
  }, [status]);

  // po powrocie do aplikacji (zgaszony ekran, inna aplikacja) system potrafi zatrzymać GPS i zwolnić blokadę ekranu: włączamy je ponownie
  useEffect(() => {
    if (status !== "running") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      stopGps(); startGps(); void keepAwake();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [status]);

  useEffect(() => () => { stopGps(); void wake.current?.release(); }, []);

  const ph = phaseAt(timeline, elapsed / 1000);
  useEffect(() => {
    const idx = ph ? ph.index : timeline.length;
    if (status === "running" && idx !== lastPhase.current) {
      if (lastPhase.current !== -1 || idx === 0) {
        const end = idx >= timeline.length;
        const kind = end ? "work" : timeline[idx]!.kind;
        // dźwięk i błysk na ekranie działają też na iPhonie, gdzie przeglądarka nie obsługuje wibracji
        if (end) { beep(1046, 160); setTimeout(() => beep(1046, 160), 220); setTimeout(() => beep(1318, 320), 440); buzz(300); }
        else if (kind === "rest") { beep(523, 220); buzz(250); }
        else { beep(1046, 120); setTimeout(() => beep(1046, 120), 170); buzz(250); }
        if (timeline.length > 1) setFlash({ kind, n: idx + 1 });
      }
      lastPhase.current = idx;
      lastBeepS.current = -1;
    }
  }, [ph?.index, status, timeline.length]);

  // 3-2-1 przed końcem fazy
  const leftS = ph ? Math.ceil(ph.left) : null;
  useEffect(() => {
    if (status !== "running" || leftS === null || timeline.length < 2 || leftS > 3 || leftS === lastBeepS.current) return;
    lastBeepS.current = leftS;
    beep(660, 70);
  }, [leftS, status, timeline.length]);

  const phase = ph ? timeline[ph.index]! : null;
  const block = session.blocks[0];
  const splits = kmSplits(track);
  const at5 = elapsed >= 300_000 ? distanceAt(track, 300_000) : null;

  return (
    <div className="bw-sheet fixed inset-0 z-40 flex flex-col bg-canvas">
      {flash && <div key={flash.n} className={`bw-flash pointer-events-none fixed inset-0 z-[600] ${flash.kind === "rest" ? "bg-club" : "bg-accent"}`} aria-hidden="true" />}
      <div className="relative h-[24vh] w-full overflow-hidden border-b border-hairline bg-hairline/50">
        {TOKEN ? <MapView points={track.points} /> : <RouteSketch points={track.points} />}
        <button onClick={() => { stopGps(); onClose(); }} className="absolute right-3 top-3 z-[500] rounded-full bg-card/90 px-3 py-1 text-sm text-muted">Zamknij</button>
        {!TOKEN && <span className="absolute bottom-2 left-3 text-[11px] text-muted">Mapa po dodaniu tokenu Mapbox</span>}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-4">
        <div className="text-xs uppercase tracking-wide text-muted">{session.title}</div>
        {phase && status !== "done" ? (
          <div className={`mt-2 rounded-3xl p-4 transition-colors duration-300 ${phase.kind === "rest" ? "bg-club-soft text-club" : "bg-accent text-white"}`} aria-live="polite">
            <div className="flex items-start justify-between gap-3">
              <span className="text-base font-semibold">{phase.kind === "rest" ? "Przerwa" : phase.label}</span>
              {phase.kind === "work" && phase.reps && phase.reps > 1 && <span className="shrink-0 text-sm opacity-90">Powtórzenie {phase.rep} z {phase.reps}</span>}
            </div>
            <div className="mt-1 text-center font-semibold leading-none tabular-nums" style={{ fontSize: "min(28vw, 7rem)" }}>{Math.ceil(ph!.left)}<span className="ml-1 text-2xl opacity-80">s</span></div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/15">
              <div className="h-full rounded-full bg-white/80 transition-all duration-300" style={{ width: `${Math.max(0, Math.min(100, (1 - ph!.left / phase.seconds) * 100))}%` }} />
            </div>
            {phase.kind === "work" && block && !session.isTest && <div className="mt-2 text-center text-sm opacity-90">Tempo docelowe {block.paceText}</div>}
          </div>
        ) : status === "running" ? (
          <div className="mt-2 rounded-2xl border border-hairline bg-card p-3 text-sm">Plan zrobiony – możesz zakończyć.</div>
        ) : null}

        {weak === "silent" && status === "running" && <p className="mt-3 rounded-xl bg-yellow-soft p-3 text-sm text-yellow-ink" role="status">Brak sygnału GPS od kilku sekund. Dystans z tej przerwy nie jest liczony. Wyjdź na otwartą przestrzeń i nie zgaszaj ekranu.</p>}
        {weak === "inaccurate" && status === "running" && <p className="mt-3 rounded-xl bg-yellow-soft p-3 text-sm text-yellow-ink" role="status">Słaby sygnał GPS: pomiar może być niedokładny.</p>}

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

        {status === "done" && <RunSummary track={track} elapsedMs={elapsed} timeline={timeline} />}
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
        {status === "ready" && <button onClick={start} className="flex-1 rounded-2xl bw-grad py-3.5 text-base font-medium">Start</button>}
        {status === "running" && <button onClick={pause} className="flex-1 rounded-2xl border border-hairline bg-card py-3.5 text-base">Pauza</button>}
        {status === "paused" && <button onClick={start} className="flex-1 rounded-2xl bw-grad py-3.5 text-base font-medium">Wznów</button>}
        {(status === "running" || status === "paused") && (
          <button onClick={finish} className="flex-1 rounded-2xl bw-grad py-3.5 text-base font-medium">Zakończ</button>
        )}
        {status === "done" && (
          <button
            onClick={() => {
              saveRun(track, elapsed);
              onFinish({ distanceM: track.distanceM, elapsedMs: elapsed, distanceAt5min: at5 });
            }}
            className="flex-1 rounded-2xl bw-grad py-3.5 text-base font-medium"
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
    const runs = JSON.parse(scoped.getItem("runs") ?? "[]") as unknown[];
    runs.push({
      date: localISO(),
      distanceM: Math.round(track.distanceM),
      elapsedMs: Math.round(elapsedMs),
      splits: kmSplits(track).map((s) => Math.round(s)),
      // co 5. punkt wystarcza do narysowania trasy
      route: track.points.filter((_, i) => i % 5 === 0).map((p) => [Number(p.lat.toFixed(5)), Number(p.lon.toFixed(5))]),
    });
    scoped.setItem("runs", JSON.stringify(runs));
  } catch { /* brak pamięci */ }
}
