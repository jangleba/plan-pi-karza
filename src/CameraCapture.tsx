import { useEffect, useRef, useState } from "react";

/**
 * Nagrywanie testu: kamera tylna, wymagana orientacja, odliczanie 5 s, zapis.
 * W przeglądarce iPhone daje zwykle do 60 klatek/s; 240 klatek/s wymaga wersji iOS.
 */
export interface Recording { url: string; fps: number }

export function CameraCapture({ orientation, autoStopS, guide, onDone, onClose }: {
  orientation: "portrait" | "landscape";
  /** Automatyczne zakończenie po N s od startu nagrania (np. CMJ). */
  autoStopS?: number;
  /** Wskazówka ustawienia kadru widoczna przed startem. */
  guide?: string;
  onDone: (r: Recording) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [error, setError] = useState("");
  const [fps, setFps] = useState(0);
  const [count, setCount] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [landscape, setLandscape] = useState(false);

  useEffect(() => {
    const check = () => setLandscape(window.innerWidth > window.innerHeight);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: "environment", frameRate: { ideal: 60, max: 240 }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        setFps(Math.round(s.getVideoTracks()[0]?.getSettings().frameRate ?? 30));
        if (video.current) { video.current.srcObject = s; await video.current.play(); }
      } catch {
        setError("Brak dostępu do kamery. Zezwól na kamerę w ustawieniach przeglądarki.");
      }
    })();
    return () => { alive = false; stream.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const okOrientation = orientation === "landscape" ? landscape : !landscape;

  const stop = () => { rec.current?.state === "recording" && rec.current.stop(); setRecording(false); };

  const start = () => {
    if (!stream.current) return;
    setCount(5);
    let n = 5;
    const id = setInterval(() => {
      n -= 1;
      if (n > 0) { setCount(n); return; }
      clearInterval(id);
      setCount(null);
      const type = ["video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(stream.current!, type ? { mimeType: type } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => {
        const blob = new Blob(chunks.current, { type: r.mimeType });
        stream.current?.getTracks().forEach((t) => t.stop());
        onDone({ url: URL.createObjectURL(blob), fps });
      };
      rec.current = r;
      r.start();
      setRecording(true);
      if (autoStopS) setTimeout(stop, autoStopS * 1000);
    }, 1000);
  };

  return (
    <div className="bw-sheet fixed inset-0 z-40 flex flex-col bg-black text-white">
      <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
      <div className="relative z-10 flex items-center justify-between p-4">
        <span className="rounded-full bg-black/40 px-3 py-1 text-xs">{fps ? `${fps} kl./s` : "…"}</span>
        <button onClick={() => { stop(); onClose(); }} className="rounded-full bg-black/40 px-3 py-1 text-sm">Zamknij</button>
      </div>
      <div className="relative z-10 flex flex-1 items-center justify-center">
        {error ? <p className="mx-6 rounded-2xl bg-black/60 p-4 text-center text-sm">{error}</p>
          : !okOrientation ? <p className="mx-6 rounded-2xl bg-black/60 p-4 text-center text-base">Obróć telefon {orientation === "landscape" ? "poziomo" : "pionowo"}</p>
          : count !== null ? <span className="text-8xl font-semibold tabular-nums drop-shadow">{count}</span>
          : recording ? <span className="flex items-center gap-2 rounded-full bg-black/50 px-4 py-2 text-sm"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />Nagrywanie</span>
          : null}
      </div>
      {guide && okOrientation && !error && !recording && count === null && <p className="relative z-10 mx-6 mb-2 rounded-2xl bg-black/55 p-3 text-center text-xs">{guide}</p>}
      <div className="relative z-10 p-6 pb-10">
        {!recording && count === null && (
          <button disabled={!okOrientation || !!error} onClick={start} className="w-full rounded-2xl bw-grad py-4 text-base font-medium disabled:opacity-40">
            Start (odliczanie 5 s)
          </button>
        )}
        {recording && <button onClick={stop} className="w-full rounded-2xl bg-white py-4 text-base font-medium text-black">Zakończ</button>}
        {fps > 0 && fps < 100 && <p className="mt-3 text-center text-xs text-white/70">Przeglądarka nagrywa {fps} kl./s – wynik będzie mniej dokładny niż przy 240 kl./s w wersji iOS.</p>}
      </div>
    </div>
  );
}
