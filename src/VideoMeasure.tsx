import { useEffect, useRef, useState } from "react";
import { estimateFps, flightTimeFromFrames, frameMs, snapFps, splitsFromFrames } from "./engine";

type Mode = "cmj" | "sprint";
const FPS_OPTIONS = [30, 60, 120, 240];

export interface VideoResult { flightTime?: number; splits?: number[] }

const STEPS: Record<Mode, string[]> = {
  cmj: ["Odbicie (ostatnia klatka z podłożem)", "Lądowanie (pierwsza klatka z podłożem)"],
  sprint: ["Start (pierwszy ruch)", "10 m", "20 m", "30 m"],
};

export function VideoMeasure({ mode, onResult, onClose }: { mode: Mode; onResult: (r: VideoResult) => void; onClose: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [fps, setFps] = useState(120);
  const [frame, setFrame] = useState(0);
  const [marks, setMarks] = useState<number[]>([]);
  const [note, setNote] = useState("");

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

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
        if (est) { const s = snapFps(est); setFps(s); setNote(`Wykryto ok. ${s} klatek/s.`); }
        else setNote("Nie udało się wykryć – wybierz fps ręcznie.");
      }
    };
    // wolne odtwarzanie: ekran 60 Hz pokaże wtedy każdą klatkę, a nie co drugą lub czwartą
    v.currentTime = 0;
    v.playbackRate = 0.1;
    v.requestVideoFrameCallback(cb);
    void v.play();
  };

  const mark = () => {
    const next = [...marks, frame];
    setMarks(next);
    setNote("");
    if (next.length === STEPS[mode].length) {
      try {
        if (mode === "cmj") onResult({ flightTime: flightTimeFromFrames(next[0]!, next[1]!, fps) });
        else onResult({ splits: splitsFromFrames(next[0]!, next.slice(1), fps) });
        onClose();
      } catch (e) {
        setNote(e instanceof Error ? e.message : "Błąd pomiaru");
        setMarks([]);
      }
    }
  };

  const btn = "flex-1 rounded-xl bg-canvas py-2 text-sm";
  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-card p-4 pb-8">
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
              <button key={f} onClick={() => setFps(f)} className={`rounded-lg px-2.5 py-1 ${fps === f ? "bg-ink text-white" : "bg-canvas"}`}>{f}</button>
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
            {marks.length > 0 && <div className="mt-1 text-xs text-muted">Zaznaczone: {marks.join(", ")}</div>}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={mark} className="flex-1 rounded-xl bg-ink py-3 text-sm font-medium text-white">Zaznacz tę klatkę</button>
            {marks.length > 0 && <button onClick={() => setMarks(marks.slice(0, -1))} className="rounded-xl bg-canvas px-4 text-sm">Cofnij</button>}
          </div>
        </>
      )}
    </div>
  );
}
