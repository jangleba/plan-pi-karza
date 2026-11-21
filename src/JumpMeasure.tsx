import { useEffect, useRef, useState } from "react";
import { calibrate, jumpDistanceCm, jumpErrorCm } from "./engine";
import type { Calibration } from "./engine";
import { scoped } from "./lib/store";
import type { VideoResult } from "./VideoMeasure";

const HEIGHT_KEY = "lab:heightCm";
/** Kroki zaznaczania: trzy punkty na klatce ze staniem, czwarty po lądowaniu. */
const STEPS = [
  { id: "head", text: "Stań na klatce sprzed skoku. Dotknij czubka głowy." },
  { id: "floor", text: "Dotknij podłoża pod stopami." },
  { id: "toe", text: "Dotknij czubka palców (linia startu)." },
  { id: "heel", text: "Przewiń do lądowania. Dotknij tyłu pięty bliższej linii." },
] as const;
type Pts = { headY?: number; floorY?: number; toeX?: number; heelX?: number };

/** Pomiar skoku w dal z nagrania: zaznaczasz linie na klatkach, skala liczy się z wzrostu zawodnika. */
export function JumpMeasure({ src, onResult, onClose }: { src?: string; onResult: (r: VideoResult) => void; onClose: () => void }) {
  const vid = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(src ?? null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [dur, setDur] = useState(0);
  const [t, setT] = useState(0);
  const [pts, setPts] = useState<Pts>({});
  const [step, setStep] = useState(0);
  const [height, setHeight] = useState(() => scoped.getItem(HEIGHT_KEY) ?? "");
  const [err, setErr] = useState("");
  const drag = useRef(false);

  useEffect(() => () => { if (url && url !== src) URL.revokeObjectURL(url); }, [url, src]);

  const seek = (s: number) => {
    const v = vid.current;
    if (!v) return;
    const c = Math.min(Math.max(0, s), dur || s);
    v.currentTime = c;
    setT(c);
  };

  const heightCm = Number(height.replace(",", "."));
  let cal: Calibration | null = null;
  let calErr = "";
  if (pts.headY !== undefined && pts.floorY !== undefined) {
    try { cal = calibrate(heightCm, pts.headY, pts.floorY); } catch (e) { calErr = e instanceof Error ? e.message : "Błąd kalibracji"; }
  }
  const dist = cal && pts.toeX !== undefined && pts.heelX !== undefined ? jumpDistanceCm(pts.toeX, pts.heelX, cal) : null;
  const fmt = (n: number) => n.toFixed(0);

  // współrzędne w pikselach filmu z dotknięcia obrazu
  const point = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * dims.w, y: ((e.clientY - r.top) / r.height) * dims.h };
  };
  const place = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = point(e);
    const id = STEPS[step]!.id;
    setErr("");
    setPts((o) => id === "head" ? { ...o, headY: p.y } : id === "floor" ? { ...o, floorY: p.y } : id === "toe" ? { ...o, toeX: p.x } : { ...o, heelX: p.x });
  };

  const done = (id: (typeof STEPS)[number]["id"]) => id === "head" ? pts.headY !== undefined : id === "floor" ? pts.floorY !== undefined : id === "toe" ? pts.toeX !== undefined : pts.heelX !== undefined;
  const cur = STEPS[step]!;
  const canNext = done(cur.id) && (step !== 1 || !calErr) && (step !== 1 || heightCm > 0);

  const next = () => {
    if (step === 1) {
      if (!(heightCm > 0)) { setErr("Wpisz swój wzrost."); return; }
      if (calErr) { setErr(calErr); return; }
      scoped.setItem(HEIGHT_KEY, String(heightCm));
    }
    setErr("");
    setStep(step + 1);
  };
  const back = () => { setErr(""); setStep(Math.max(0, step - 1)); };

  const accept = () => {
    if (dist === null || !cal) return;
    onResult({ distanceCm: Math.round(dist * 10) / 10 });
    onClose();
  };

  const W = dims.w || 1, H = dims.h || 1;
  const line = { stroke: "var(--color-accent)", strokeWidth: 2, vectorEffect: "non-scaling-stroke" as const };
  const err4 = cal && dist !== null ? jumpErrorCm(dist, cal) : null;

  return (
    <div className="bw-sheet fixed inset-0 z-30 flex flex-col overflow-y-auto bg-card p-4 pb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pomiar skoku w dal</h2>
        <button onClick={onClose} className="text-sm text-muted">Zamknij</button>
      </div>
      {!url ? (
        <label className="flex min-h-[40vh] flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl bg-canvas p-6 text-center text-sm text-muted">
          Wybierz film skoku nagrany poziomo, z całą sylwetką i miejscem lądowania w kadrze
          <input type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setUrl(URL.createObjectURL(f)); setPts({}); setStep(0); } }} />
        </label>
      ) : (
        <>
          <div className="relative w-full overflow-hidden rounded-2xl bg-black">
            <video ref={vid} src={url} playsInline muted preload="auto" className="block w-full"
              onLoadedMetadata={(e) => { const v = e.currentTarget; setDims({ w: v.videoWidth, h: v.videoHeight }); setDur(v.duration || 0); v.currentTime = 0; }} />
            {dims.w > 0 && (
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full touch-none" role="img" aria-label="Zaznaczanie punktów na klatce"
                onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); place(e); }}
                onPointerMove={(e) => { if (drag.current) place(e); }}
                onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}>
                {pts.headY !== undefined && <line x1={0} x2={W} y1={pts.headY} y2={pts.headY} {...line} strokeDasharray="6 4" />}
                {pts.floorY !== undefined && <line x1={0} x2={W} y1={pts.floorY} y2={pts.floorY} {...line} strokeDasharray="6 4" />}
                {pts.toeX !== undefined && <line x1={pts.toeX} x2={pts.toeX} y1={0} y2={H} {...line} />}
                {pts.heelX !== undefined && <line x1={pts.heelX} x2={pts.heelX} y1={0} y2={H} {...line} strokeDasharray="2 3" />}
                {pts.toeX !== undefined && pts.heelX !== undefined && (
                  <line x1={pts.toeX} x2={pts.heelX} y1={H * 0.9} y2={H * 0.9} {...line} className="bw-draw" pathLength={100} />
                )}
              </svg>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <button className="rounded-xl bg-canvas px-3 py-2 text-sm text-ink" onClick={() => seek(t - 0.1)} aria-label="Cofnij o 0,1 s">−0,1 s</button>
            <button className="rounded-xl bg-canvas px-3 py-2 text-sm text-ink" onClick={() => seek(t - 0.03)} aria-label="Cofnij o klatkę">−1 kl.</button>
            <button className="rounded-xl bg-canvas px-3 py-2 text-sm text-ink" onClick={() => seek(t + 0.03)} aria-label="Do przodu o klatkę">+1 kl.</button>
            <button className="rounded-xl bg-canvas px-3 py-2 text-sm text-ink" onClick={() => seek(t + 0.1)} aria-label="Do przodu o 0,1 s">+0,1 s</button>
            <span className="ml-auto tabular-nums">{t.toFixed(2).replace(".", ",")} s</span>
          </div>
          <input type="range" min={0} max={dur || 1} step={0.01} value={t} onChange={(e) => seek(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-accent)]" aria-label="Przewijanie nagrania" />

          <div className="mt-3 rounded-2xl bg-canvas p-3 text-sm">
            <div className="text-xs text-muted">Krok {step + 1} z {STEPS.length}</div>
            <div className="font-medium">{cur.text}</div>
            <div className="mt-1 text-xs text-muted">Dotknij obrazu i przesuń palcem, żeby poprawić linię.</div>
          </div>

          {step === 1 && (
            <label className="mt-3 block text-sm">
              <span className="text-xs text-muted">Twój wzrost, bez obuwia (cm)</span>
              <input className="mt-1 w-full rounded-2xl border border-hairline bg-canvas px-4 py-3 text-base outline-none focus:border-accent" inputMode="decimal" placeholder="np. 178" value={height} onChange={(e) => setHeight(e.target.value)} />
              <span className="mt-1 block text-[11px] text-muted">Z niego liczy się skala, więc odległość telefonu od Ciebie nie wpływa na wynik.</span>
            </label>
          )}

          {step === 3 && (
            <div className="mt-3 text-center">
              {dist !== null ? (
                <>
                  <span key={Math.round(dist)} className="bw-pop inline-block text-5xl font-semibold tabular-nums">≈ {fmt(dist)}</span>
                  <span className="ml-1 text-sm text-muted">cm</span>
                  {err4 !== null && <p className="mt-1 text-xs text-muted">Dokładność ok. ±{fmt(err4)} cm · oszacowanie z nagrania, nie walidowany pomiar</p>}
                </>
              ) : <p className="text-sm text-muted">Dotknij obrazu na klatce po lądowaniu, żeby zaznaczyć piętę.</p>}
            </div>
          )}

          {err && <p key={err} className="bw-shake mt-3 text-center text-sm text-red-ink" role="alert">{err}</p>}

          <div className="mt-4 flex gap-2">
            {step > 0 && <button onClick={back} className="rounded-2xl bg-canvas px-5 py-3.5 text-sm">Wstecz</button>}
            {step < 3
              ? <button onClick={next} disabled={!canNext} className={`flex-1 rounded-2xl py-3.5 text-base font-medium transition ${canNext ? "bw-grad" : "bg-hairline text-muted"}`}>Dalej</button>
              : <button onClick={accept} disabled={dist === null} className={`flex-1 rounded-2xl py-3.5 text-base font-medium transition ${dist !== null ? "bw-grad" : "bg-hairline text-muted"}`}>Użyj wyniku</button>}
          </div>
        </>
      )}
    </div>
  );
}
