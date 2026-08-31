import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CircleStop, Loader2, RotateCcw, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

type RecorderMode = "idle" | "starting" | "preview" | "recording" | "processing";

interface VisionRecorderProps {
  minimumFps: number;
  onRecorded: (file: File, detectedFps: number | null) => Promise<void>;
}

function supportedMimeType(): string | undefined {
  const candidates = ["video/mp4;codecs=h264", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function VisionRecorder({ minimumFps, onRecorded }: VisionRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const [mode, setMode] = useState<RecorderMode>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [detectedFps, setDetectedFps] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const closeCamera = useCallback(() => {
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.onstop = null;
      recorder.stop();
    }
    recorderRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [clearTimer]);

  useEffect(() => closeCamera, [closeCamera]);

  async function openCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Ta przeglądarka nie obsługuje nagrywania w aplikacji. Użyj opcji z galerii.");
      return;
    }

    setMode("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 120, max: 240 },
        },
      });
      streamRef.current = stream;
      const fps = stream.getVideoTracks()[0]?.getSettings().frameRate;
      setDetectedFps(typeof fps === "number" ? Math.round(fps) : null);
      setMode("preview");
      requestAnimationFrame(() => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        void videoRef.current.play();
      });
    } catch {
      closeCamera();
      setMode("idle");
      setError("Nie udało się uruchomić kamery. Zezwól BallWise na dostęp do kamery.");
    }
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;

    setError(null);
    chunksRef.current = [];
    const mimeType = supportedMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      clearTimer();
      setMode("processing");
      const type = recorder.mimeType || mimeType || "video/webm";
      const extension = type.includes("mp4") ? "mp4" : "webm";
      const blob = new Blob(chunksRef.current, { type });
      const file = new File([blob], `ballwise-sprint-${Date.now()}.${extension}`, {
        type,
        lastModified: Date.now(),
      });
      closeCamera();
      await onRecorded(file, detectedFps);
      setMode("idle");
      setElapsedSeconds(0);
    };
    recorder.start(250);
    setElapsedSeconds(0);
    setMode("recording");
    timerRef.current = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }

  function cancelPreview() {
    closeCamera();
    setMode("idle");
    setElapsedSeconds(0);
  }

  const lowFps = detectedFps !== null && detectedFps < minimumFps;

  if (mode === "idle" || mode === "starting") {
    return (
      <div className="space-y-2">
        <Button
          className="h-14 w-full rounded-2xl"
          size="lg"
          onClick={openCamera}
          disabled={mode === "starting"}
        >
          {mode === "starting" ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Uruchamianie kamery…
            </>
          ) : (
            <>
              <Camera className="mr-2 h-5 w-5" /> Nagraj test w BallWise
            </>
          )}
        </Button>
        {error && <p className="px-2 text-xs leading-relaxed text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-lg">
      <div className="relative aspect-video w-full bg-black">
        <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-y-0 left-[12%] border-l border-dashed border-white/70" />
          <div className="absolute inset-y-0 right-[12%] border-r border-dashed border-white/70" />
          <div className="absolute inset-x-[12%] top-1/2 border-t border-white/35" />
          <span className="absolute left-[12%] top-3 rounded-full bg-black/55 px-2 py-1 text-[10px] font-semibold">
            START
          </span>
          <span className="absolute right-[12%] top-3 -translate-x-full rounded-full bg-black/55 px-2 py-1 text-[10px] font-semibold">
            META
          </span>
        </div>
        <div className="absolute bottom-3 left-3 flex gap-2 text-[10px] font-semibold">
          <span
            className={`rounded-full px-2 py-1 ${lowFps ? "bg-amber-500/90" : "bg-emerald-500/90"}`}
          >
            {detectedFps ? `${detectedFps} FPS` : "FPS: wykrywanie"}
          </span>
          {mode === "recording" && (
            <span className="rounded-full bg-red-600 px-2 py-1">● {elapsedSeconds}s</span>
          )}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <p className="text-center text-xs text-white/75">
          Całe 20 m, START i META muszą pozostać między prowadnicami. Kamera nieruchoma.
        </p>
        {lowFps && (
          <p className="rounded-xl bg-amber-400/15 px-3 py-2 text-xs text-amber-100">
            Kamera udostępniła {detectedFps} FPS. Wynik zostanie oznaczony jako estymowany.
          </p>
        )}
        {mode === "processing" ? (
          <div className="flex h-11 items-center justify-center text-sm">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Przygotowywanie filmu…
          </div>
        ) : mode === "recording" ? (
          <Button variant="destructive" className="w-full" size="lg" onClick={stopRecording}>
            <CircleStop className="mr-2 h-5 w-5" /> Zatrzymaj nagranie
          </Button>
        ) : (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button className="w-full" size="lg" onClick={startRecording}>
              <Video className="mr-2 h-5 w-5" /> Rozpocznij nagranie
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="h-11 w-11"
              onClick={cancelPreview}
              aria-label="Zamknij kamerę"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
