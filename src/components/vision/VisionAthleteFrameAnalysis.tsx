import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readVideoMetadata, seekToFrame } from "@/features/vision-analysis/videoFrameReader";
import { readVideoFileFps } from "@/features/vision-analysis/videoFileFps";
import { measureCalibratedLandingPoint } from "@/features/vision-analysis/horizontalDistance";
import {
  computeVideoHashFromBlob,
  type CalibrationRecord,
  type ImagePointPx,
} from "@/features/vision-analysis/videoCalibration";
import { useAuth } from "@/lib/loadwise/auth";
import { computeFrameResult, getTestMarkers, timeToFrame } from "@/lib/vision/frameAnalysisService";
import type {
  FrameAnalysisResult,
  FrameMarkerDef,
  FrameMarkerKey,
  VisionTest,
} from "@/lib/vision/types";
import { getFlow, updateFlow } from "@/lib/vision/visionFlow";
import { clearVisionSessionVideo, loadVisionSessionVideo } from "@/lib/vision/visionSessionVideo";
import { saveFrameResult } from "@/lib/vision/visionResultService";
import { findVideoCalibration } from "@/lib/vision/videoCalibrationStore";
import { VisionVideoCalibration } from "./VisionVideoCalibration";
import { VisionHeader } from "./visionUi";

type FpsStatus = "detecting" | "measured" | "container" | "camera" | "unavailable";

/** Dokładny analizator klatek z podglądem odpornym na błąd repaint w iOS Safari. */
export function VisionAthleteFrameAnalysis({ test }: { test: VisionTest }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const animationRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const seekRunningRef = useRef(false);
  const displayedTimeRef = useRef(0);
  const markerDefs = useMemo(() => getTestMarkers(test.id), [test.id]);
  const initialFlow = getFlow(test.id);
  const initialFps = initialFlow.fps ?? 0;

  const [sourceState, setSourceState] = useState<"loading" | "ready" | "missing">("loading");
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoHash, setVideoHash] = useState("");
  const [calibration, setCalibration] = useState<CalibrationRecord | null>(null);
  const [landingPoint, setLandingPoint] = useState<ImagePointPx | null>(null);
  const [fps, setFps] = useState(initialFps);
  const [fpsStatus, setFpsStatus] = useState<FpsStatus>("detecting");
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [markers, setMarkers] = useState<Partial<Record<FrameMarkerKey, number>>>({});
  const [activeMarker, setActiveMarker] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);

  const drawPreview = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight)
      return;
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
    canvas.getContext("2d", { alpha: false })?.drawImage(video, 0, 0, canvas.width, canvas.height);
  }, []);

  const stopPreviewLoop = useCallback(() => {
    if (animationRef.current != null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
  }, []);

  const startPreviewLoop = useCallback(() => {
    stopPreviewLoop();
    const tick = () => {
      const video = videoRef.current;
      if (!video || video.paused || video.ended) {
        if (video) {
          displayedTimeRef.current = video.currentTime;
          setCurrentTime(video.currentTime);
          drawPreview();
        }
        setPlaying(false);
        animationRef.current = null;
        return;
      }
      displayedTimeRef.current = video.currentTime;
      setCurrentTime(video.currentTime);
      drawPreview();
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
  }, [drawPreview, stopPreviewLoop]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const flow = getFlow(test.id);
      const file = flow.file ?? (await loadVisionSessionVideo(test.id));
      if (cancelled) return;
      if (!file || file.size <= 0) {
        setSourceState("missing");
        return;
      }
      if (!flow.file)
        updateFlow(test.id, { file, fileName: file.name, videoUrl: null, uploaded: false });
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      setVideoSrc(url);
      setSourceState("ready");
      try {
        const [containerFps, hash] = await Promise.all([
          readVideoFileFps(file),
          computeVideoHashFromBlob(file),
        ]);
        if (cancelled) return;
        setVideoHash(hash);
        setCalibration(findVideoCalibration(hash));
        const metadata = await readVideoMetadata(url, containerFps ?? flow.fps ?? null);
        if (cancelled) return;
        setFps(metadata.fps);
        setFpsStatus(
          metadata.fpsMeasured
            ? "measured"
            : containerFps
              ? "container"
              : flow.fps
                ? "camera"
                : "unavailable",
        );
      } catch {
        if (cancelled) return;
        setFps(initialFps);
        setFpsStatus(flow.fps ? "camera" : "unavailable");
      }
    })();
    return () => {
      cancelled = true;
      stopPreviewLoop();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    };
  }, [initialFps, stopPreviewLoop, test.id]);

  const currentFrame = timeToFrame(currentTime, fps);
  const fpsReady = fpsStatus !== "detecting" && fpsStatus !== "unavailable" && fps > 0;
  const broadMeasurement = useMemo(() => {
    if (test.id !== "broad_jump" || !calibration || !landingPoint) return null;
    return measureCalibratedLandingPoint(calibration, landingPoint);
  }, [calibration, landingPoint, test.id]);
  const analysis = useMemo<FrameAnalysisResult | null>(() => {
    if (!fpsReady || markerDefs.some((def) => def.required && markers[def.key] == null))
      return null;
    const manual =
      test.id === "broad_jump" && broadMeasurement?.ok && calibration && landingPoint
        ? {
            distance_cm: broadMeasurement.distanceCm,
            landing_point_u: landingPoint.u,
            landing_point_v: landingPoint.v,
            calibration_id: calibration.calibrationId,
            calibration_hash: calibration.calibrationHash,
            calibration_reprojection_error_px: calibration.reprojectionErrorPx,
            calibration_official: calibration.spatialResultStatus === "OFFICIAL",
          }
        : {};
    return computeFrameResult({ testId: test.id, fps, markers, manual, markedBy: "user" });
  }, [broadMeasurement, calibration, fps, fpsReady, landingPoint, markerDefs, markers, test.id]);

  const drainSeekQueue = useCallback(async () => {
    if (seekRunningRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    seekRunningRef.current = true;
    setSeeking(true);
    video.pause();
    setPlaying(false);
    stopPreviewLoop();
    try {
      while (pendingSeekRef.current != null) {
        const target = pendingSeekRef.current;
        pendingSeekRef.current = null;
        try {
          const presented = await seekToFrame(video, target);
          displayedTimeRef.current = presented;
          setCurrentTime(presented);
          drawPreview();
        } catch {
          toast.error("Nie udało się wyświetlić tej klatki.");
          break;
        }
      }
    } finally {
      seekRunningRef.current = false;
      setSeeking(false);
      drawPreview();
      if (pendingSeekRef.current != null) void drainSeekQueue();
    }
  }, [drawPreview, stopPreviewLoop]);

  const seekTo = useCallback(
    (seconds: number) => {
      const video = videoRef.current;
      if (!video) return;
      const safeDuration = duration || video.duration || 0;
      pendingSeekRef.current = Math.min(Math.max(0, seconds), safeDuration);
      void drainSeekQueue();
    },
    [drainSeekQueue, duration],
  );

  function step(frames: number) {
    seekTo((pendingSeekRef.current ?? displayedTimeRef.current) + frames / fps);
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      stopPreviewLoop();
      displayedTimeRef.current = video.currentTime;
      setCurrentTime(video.currentTime);
      setPlaying(false);
      drawPreview();
      return;
    }
    try {
      await video.play();
      setPlaying(true);
      startPreviewLoop();
    } catch {
      toast.error("Safari zablokowało odtwarzanie. Dotknij Play ponownie.");
    }
  }

  function setMarker(def: FrameMarkerDef, index: number) {
    if (seeking) return;
    setMarkers((previous) => ({ ...previous, [def.key]: currentFrame }));
    if (test.id === "broad_jump" && def.key === "landing_frame") setLandingPoint(null);
    if (index < markerDefs.length - 1) {
      setActiveMarker(index + 1);
      seekTo(currentTime + Math.max(6 / fps, 0.12));
    }
  }

  function jumpToMarker(def: FrameMarkerDef, index: number) {
    setActiveMarker(index);
    const frame = markers[def.key];
    if (frame != null) seekTo(frame / fps);
  }

  async function save() {
    if (!analysis || analysis.status === "invalid") return;
    setSaving(true);
    try {
      const saved = await saveFrameResult({
        userId: user?.id ?? null,
        frame: analysis,
        videoUrl: null,
        cameraView: getFlow(test.id).cameraView ?? test.cameraView,
      });
      await clearVisionSessionVideo(test.id);
      toast.success("Wynik obliczony i zapisany.");
      navigate({ to: "/vision-lab/result/$resultId", params: { resultId: saved.id } });
    } catch {
      toast.error("Nie udało się zapisać wyniku.");
    } finally {
      setSaving(false);
    }
  }

  if (sourceState === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Otwieranie filmu…
      </div>
    );
  }

  if (sourceState === "missing" || !videoSrc) {
    return (
      <div className="pb-28">
        <VisionHeader title="Analiza klatkowa" subtitle={test.name} backTo="/vision-lab" />
        <div className="mx-5 soft-card space-y-4 p-5 text-center">
          <p className="text-sm text-muted-foreground">
            Film nie jest już dostępny na tym urządzeniu. Wybierz go ponownie — nie został wysłany
            do chmury.
          </p>
          <Button
            className="w-full"
            onClick={() =>
              navigate({ to: "/vision-lab/test/$testId/upload", params: { testId: test.id } })
            }
          >
            Wybierz film
          </Button>
        </div>
      </div>
    );
  }

  if (test.id === "broad_jump" && (!fpsReady || !videoHash)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Odczytywanie filmu i FPS…
      </div>
    );
  }

  if (test.id === "broad_jump" && !calibration) {
    return (
      <div className="select-none pb-28">
        <VisionHeader
          title="Kalibracja Broad Jump"
          subtitle="Jednorazowo dla tego nagrania"
          backTo="/vision-lab"
        />
        <div className="space-y-4 px-4">
          <div className="rounded-2xl bg-accent px-4 py-3 text-xs leading-relaxed text-foreground">
            Zaznacz cztery rogi zmierzonego prostokąta na podłożu. Jego lewa krawędź musi być linią
            wybicia, a cała strefa lądowania musi mieścić się wewnątrz prostokąta.
          </div>
          <VisionVideoCalibration
            videoSrc={videoSrc}
            videoHash={videoHash}
            fps={fps}
            testId="broad_jump"
            officialOnly
            onSaved={setCalibration}
            onCancel={() =>
              navigate({ to: "/vision-lab/test/$testId/upload", params: { testId: test.id } })
            }
          />
        </div>
      </div>
    );
  }

  const activeDef = markerDefs[activeMarker];
  const validResult = analysis && analysis.status !== "invalid";

  return (
    <div className="select-none pb-32">
      <VisionHeader
        title="Ustaw kluczowe klatki"
        subtitle={`${test.name} · pomiar z filmu`}
        backTo="/vision-lab"
      />
      <div className="space-y-4 px-4">
        <div className="relative min-h-48 overflow-hidden rounded-2xl bg-black">
          <canvas
            ref={canvasRef}
            onClick={(event) => {
              if (test.id !== "broad_jump") return;
              const landingFrame = markers.landing_frame;
              if (landingFrame == null || currentFrame !== landingFrame) {
                toast.error("Najpierw zapisz i wyświetl klatkę pierwszego lądowania.");
                return;
              }
              const canvas = canvasRef.current;
              if (!canvas) return;
              const rect = canvas.getBoundingClientRect();
              setLandingPoint({
                u: ((event.clientX - rect.left) / rect.width) * canvas.width,
                v: ((event.clientY - rect.top) / rect.height) * canvas.height,
              });
            }}
            className="block max-h-[48vh] w-full object-contain"
            aria-label={`Podgląd klatki ${currentFrame}`}
          />
          <video
            ref={videoRef}
            src={videoSrc}
            playsInline
            muted
            preload="auto"
            className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
            onLoadedData={(event) => {
              displayedTimeRef.current = event.currentTarget.currentTime;
              setCurrentTime(event.currentTarget.currentTime);
              drawPreview();
            }}
            onEnded={() => {
              setPlaying(false);
              stopPreviewLoop();
              drawPreview();
            }}
          />
          {seeking && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
              <Loader2 className="h-7 w-7 animate-spin text-white" />
            </div>
          )}
          {test.id === "broad_jump" && landingPoint && markers.landing_frame === currentFrame && (
            <span
              className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-primary shadow-lg"
              style={{
                left: `${(landingPoint.u / Math.max(1, canvasRef.current?.width ?? 1)) * 100}%`,
                top: `${(landingPoint.v / Math.max(1, canvasRef.current?.height ?? 1)) * 100}%`,
              }}
            />
          )}
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white">
            klatka {currentFrame} · {currentTime.toFixed(3)} s
          </div>
        </div>

        <div className="rounded-2xl bg-accent px-4 py-3 text-xs leading-relaxed text-foreground">
          <span className="font-semibold">Ujęcie do pomiaru:</span> telefon nieruchomo z boku,
          prostopadle do ruchu; obie stopy i podłoże muszą być widoczne przez cały skok.
          {test.id === "broad_jump" &&
            " Po zapisaniu klatki dotknij pięty położonej najbliżej linii wybicia."}
        </div>

        <FpsCard fps={fps} status={fpsStatus} />

        <div
          className={`soft-card space-y-3 p-4 ${!fpsReady ? "pointer-events-none opacity-45" : ""}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">
                {activeMarker + 1}. {activeDef?.label ?? "Kluczowa klatka"}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {markerInstruction(activeDef)}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-foreground">
              {currentFrame}
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(0, duration)}
            step={1 / Math.max(1, fps)}
            value={Math.min(currentTime, duration || 0)}
            onChange={(event) => seekTo(Number(event.target.value))}
            className="w-full touch-pan-x accent-primary"
            aria-label="Pozycja filmu"
          />

          <div className="grid grid-cols-5 gap-2">
            <FrameStep label="−5" disabled={seeking} onClick={() => step(-5)} />
            <FrameStep label="−1" disabled={seeking} onClick={() => step(-1)} />
            <button
              type="button"
              disabled={seeking}
              onClick={() => void togglePlayback()}
              className="flex touch-manipulation items-center justify-center rounded-xl bg-secondary py-2 text-xs font-semibold text-secondary-foreground disabled:opacity-50"
            >
              {playing ? (
                <Pause className="mr-1 h-3.5 w-3.5" />
              ) : (
                <Play className="mr-1 h-3.5 w-3.5" />
              )}
              {playing ? "Pauza" : "Play"}
            </button>
            <FrameStep label="+1" disabled={seeking} onClick={() => step(1)} />
            <FrameStep label="+5" disabled={seeking} onClick={() => step(5)} />
          </div>

          {activeDef && (
            <Button
              className="w-full"
              disabled={seeking}
              onClick={() => setMarker(activeDef, activeMarker)}
            >
              <Check className="mr-2 h-4 w-4" /> Zapisz tę klatkę
            </Button>
          )}

          <div className="grid gap-2">
            {markerDefs.map((def, index) => {
              const value = markers[def.key];
              return (
                <button
                  key={def.key}
                  type="button"
                  onClick={() => jumpToMarker(def, index)}
                  className={`flex touch-manipulation items-center justify-between rounded-xl px-3 py-2 text-left text-xs ${activeMarker === index ? "bg-primary/10 text-foreground" : "bg-secondary text-secondary-foreground"}`}
                >
                  <span className="font-semibold">{def.label}</span>
                  <span>{value == null ? "do ustawienia" : `klatka ${value}`}</span>
                </button>
              );
            })}
          </div>
        </div>

        {analysis?.status === "invalid" && (
          <div className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
            {analysis.error}
          </div>
        )}
        {test.id === "broad_jump" && broadMeasurement && !broadMeasurement.ok && (
          <div className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
            Punkt pięty znajduje się poza skalibrowaną strefą albo daje nierealny dystans. Popraw
            punkt lub kalibrację.
          </div>
        )}
        {validResult && <ResultCard analysis={analysis} />}

        <div className="flex items-start gap-2 rounded-2xl bg-accent px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <span>
            Film jest analizowany lokalnie i nie trafia do chmury. Po zapisie zachowujemy wynik, FPS
            i numery klatek — nie nagranie.
          </span>
        </div>
        {test.id === "broad_jump" && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setLandingPoint(null);
              setMarkers({});
              setCalibration(null);
            }}
          >
            Skalibruj podłoże ponownie
          </Button>
        )}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setMarkers({});
            setActiveMarker(0);
            setLandingPoint(null);
            seekTo(0);
          }}
        >
          <RotateCcw className="mr-2 h-4 w-4" /> Ustaw klatki od nowa
        </Button>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/92 px-4 py-3 backdrop-blur"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
      >
        <div className="mx-auto max-w-[30rem]">
          <Button className="w-full" size="lg" disabled={!validResult || saving} onClick={save}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Zapisywanie…
              </>
            ) : (
              "Zapisz wynik"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FpsCard({ fps, status }: { fps: number; status: FpsStatus }) {
  const message =
    status === "detecting"
      ? "Odczytuję z nagrania…"
      : status === "measured"
        ? "Wykryte z rzeczywistych klatek filmu."
        : status === "container"
          ? "Odczytane z tabeli czasu klatek pliku MP4/MOV."
          : status === "camera"
            ? "Odczytane z ustawień kamery."
            : "Nie udało się wiarygodnie odczytać FPS. Z tego filmu nie policzymy wysokości.";
  const quality =
    status === "detecting" || status === "unavailable"
      ? null
      : fps >= 120
        ? "Wysoka dokładność"
        : fps >= 60
          ? "Pomiar terenowy"
          : "Za niska jakość czasowa";
  return (
    <div className="soft-card space-y-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">FPS filmu</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{message}</p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary">
          {status === "detecting" ? "…" : status === "unavailable" ? "Brak" : `${fps} FPS`}
        </span>
      </div>
      {quality && <p className="text-xs font-semibold text-foreground">{quality}</p>}
    </div>
  );
}

function markerInstruction(def: FrameMarkerDef | undefined): string {
  if (def?.key === "takeoff_frame")
    return "Pierwsza klatka, na której obie stopy nie dotykają podłoża.";
  if (def?.key === "landing_frame")
    return def.label.includes("Pierwszy kontakt")
      ? "Pierwsza klatka kontaktu z podłożem. Potem dotknij tylnej krawędzi pięty bliższej linii wybicia."
      : "Pierwsza klatka ponownego kontaktu stopy z podłożem.";
  if (def?.key === "first_contact_frame")
    return "Pierwsza klatka kontaktu stopy z podłożem po zeskoku ze skrzyni.";
  return "Ustaw dokładną klatkę zdarzenia widocznego na filmie.";
}

function ResultCard({ analysis }: { analysis: FrameAnalysisResult }) {
  const labels = [
    "Czas lotu",
    "Czas kontaktu",
    "Wysokość skoku",
    "Wysokość odbicia",
    "RSI",
    "Zakres rozdzielczości klatek",
    "Odległość",
    "Błąd reprojekcji",
  ];
  return (
    <div className="soft-card p-5">
      <div className="text-center">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Wynik
        </div>
        <div className="mt-1 text-4xl font-bold text-foreground">
          {analysis.mainResultValue} <span className="text-xl">{analysis.mainResultUnit}</span>
        </div>
      </div>
      <dl className="mt-4 space-y-2 border-t border-border pt-3">
        {analysis.basis.items
          .filter((item) => labels.includes(item.label))
          .map((item) => (
            <div key={item.label} className="flex justify-between gap-3 text-xs">
              <dt className="text-muted-foreground">{item.label}</dt>
              <dd className="font-semibold text-foreground">{item.value}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

function FrameStep({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const Icon = label.startsWith("−") ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex touch-manipulation items-center justify-center rounded-xl bg-secondary py-2 text-xs font-semibold text-secondary-foreground disabled:opacity-50"
    >
      <Icon className="mr-0.5 h-3.5 w-3.5" /> {label.replace(/[−+]/, "")}
    </button>
  );
}
