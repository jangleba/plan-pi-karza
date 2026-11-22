import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { averagePace, currentPace, distanceAt, formatPace, kmSplits, paceSeries, phaseAt, phaseResults } from "./engine";
import type { RunSession, TrackState } from "./engine";
import { compactRoute, headingOf, type RoutePoint } from "./engine/routeMap";
import { GPS_LABEL } from "./engine/gps";
import { buildPhases, durationText, paceTargetRange, runScreen, type BlockPhase } from "./engine/runView";
import { localISO } from "./engine";
import { HAS_MAP, RunMap, type MapPosition, type TileState } from "./RunMap";
import { loadRuns, saveRuns } from "./lib/runs";
import { scoped } from "./lib/store";
import { beep, buzz, prepareAudio } from "./tools/feedback";
import * as rec from "./run/recorder";

export interface RunResult { distanceM: number; elapsedMs: number; distanceAt5min: number | null }

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const paceText = (p: number | null) => (p ? formatPace(p).replace("/km", "") : "—:—");
const kmText = (m: number) => (m / 1000).toFixed(2).replace(".", ",");

const Icon = ({ d, size = 24 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const IconBtn = ({ label, onClick, children, pressed }: { label: string; onClick: () => void; children: React.ReactNode; pressed?: boolean }) => (
  <button onClick={onClick} aria-label={label} aria-pressed={pressed} className="flex h-11 w-11 items-center justify-center rounded-full text-ink active:bg-hairline">{children}</button>
);
const MapBtn = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} aria-label={label} className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink shadow-[0_1px_6px_rgba(0,0,0,.18)] active:scale-95">{children}</button>
);

/** Podsumowanie po biegu: wykres tempa w czasie i porównanie powtórzeń (tylko z tego, co zmierzył GPS). */
function RunSummary({ track, elapsedMs, phases }: { track: TrackState; elapsedMs: number; phases: BlockPhase[] }) {
  const series = useMemo(() => paceSeries(track, elapsedMs), [track, elapsedMs]);
  const reps = useMemo(() => (phases.length > 1 ? phaseResults(phases, track, elapsedMs).filter((r) => r.paceSPerKm !== null) : []), [phases, track, elapsedMs]);
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
          <div className="mt-1 flex justify-between text-[12px] text-muted tabular-nums"><span>start</span><span>najszybciej {paceText(lo)} · najwolniej {paceText(hi)}</span><span>{mmss(elapsedMs)}</span></div>
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

/** Zapis zakończonego biegu; zwraca błąd zamiast go połykać, a zapis potwierdza odczytem. */
function saveRun(track: TrackState, elapsedMs: number): string | null {
  try {
    const before = loadRuns();
    const run = {
      date: localISO(),
      distanceM: Math.round(track.distanceM),
      elapsedMs: Math.round(elapsedMs),
      splits: kmSplits(track).map((s) => Math.round(s)),
      route: track.points.length ? compactRoute(track.points).map(([lat, lon, t, s]) => ({ lat: lat!, lon: lon!, t: t!, ...(s !== undefined ? { s } : {}) })) : [],
    };
    saveRuns([...before, run]);
    const after = loadRuns();
    return after.length === before.length + 1 ? null : "Nie udało się zapisać biegu na urządzeniu (brak miejsca lub pamięć zablokowana). Bieg nadal jest w aplikacji – spróbuj ponownie.";
  } catch { return "Nie udało się zapisać biegu. Spróbuj ponownie."; }
}

export function RunTracker({ session, onClose, onFinish }: {
  session: RunSession;
  onClose: () => void;
  onFinish: (r: RunResult) => void;
}) {
  const phases = useMemo(() => buildPhases(session), [session]);
  const snap = useSyncExternalStore(rec.subscribe, rec.getSnapshot);
  const [, setTick] = useState(0);
  const [sound, setSound] = useState(() => scoped.getItem("runSound") !== "0");
  const [expanded, setExpanded] = useState(false);
  const [following, setFollowing] = useState(true);
  const [recenterKey, setRecenterKey] = useState(0);
  const [tiles, setTiles] = useState<TileState>("loading");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saveError, setSaveError] = useState("");
  const saving = useRef(false);
  const lastIdx = useRef(-1);
  const lastBeepS = useRef(-1);
  const [flash, setFlash] = useState<{ kind: "work" | "rest"; n: number } | null>(null);

  // wejście na ekran: odtwórz przerwaną sesję albo przygotuj GPS do startu
  useEffect(() => {
    if (rec.getSnapshot().status === "idle") { if (!rec.restore()) rec.prepare(session.title); }
    return () => { if (rec.getSnapshot().status === "ready") rec.cancelPrepare(); };
  }, [session.title]);

  const st = snap.status;
  useEffect(() => {
    if (st === "idle" || st === "done") return;
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [st]);

  const at = Date.now();
  const elapsed = st === "ready" || st === "idle" ? 0 : rec.elapsedMs(snap, at);
  const gps = rec.gpsOf(snap, at);
  const scr = runScreen(phases, elapsed / 1000);
  const interval = phases.length > 1;
  const block = session.blocks[scr.blockIndex] ?? session.blocks[0];
  const track = snap.track;
  const mapPoints = useMemo<RoutePoint[]>(() => track.points.map((p) => ({ lat: p.lat, lon: p.lon, t: p.t / 1000, s: p.seg ?? 0 })), [track.points]);
  const live = st === "running" || st === "paused" || st === "ready";

  // dźwięk i błysk przy zmianie fazy oraz 3-2-1 – działają tylko przy włączonym ekranie (w tle potrzebna warstwa natywna)
  const idx = phaseAt(phases, elapsed / 1000)?.index ?? phases.length;
  useEffect(() => {
    if (st !== "running" || idx === lastIdx.current) return;
    if (lastIdx.current !== -1 || idx === 0) {
      const end = idx >= phases.length, kind = end ? "work" : phases[idx]!.kind === "rest" ? "rest" : "work";
      if (sound) {
        if (end) { beep(1046, 160); setTimeout(() => beep(1046, 160), 220); setTimeout(() => beep(1318, 320), 440); }
        else if (kind === "rest") beep(523, 220); else { beep(1046, 120); setTimeout(() => beep(1046, 120), 170); }
      }
      buzz(end ? 300 : 250);
      if (interval) setFlash({ kind, n: idx + 1 });
    }
    lastIdx.current = idx; lastBeepS.current = -1;
  }, [idx, st, phases, sound, interval]);
  const leftS = Math.ceil(scr.left);
  useEffect(() => {
    if (st !== "running" || !interval || scr.kind === "complete" || leftS > 3 || leftS === lastBeepS.current) return;
    lastBeepS.current = leftS;
    if (sound) beep(660, 70);
  }, [leftS, st, interval, scr.kind, sound]);

  const toggleSound = () => { const next = !sound; setSound(next); scoped.setItem("runSound", next ? "1" : "0"); if (next) { prepareAudio(); beep(880, 80); } };
  const start = () => { prepareAudio(); lastIdx.current = -1; rec.start(session.title); };

  const fix = snap.fix;
  const position: MapPosition | null = useMemo(() => {
    if (!fix) return null;
    const lastSeg = track.points.length ? track.points[track.points.length - 1]!.seg ?? 0 : 0;
    const segPts = mapPoints.filter((p) => (p.s ?? 0) === lastSeg);
    const reliable = fix.heading !== null && Number.isFinite(fix.heading) && (fix.speed ?? 0) >= 1 ? fix.heading : fix.speed === null ? headingOf(segPts) : null;
    return { lat: fix.lat, lon: fix.lon, acc: fix.acc, heading: reliable, stale: gps === "stale" };
  }, [fix, gps, mapPoints, track.points]);

  const paceNow = st === "running" && gps === "active" ? currentPace(track, elapsed) : null;
  const at5 = elapsed >= 300_000 ? distanceAt(track, 300_000) : null;
  const finalMs = snap.finalMs ?? elapsed;

  const leave = () => {
    if (st === "done") { setConfirmDiscard(true); return; }
    if (st === "ready") rec.cancelPrepare();
    onClose(); // bieg w toku (także po pauzie) zostaje w rejestratorze – ekran tylko się chowa
  };
  const save = () => {
    if (saving.current) return;
    saving.current = true;
    const err = saveRun(track, finalMs);
    if (err) { setSaveError(err); saving.current = false; return; }
    const res = { distanceM: track.distanceM, elapsedMs: finalMs, distanceAt5min: distanceAt(track, 300_000) > 0 && finalMs >= 300_000 ? distanceAt(track, 300_000) : null };
    rec.reset();
    onFinish(res);
  };

  const title = session.isTest ? "Test MAS" : session.title;
  const planS = phases.reduce((a, p) => a + p.seconds, 0);
  const accent = scr.kind === "rest";

  const gpsChip = (
    <span className="pointer-events-none flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[14px] font-medium text-ink shadow-[0_1px_6px_rgba(0,0,0,.12)]" role="status">
      {gps === "active"
        ? <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 11 21 3l-8 18-2-7z" fill="#22a45d" /></svg>
        : <span className="h-2.5 w-2.5 rounded-full bg-[#e0a21b]" aria-hidden="true" />}
      {GPS_LABEL[gps]}
    </span>
  );

  const mapBox = (
    <div className={expanded ? "fixed inset-0 z-[60] bg-canvas" : "relative mx-[18px] overflow-hidden rounded-3xl bg-hairline/40"} style={expanded ? undefined : { height: "clamp(190px, 32dvh, 275px)" }}>
      <RunMap points={mapPoints} live={live} mode={live ? "live" : "summary"} position={live ? position : null} following={following} recenterKey={recenterKey} recording={(st === "running" || st === "paused") && gps !== "denied" && gps !== "unavailable"} noLocation={gps === "denied" || gps === "unavailable"} bottomInset={expanded ? 104 : 0} onUserMove={() => setFollowing(false)} onTiles={setTiles} />
      {live && <div className="pointer-events-none absolute left-3 top-3 z-[500]" style={expanded ? { top: "max(12px, env(safe-area-inset-top))" } : undefined}>{gpsChip}</div>}
      <div className="pointer-events-none absolute bottom-3 right-3 z-[500] flex flex-col gap-2" style={expanded ? { bottom: "calc(110px + env(safe-area-inset-bottom))" } : undefined}>
        <MapBtn label={expanded ? "Zmniejsz mapę" : "Powiększ mapę"} onClick={() => setExpanded((e) => !e)}>
          <Icon d={expanded ? "M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" : "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"} size={20} />
        </MapBtn>
        {live && (
          <MapBtn label={following ? "Mapa podąża za Tobą" : "Wyśrodkuj na mojej pozycji"} onClick={() => { setFollowing(true); setRecenterKey((k) => k + 1); }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={following ? "#2f6fb3" : "currentColor"} strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.2" fill={following ? "#2f6fb3" : "currentColor"} /><path d="M12 1v4M12 19v4M1 12h4M19 12h4" /></svg>
          </MapBtn>
        )}
      </div>
      {!HAS_MAP && !expanded && null}
    </div>
  );

  const controls = (
    <div className="flex gap-3">
      {st === "ready" && <button onClick={start} className="bw-grad flex h-[60px] flex-1 items-center justify-center gap-3 rounded-[22px] text-[20px] font-semibold active:scale-[0.99]">Start</button>}
      {st === "running" && (
        <button onClick={rec.pause} className="bw-grad flex h-[60px] flex-1 items-center justify-center gap-3 rounded-[22px] text-[20px] font-semibold active:scale-[0.99]">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="5" y="4" width="4.5" height="16" rx="1.2" fill="currentColor" /><rect x="14.5" y="4" width="4.5" height="16" rx="1.2" fill="currentColor" /></svg>Pauza
        </button>
      )}
      {st === "paused" && (
        <>
          <button onClick={rec.resume} className="bw-grad flex h-[60px] flex-[1.4] items-center justify-center rounded-[22px] text-[20px] font-semibold active:scale-[0.99]">Wznów</button>
          <button onClick={() => { void rec.finish(); }} className="flex h-[60px] flex-1 items-center justify-center rounded-[22px] border border-hairline bg-card text-[18px] font-medium text-ink active:scale-[0.99]">Zakończ</button>
        </>
      )}
      {st === "done" && (
        <>
          <button onClick={save} className="bw-grad flex h-[60px] flex-[1.6] items-center justify-center rounded-[22px] text-[19px] font-semibold active:scale-[0.99]">{session.isTest && at5 ? "Zapisz MAS i bieg" : "Zapisz bieg"}</button>
          <button onClick={() => setConfirmDiscard(true)} className="flex h-[60px] flex-1 items-center justify-center rounded-[22px] border border-hairline bg-card text-[17px] text-muted active:scale-[0.99]">Odrzuć</button>
        </>
      )}
    </div>
  );

  const statsRow = (dist: string, pace: string) => (
    <div className="grid grid-cols-[1fr_1px_1fr] items-center border-t border-hairline pt-4">
      <div className="text-center"><div className="text-[clamp(32px,10vw,40px)] font-bold leading-none tabular-nums">{dist}</div><div className="mt-1.5 text-[15px] text-muted">Dystans · km</div></div>
      <div className="h-12 bg-hairline" aria-hidden="true" />
      <div className="text-center"><div className="text-[clamp(32px,10vw,40px)] font-bold leading-none tabular-nums">{pace}</div><div className="mt-1.5 text-[15px] text-muted">Tempo · min/km</div></div>
    </div>
  );

  const splits = st === "done" ? kmSplits(track) : [];

  return (
    <div className="bw-sheet fixed inset-0 z-40 flex flex-col bg-canvas" style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top)" }}>
      {flash && <div key={flash.n} className={`bw-flash pointer-events-none fixed inset-0 z-[600] ${flash.kind === "rest" ? "bg-club" : "bg-accent"}`} aria-hidden="true" />}

      <header className="grid h-14 shrink-0 grid-cols-[44px_1fr_44px] items-center px-3">
        <IconBtn label={st === "running" || st === "paused" ? "Minimalizuj bieg (trening trwa dalej)" : "Wróć"} onClick={leave}><Icon d="M15 5l-7 7 7 7" /></IconBtn>
        <h1 className="truncate text-center text-[20px] font-bold">{title}</h1>
        <IconBtn label={sound ? "Wyłącz komunikaty dźwiękowe" : "Włącz komunikaty dźwiękowe"} pressed={sound} onClick={toggleSound}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9z" />{sound ? <><path d="M16.5 8.5a5 5 0 0 1 0 7" /><path d="M19 6a8.5 8.5 0 0 1 0 12" /></> : <path d="M17 9l5 6M22 9l-5 6" />}
          </svg>
        </IconBtn>
      </header>

      {mapBox}

      <main className="min-h-0 flex-1 overflow-y-auto px-[22px] pb-3 pt-4">
        {st === "done" ? (
          <div className="text-center">
            <div className="text-[17px] text-muted">{session.isTest ? "Test zakończony" : "Bieg zakończony"}</div>
            <div className="mt-1 text-[clamp(52px,17vw,72px)] font-extrabold leading-none tracking-tight tabular-nums">{mmss(finalMs)}</div>
            <div className="mb-5 mt-2 text-[15px] text-muted">Czas biegu</div>
            {statsRow(kmText(track.distanceM), paceText(averagePace(track.distanceM, finalMs)))}
            <div className="text-left">
              {session.isTest && <div className="mt-4 rounded-2xl border border-hairline bg-card p-3 text-[15px]">{at5 ? `Dystans po 5 minutach: ${Math.round(at5)} m.` : "Test trwał krócej niż 5 minut – wynik nie jest ważny."}</div>}
              <RunSummary track={track} elapsedMs={finalMs} phases={phases} />
              {splits.length > 0 && (
                <details className="mt-4 rounded-2xl border border-hairline bg-card p-3 text-[15px]">
                  <summary className="cursor-pointer text-[14px] text-muted">Odcinki km</summary>
                  {splits.map((s, i) => <div key={i} className="flex justify-between py-0.5 tabular-nums"><span>{i + 1} km</span><span>{formatPace(s)}</span></div>)}
                </details>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center">
            {st === "paused" && (
              <p className="mb-3 rounded-2xl bg-accent-soft px-4 py-3 text-left text-[15px] text-ink" role="status">
                {snap.interruptedAt ? `Bieg został przerwany o ${new Date(snap.interruptedAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}. Od tej chwili nie ma zapisu trasy ani czasu. Wznów, żeby kontynuować w nowym odcinku, albo zakończ.` : "Pauza – czas i dystans są zatrzymane. Trasa po wznowieniu zaczyna nowy odcinek."}
              </p>
            )}
            {interval && (
              <div className="mb-2 flex justify-center">
                <span className={`rounded-full px-4 py-1.5 text-[16px] font-medium ${accent ? "bg-club-soft text-club" : "bg-accent-soft text-accent"}`}>
                  {accent ? "Przerwa · trucht" : `Odcinek ${scr.workNo} z ${scr.workTotal}`}
                </span>
              </div>
            )}
            <div className="text-[19px] text-muted">
              {st === "ready" ? (interval ? "Pierwszy odcinek" : "Plan") : scr.kind === "complete" ? "Plan ukończony" : interval ? (accent ? "Do końca przerwy" : "Do końca odcinka") : "Do końca"}
            </div>
            <div className={`font-extrabold leading-[1.02] tracking-tight tabular-nums ${scr.kind === "complete" ? "text-muted" : ""}`} style={{ fontSize: "clamp(56px, 19vw, 76px)" }} aria-live="off">
              {st === "ready" ? mmss(scr.total * 1000) : mmss(Math.ceil(scr.left) * 1000)}
            </div>
            {interval ? (
              <>
                <div className="mx-auto mt-3 h-2 w-full overflow-hidden rounded-full bg-hairline" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(scr.total ? (1 - scr.left / scr.total) * 100 : 0)}>
                  <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${st === "ready" ? 0 : Math.max(0, Math.min(100, scr.total ? (1 - scr.left / scr.total) * 100 : 100))}%` }} />
                </div>
                {!accent && block && !session.isTest && (
                  <div className="mt-4"><div className="text-[16px] text-muted">Tempo docelowe</div><div className="text-[clamp(24px,7.5vw,30px)] font-bold tabular-nums">{paceTargetRange(block.paceText) ?? block.paceText}</div></div>
                )}
                {accent && <div className="mt-4 text-[16px] text-muted">Trucht – oddychaj spokojnie</div>}
              </>
            ) : st !== "ready" ? <div className="mt-1 text-[17px] text-muted">Plan: {durationText(planS)}</div> : <div className="mt-1 text-[17px] text-muted">{durationText(planS)} spokojnego biegu</div>}
            <div className="my-4" />
            {statsRow(kmText(track.distanceM), paceText(paceNow))}
            {interval && scr.next && st !== "ready" && <div className="mt-4 text-[16px] text-muted">Następnie: {scr.next}</div>}
            {interval && st === "ready" && scr.next && <div className="mt-4 text-[16px] text-muted">Następnie: {scr.next}</div>}
            {!interval && st !== "ready" && <div className="mt-4 text-[15px] text-muted">Czas biegu {mmss(elapsed)}</div>}
            {(gps === "denied" || gps === "unavailable") && <p className="mt-4 rounded-2xl border border-hairline bg-card px-4 py-3 text-left text-[15px] text-ink" role="alert">{gps === "denied" ? "Brak zgody na lokalizację. Włącz ją w ustawieniach przeglądarki, żeby mierzyć dystans i trasę." : "Ta przeglądarka nie udostępnia GPS albo nie ma sygnału. Czas jest odliczany, dystansu nie zmierzymy."}</p>}
            {st === "running" && gps === "stale" && <p className="mt-4 rounded-2xl bg-yellow-soft px-4 py-3 text-left text-[15px] text-yellow-ink" role="status">Brak aktualizacji GPS. Dystans z tej przerwy nie jest liczony – ostatnia pozycja jest nieaktualna. Wyjdź na otwartą przestrzeń i nie gaś ekranu.</p>}
            {st === "running" && gps === "weak" && <p className="mt-4 rounded-2xl bg-yellow-soft px-4 py-3 text-left text-[15px] text-yellow-ink" role="status">Słaby sygnał GPS: pomiar może być niedokładny.</p>}
            {st === "ready" && <p className="mt-4 text-[13px] text-muted">Rozgrzej się przed startem. W przeglądarce GPS działa tylko z włączonym ekranem.</p>}
            {st === "running" && tiles === "error" && null}
          </div>
        )}
        {saveError && <p className="mt-3 rounded-2xl border border-hairline bg-card p-3 text-[15px] text-red-ink" role="alert">{saveError}</p>}
      </main>

      <div className="shrink-0 px-[18px] pt-2" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>{controls}</div>
      {expanded && <div className="fixed inset-x-0 bottom-0 z-[70] px-[18px] pt-2" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>{controls}</div>}

      {confirmDiscard && (
        <div className="fixed inset-0 z-[700] flex items-end bg-black/35 p-4 sm:items-center sm:justify-center" role="alertdialog" aria-modal="true" aria-label="Odrzucić bieg?">
          <div className="w-full max-w-sm rounded-3xl bg-card p-5 shadow-xl">
            <p className="text-[18px] font-semibold">Odrzucić ten bieg?</p>
            <p className="mt-2 text-[15px] text-muted">Trasa i czas nie zostaną zapisane. Tego nie da się cofnąć.</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setConfirmDiscard(false)} className="bw-grad h-12 flex-1 rounded-2xl text-[16px] font-medium">Wróć do biegu</button>
              <button onClick={() => { setConfirmDiscard(false); rec.reset(); onClose(); }} className="h-12 flex-1 rounded-2xl border border-hairline text-[16px] text-red-ink">Odrzuć</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
