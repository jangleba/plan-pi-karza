import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  CircleStop,
  Loader2,
  RotateCcw,
  ScanLine,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VisionLivePoseOverlay } from "./VisionLivePoseOverlay";
import { EMPTY_LIVE_POSE_STATUS, type LivePoseStatus } from "./visionLivePose";
import { closePoseEngine } from "@/features/vision-analysis/poseEngine";

type RecorderMode = "idle" | "starting" | "preview" | "recording" | "processing";

interface VisionRecorderProps {
  minimumFps: number;
  onRecorded: (file: File, detectedFps: number | null) => Promise<void>;
}

const AUTO_RECORDING_SECONDS = 12;

function supportedMimeType(): string | undefined {
  const candidates = ["video/mp4;codecs=h264", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function speak(message: string): void {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = "pl-PL";
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

export function VisionRecorder({ minimumFps, onRecorded }: VisionRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const stablePoseRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const [mode, setMode] = useState<RecorderMode>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [detectedFps, setDetectedFps] = useState<number | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [poseStatus, setPoseStatus] = useState<LivePoseStatus>(EMPTY_LIVE_POSE_STATUS);
  const [autoArmed, setAutoArmed] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flashActive, setFlashActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (autoStopRef.current !== null) window.clearTimeout(autoStopRef.current);
    if (stablePoseRef.current !== null) window.clearTimeout(stablePoseRef.current);
    if (countdownTimerRef.current !== null) window.clearTimeout(countdownTimerRef.current);
    timerRef.current = null;
    autoStopRef.current = null;
    stablePoseRef.current = null;
    countdownTimerRef.current = null;
  }, []);

  const closeCamera = useCallback(() => {
    clearTimers();
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.onstop = null;
      recorder.stop();
    }
    recorderRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPreviewReady(false);
    setPoseStatus(EMPTY_LIVE_POSE_STATUS);
    setAutoArmed(false);
    setCountdown(null);
  }, [clearTimers]);

  useEffect(() => closeCamera, [closeCamera]);

  useEffect(() => {
    if (mode !== "preview" && mode !== "recording") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    let cancelled = false;
    const markReady = () => {
      if (!cancelled && video.videoWidth > 0 && video.videoHeight > 0) setPreviewReady(true);
    };
    const attachPreview = async () => {
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      if (video.srcObject !== stream) video.srcObject = stream;
      try {
        await video.play();
        markReady();
      } catch {
        if (!cancelled) {
          setError("Podgląd kamery nie wystartował. Dotknij ekranu i spróbuj ponownie.");
        }
      }
    };

    video.addEventListener("loadedmetadata", markReady);
    video.addEventListener("canplay", markReady);
    void attachPreview();
    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", markReady);
      video.removeEventListener("canplay", markReady);
    };
  }, [mode]);

  const pulseTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track?.getCapabilities) return;
    const capabilities = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
    if (!capabilities.torch) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
      window.setTimeout(() => {
        void track
          .applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] })
          .catch(() => undefined);
      }, 140);
    } catch {
      // Latarka nie jest gwarantowana w przeglądarkach mobilnych; dźwięk i ekran są fallbackiem.
    }
  }, []);

  const signalCue = useCallback(
    (frequency = 660, durationMs = 150) => {
      setFlashActive(true);
      window.setTimeout(() => setFlashActive(false), durationMs);
      if (navigator.vibrate) navigator.vibrate(durationMs);
      void pulseTorch();

      const context = audioContextRef.current;
      if (!context) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.28, context.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + durationMs / 1000);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + durationMs / 1000 + 0.02);
    },
    [pulseTorch],
  );

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || recorderRef.current?.state === "recording") return false;

    setError(null);
    chunksRef.current = [];
    const mimeType = supportedMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      setError("Nagrywanie zostało przerwane przez przeglądarkę. Spróbuj ponownie.");
    };
    recorder.onstop = async () => {
      clearTimers();
      setMode("processing");
      const type = recorder.mimeType || mimeType || "video/webm";
      const extension = type.includes("mp4") ? "mp4" : "webm";
      const blob = new Blob(chunksRef.current, { type });
      const file = new File([blob], `ballwise-sprint-${Date.now()}.${extension}`, {
        type,
        lastModified: Date.now(),
      });
      closeCamera();
      try {
        await closePoseEngine();
        await onRecorded(file, detectedFps);
        setMode("idle");
        setElapsedSeconds(0);
      } catch {
        setError("Film został nagrany, ale nie udało się go zapisać. Spróbuj ponownie.");
        setMode("idle");
      }
    };
    recorder.start(250);
    setElapsedSeconds(0);
    setMode("recording");
    timerRef.current = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);
    return true;
  }, [clearTimers, closeCamera, detectedFps, onRecorded]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }, []);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      signalCue(640 + (3 - countdown) * 90);
      countdownTimerRef.current = window.setTimeout(() => {
        setCountdown((value) => (value === null ? null : value - 1));
      }, 900);
      return () => {
        if (countdownTimerRef.current !== null) window.clearTimeout(countdownTimerRef.current);
        countdownTimerRef.current = null;
      };
    }

    signalCue(980, 420);
    speak("Start");
    setCountdown(null);
    autoStopRef.current = window.setTimeout(stopRecording, AUTO_RECORDING_SECONDS * 1000);
  }, [countdown, signalCue, stopRecording]);

  const athleteReady =
    poseStatus.detected &&
    poseStatus.singleAthlete &&
    poseStatus.fullBody &&
    poseStatus.timingReady &&
    poseStatus.confidence >= 0.35;

  useEffect(() => {
    if (!autoArmed || mode !== "preview" || !previewReady || !athleteReady) {
      if (stablePoseRef.current !== null) window.clearTimeout(stablePoseRef.current);
      stablePoseRef.current = null;
      return;
    }
    if (stablePoseRef.current !== null) return;
    stablePoseRef.current = window.setTimeout(() => {
      stablePoseRef.current = null;
      setAutoArmed(false);
      if (!startRecording()) return;
      speak("Ustawienie poprawne. Start za trzy sekundy.");
      setCountdown(3);
    }, 1500);
    return () => {
      if (stablePoseRef.current !== null) window.clearTimeout(stablePoseRef.current);
      stablePoseRef.current = null;
    };
  }, [athleteReady, autoArmed, mode, previewReady, startRecording]);

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
      setPreviewReady(false);
      setMode("preview");
    } catch {
      closeCamera();
      setMode("idle");
      setError("Nie udało się uruchomić kamery. Zezwól BallWise na dostęp do kamery.");
    }
  }

  async function armAutomaticRecording() {
    try {
      audioContextRef.current ??= new AudioContext();
      await audioContextRef.current.resume();
    } catch {
      // Głos, wibracja i błysk ekranu nadal zadziałają.
    }
    setError(null);
    setAutoArmed(true);
    speak("Tryb automatyczny. Ustaw się na linii startu.");
  }

  function cancelPreview() {
    closeCamera();
    setMode("idle");
    setElapsedSeconds(0);
  }

  function cancelAutomaticRecording() {
    setAutoArmed(false);
    setCountdown(null);
    if (stablePoseRef.current !== null) window.clearTimeout(stablePoseRef.current);
    stablePoseRef.current = null;
  }

  const lowFps = detectedFps !== null && detectedFps < minimumFps;
  const cameraActive = mode === "preview" || mode === "recording";

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
      <div className="relative aspect-video w-full overflow-hidden bg-black">
        <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-contain" />
        <VisionLivePoseOverlay
          videoRef={videoRef}
          active={cameraActive && previewReady}
          onStatus={setPoseStatus}
        />

        <div className="pointer-events-none absolute inset-0 z-20">
          <div className="absolute inset-y-0 left-[12%] border-l border-dashed border-white/55" />
          <div className="absolute inset-y-0 right-[12%] border-r border-dashed border-white/55" />
          <div className="absolute inset-x-[12%] top-1/2 border-t border-white/25" />
          <span className="absolute left-[12%] top-3 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold">
            START W KADRZE
          </span>
          <span className="absolute right-[12%] top-3 -translate-x-full rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold">
            META W KADRZE
          </span>
        </div>

        {!previewReady && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Łączenie z kamerą…
          </div>
        )}

        {flashActive && <div className="pointer-events-none absolute inset-0 z-40 bg-white/85" />}

        {countdown !== null && (
          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-slate-950/35">
            <span className="flex h-24 w-24 items-center justify-center rounded-full bg-blue-600 text-5xl font-black shadow-2xl">
              {countdown === 0 ? "GO" : countdown}
            </span>
          </div>
        )}

        <div className="absolute bottom-3 left-3 z-30 flex gap-2 text-[10px] font-semibold">
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
        <div className="grid grid-cols-3 gap-2">
          <PreflightChip label="1 zawodnik" ready={poseStatus.singleAthlete} />
          <PreflightChip label="Cała sylwetka" ready={poseStatus.fullBody} />
          <PreflightChip label="Kadr sprintu" ready={poseStatus.timingReady} />
        </div>

        <p className="text-center text-xs leading-relaxed text-white/75">
          Prowadnice pomagają ustawić kadr. Dokładne linie START i META powstaną po kalibracji
          sceny.
        </p>

        {lowFps && (
          <p className="rounded-xl bg-amber-400/15 px-3 py-2 text-xs text-amber-100">
            Kamera udostępniła {detectedFps} FPS. Wynik zostanie oznaczony jako estymowany.
          </p>
        )}

        {autoArmed && (
          <p className="rounded-xl bg-blue-400/15 px-3 py-2 text-center text-xs text-blue-100">
            Tryb solo aktywny. Idź na START — po 1,5 s poprawnego ustawienia usłyszysz odliczanie.
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
        ) : autoArmed ? (
          <Button
            variant="secondary"
            className="w-full"
            size="lg"
            onClick={cancelAutomaticRecording}
          >
            Anuluj tryb automatyczny
          </Button>
        ) : (
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <Button className="w-full" size="lg" onClick={armAutomaticRecording}>
              <ScanLine className="mr-2 h-5 w-5" /> Tryb solo z odliczaniem
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="h-11 w-11"
              onClick={startRecording}
              aria-label="Rozpocznij nagranie ręcznie"
            >
              <Video className="h-4 w-4" />
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

        {error && <p className="px-1 text-xs leading-relaxed text-red-200">{error}</p>}
      </div>
    </div>
  );
}

function PreflightChip({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div
      className={`flex min-w-0 items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-semibold ${
        ready ? "bg-emerald-500/20 text-emerald-100" : "bg-white/10 text-white/60"
      }`}
    >
      {ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ScanLine className="h-3.5 w-3.5" />}
      <span className="truncate">{label}</span>
    </div>
  );
}
