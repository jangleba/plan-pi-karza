import { useEffect, useRef, useState } from "react";
import { detectFlight, estimateFps, flightTimeFromFrames, frameMs, heightErrorCm, jumpHeightFromFlightTime, snapFps, splitsFromFrames } from "./engine";
import { footTrack } from "./lib/pose";

type Mode = "cmj" | "sprint";
const FPS_OPTIONS = [30, 60, 120, 240];

export interface VideoResult { flightTime?: number; splits?: number[] }

const STEPS: Record<Mode, string[]> = {
  cmj: ["Odbicie (ostatnia klatka z podłożem)", "Lądowanie (pierwsza klatka z podłożem)"],
  sprint: ["Start (pierwszy ruch)", "10 m", "20 m", "30 m"],
};

export function VideoMeasure({ mode, onResult, onClose, src, srcFps, auto }: {
  mode: Mode; onResult: (r: VideoResult) => void; onClose: () => void;
  /** Nagranie z kamery w aplikacji (pomija wybór pliku). */
  src?: string; srcFps?: number;
  /** CMJ: najpierw automatyczne wykrycie odbicia i lądowania. */
  auto?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(src ?? null);
  const [fps, setFps] = useState(srcFps && srcFps > 0 ? srcFps : 120);
  const [analysis, setAnalysis] = useState<{ progress: number } | { flightS: number; takeoff: number; landing: number; confidence: number } | { failed: string } | null>(
    auto && mode === "cmj" && src ? { progress: 0 } : null,
  );
  const [frame, setFrame] = useState(0);
  // znaczniki w sekundach filmu: zmiana fps nie psuje już zapisanych pozycji
  const [marks, setMarks] = useState<number[]>([]);
  const [note, setNote] = useState("");

  // zwalniamy tylko adresy plików wybranych tutaj; nagranie z kamery należy do rodzica
  useEffect(() => () => { if (url && url !== src) URL.revokeObjectURL(url); }, [url, src]);

  const started = useRef(false);
  useEffect(() => {
    if (!(auto && mode === "cmj" && src) || started.current) return;
    started.current = true;
    let alive = true;
    (async () => {
      try {
        const ys = await footTrack(src, fps, (p) => alive && setAnalysis({ progress: p }));
        const r = detectFlight(ys, fps);
        if (!alive) return;
        if (r) setAnalysis(r);
        else { setAnalysis({ failed: "x" }); setNote("Nie wykryto skoku – zaznacz klatki ręcznie (stopy muszą być w kadrze)."); }
      } catch {
        if (alive) { setAnalysis({ failed: "x" }); setNote("Automatyczna analiza niedostępna – zaznacz klatki ręcznie."); }
      }
    })();
    return () => { alive = false; started.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seekFrame = (n: number) => {
    const v = ref.current;
    if (!v) return;
    const f = Math.max(0, n);
    // środek klatki: omija błędy zaokrągleń przy ustawianiu currentTime
    v.currentTime = (f + 0.5) / fps;
    setFrame(f);
  };

  const sync = () => {
    const v = ref.current;
    if (v) setFrame(Math.floor(v.currentTime * fps));
  };

  const detectFps = () => {
    const v = ref.current as (HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number }) | null;
    if (!v || !v.requestVideoFrameCallback) { setNote("Ta przeglądarka nie podaje klatek – wybierz fps ręcznie."); return; }
    const times: number[] = [];
    const cb = (_n: number, meta: { mediaTime: number }) => {
      times.push(meta.mediaTime);
      if (times.length < 14) v.requestVideoFrameCallback!(cb);
      else {
        v.pause();
        v.playbackRate = 1;
        const est = estimateFps(times);
        if (est) { const s = snapFps(est); changeFps(s); setNote(`Wykryto ok. ${s} klatek/s.`); }
        else setNote("Nie udało się wykryć – wybierz fps ręcznie.");
      }
    };
    // wolne odtwarzanie: ekran 60 Hz pokaże wtedy każdą klatkę, a nie co drugą lub czwartą
    v.currentTime = 0;
    v.playbackRate = 0.1;
    v.requestVideoFrameCallback(cb);
    void v.play();
  };

  const changeFps = (f: number) => {
    const v = ref.current;
    setFps(f);
    if (v) setFrame(Math.floor(v.currentTime * f));
  };

  const mark = () => {
    const v = ref.current;
    if (!v) return;
    const next = [...marks, v.currentTime];
    const frames = next.map((t) => Math.floor(t * fps));
    setMarks(next);
    setNote("");
    if (next.length === STEPS[mode].length) {
      try {
        if (mode === "cmj") onResult({ flightTime: flightTimeFromFrames(frames[0]!, frames[1]!, fps) });
        else onResult({ splits: splitsFromFrames(frames[0]!, frames.slice(1), fps) });
        onClose();
      } catch (e) {
        setNote(e instanceof Error ? e.message : "Błąd pomiaru");
        setMarks([]);
      }
    }
  };

  const btn = "flex-1 rounded-xl bg-canvas py-2 text-sm";
  if (analysis && !("failed" in analysis)) {
    const pending = "progress" in analysis;
    return (
      <div className="bw-sheet fixed inset-0 z-30 flex flex-col bg-card p-6 pb-10">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Analiza skoku</h2>
          <button onClick={onClose} className="text-sm text-muted">Zamknij</button>
        </div>
        {pending ? (
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="mb-3 h-1.5 w-48 overflow-hidden rounded-full bg-hairline">
              <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(analysis.progress * 100)}%` }} />
            </div>
            <p className="text-sm text-muted">Szukam odbicia i lądowania…</p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="text-6xl font-semibold tabular-nums tracking-tight">{jumpHeightFromFlightTime(analysis.flightS).toFixed(1).replace(".", ",")}</span>
            <span className="mt-1 text-sm text-muted">cm · czas lotu {(analysis.flightS * 1000).toFixed(0)} ms</span>
            <span className="mt-2 rounded-full bg-canvas px-3 py-1 text-xs font-medium text-ink">Oszacowanie z nagrania, nie walidowany pomiar</span>
            <span className="mt-3 text-xs text-muted">
              Dokładność ok. ±{heightErrorCm(analysis.flightS, fps).toFixed(1).replace(".", ",")} cm na klatkę ({fps} kl./s)
              {analysis.confidence < 0.7 ? " · niska pewność – sprawdź ręcznie" : ""}
            </span>
            <span className="mt-2 max-w-xs text-[11px] leading-snug text-muted">Automatyczne wykrycie bywa błędne – jeśli zaznaczone klatki się nie zgadzają, wybierz „Popraw ręcznie”.</span>
          </div>
        )}
        {!pending && (
          <div className="flex flex-col gap-2">
            <button onClick={() => { onResult({ flightTime: analysis.flightS }); onClose(); }} className="w-full rounded-2xl bw-grad py-4 text-base font-medium">Zatwierdź</button>
            <button onClick={() => { setAnalysis(null); setMarks([]); setTimeout(() => seekFrame(Math.max(0, analysis.takeoff - 3)), 50); }}
              className="w-full rounded-2xl border border-hairline bg-canvas py-3.5 text-sm">Popraw ręcznie</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bw-sheet fixed inset-0 z-30 flex flex-col bg-card p-4 pb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pomiar z wideo</h2>
        <button onClick={onClose} className="text-sm text-muted">Zamknij</button>
      </div>
      {!url ? (
        <label className="flex flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl bg-canvas p-6 text-center text-sm text-muted">
          Nagraj lub wybierz film (zwolnione tempo 120–240 klatek/s)
          <input type="file" accept="video/*" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { setUrl(URL.createObjectURL(f)); setMarks([]); }
          }} />
        </label>
      ) : (
        <>
          <video ref={ref} src={url} playsInline muted onTimeUpdate={sync} onLoadedMetadata={() => seekFrame(0)} className="max-h-[40vh] w-full rounded-2xl bg-black" />
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-muted">Klatki/s</span>
            {FPS_OPTIONS.map((f) => (
              <button key={f} onClick={() => changeFps(f)} className={`rounded-lg px-2.5 py-1 ${fps === f ? "bw-sel" : "bg-canvas"}`}>{f}</button>
            ))}
            <button onClick={detectFps} className="ml-auto text-xs text-muted underline">Wykryj</button>
          </div>
          <p className="mt-1 text-xs text-muted">Klatka {frame} · jedna klatka ≈ {frameMs(fps).toFixed(1)} ms{note ? ` · ${note}` : ""}</p>
          <div className="mt-3 flex gap-2">
            <button className={btn} onClick={() => seekFrame(frame - 10)}>−10</button>
            <button className={btn} onClick={() => seekFrame(frame - 1)}>−1</button>
            <button className={btn} onClick={() => seekFrame(frame + 1)}>+1</button>
            <button className={btn} onClick={() => seekFrame(frame + 10)}>+10</button>
          </div>
          <div className="mt-4 rounded-2xl bg-canvas p-3 text-sm">
            <div className="text-xs text-muted">Zaznacz klatkę ({marks.length + 1}/{STEPS[mode].length})</div>
            <div className="font-medium">{STEPS[mode][marks.length]}</div>
            {marks.length > 0 && <div className="mt-1 text-xs text-muted">Zaznaczone klatki: {marks.map((t) => Math.floor(t * fps)).join(", ")}</div>}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={mark} className="flex-1 rounded-xl bw-grad py-3 text-sm font-medium">Zaznacz tę klatkę</button>
            {marks.length > 0 && <button onClick={() => setMarks(marks.slice(0, -1))} className="rounded-xl bg-canvas px-4 text-sm">Cofnij</button>}
          </div>
        </>
      )}
    </div>
  );
}
