import { useEffect, useMemo, useRef, useState } from "react";
import { Expand, Pause, Play, ScanLine, X } from "lucide-react";
import { VisionLivePoseOverlay } from "./VisionLivePoseOverlay";
import { EMPTY_LIVE_POSE_STATUS, type LivePoseStatus } from "./visionLivePose";
import { buildSprintReplayMetrics, type SprintReplayMetric } from "./sprintReplayMetrics";
import { getFlow } from "@/lib/vision/visionFlow";
import type { VisionTestResult } from "@/lib/vision/types";

function useLocalVideoUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  return url;
}

function MetricChip({ metric }: { metric: SprintReplayMetric }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-[#071b3d]/82 px-3 py-2 backdrop-blur-md">
      <div className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-blue-100/70">
        {metric.label}
      </div>
      <div className="mt-0.5 truncate text-lg font-semibold tabular-nums text-white">
        {metric.value}
        <span className="ml-1 text-[11px] font-medium text-blue-100/75">{metric.unit}</span>
      </div>
      {metric.detail && <div className="truncate text-[9px] text-blue-100/55">{metric.detail}</div>}
    </div>
  );
}

function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00.00";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(2).padStart(5, "0")}`;
}

interface ReplayStageProps {
  src: string;
  metrics: SprintReplayMetric[];
  fullscreen: boolean;
  onFullscreenChange: (next: boolean) => void;
}

function ReplayStage({ src, metrics, fullscreen, onFullscreenChange }: ReplayStageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [poseStatus, setPoseStatus] = useState<LivePoseStatus>(EMPTY_LIVE_POSE_STATUS);

  useEffect(() => {
    if (!fullscreen) return;
    const scrollY = window.scrollY;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [fullscreen]);

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      await video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }

  const stageClass = fullscreen
    ? "fixed inset-0 z-[80] h-[100dvh] w-screen overflow-hidden bg-[#04142f] text-white"
    : "relative -mx-5 h-[58dvh] min-h-[24rem] max-h-[42rem] overflow-hidden bg-[#04142f] text-white";

  return (
    <div
      className={stageClass}
      role={fullscreen ? "dialog" : undefined}
      aria-modal={fullscreen ? "true" : undefined}
      aria-label={fullscreen ? "Pełnoekranowa powtórka analizy sprintu" : undefined}
    >
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        preload="metadata"
        className="absolute inset-0 h-full w-full object-contain"
        onLoadedData={() => setReady(true)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <VisionLivePoseOverlay videoRef={videoRef} active={ready} onStatus={setPoseStatus} />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-[#020b1d]/95 via-[#020b1d]/45 to-transparent px-4 pb-16 pt-4">
        <div className="grid max-w-sm grid-cols-2 gap-2 pr-12">
          {metrics.map((metric) => (
            <MetricChip key={metric.kind} metric={metric} />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onFullscreenChange(!fullscreen)}
        aria-label={fullscreen ? "Zamknij pełny ekran" : "Otwórz pełny ekran"}
        className="absolute right-4 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-[#071b3d]/85 text-white backdrop-blur-md"
        style={{ marginTop: fullscreen ? "env(safe-area-inset-top)" : undefined }}
      >
        {fullscreen ? <X className="h-5 w-5" /> : <Expand className="h-5 w-5" />}
      </button>

      <div
        className="absolute inset-x-0 bottom-0 z-30 space-y-3 bg-gradient-to-t from-[#020b1d] via-[#020b1d]/82 to-transparent px-4 pt-16"
        style={{ paddingBottom: fullscreen ? "max(env(safe-area-inset-bottom), 1rem)" : "1rem" }}
      >
        <div className="flex items-center justify-between gap-3 text-[10px] font-medium text-blue-100/70">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1">
            <ScanLine className="h-3.5 w-3.5" />
            {poseStatus.detected ? "Szkielet z klatek" : "Wykrywanie szkieletu"}
          </span>
          <span className="tabular-nums">
            Pozycja filmu {formatVideoTime(currentTime)} / {formatVideoTime(duration)}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={Math.max(duration, 0.01)}
          step={0.01}
          value={Math.min(currentTime, Math.max(duration, 0.01))}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            if (videoRef.current) videoRef.current.currentTime = next;
            setCurrentTime(next);
          }}
          aria-label="Pozycja filmu"
          className="h-1.5 w-full cursor-pointer accent-blue-500"
        />

        <button
          type="button"
          onClick={() => void togglePlayback()}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-blue-600 text-sm font-semibold text-white active:scale-[0.99]"
        >
          {playing ? (
            <>
              <Pause className="mr-2 h-5 w-5" /> Pauza
            </>
          ) : (
            <>
              <Play className="mr-2 h-5 w-5" /> Odtwórz analizę
            </>
          )}
        </button>
        <p className="text-center text-[9px] leading-relaxed text-blue-100/55">
          Szkielet to estymacja pozy z klatek. Czas i prędkość są pokazywane tylko wtedy, gdy
          pipeline miał wymagany FPS, kalibrację i przecięcia linii.
        </p>
      </div>
    </div>
  );
}

export function VisionSprintReplay({ result }: { result: VisionTestResult }) {
  const scan = result.calculationBasis?.sprintScan;
  const localFile = getFlow(result.testType).file;
  const src = useLocalVideoUrl(localFile);
  const [fullscreen, setFullscreen] = useState(false);
  const metrics = useMemo(
    () =>
      scan
        ? buildSprintReplayMetrics({
            mainResultValue: result.mainResultValue,
            mainResultUnit: result.mainResultUnit,
            fps: result.fps,
            fpsSource: result.calculationBasis?.fpsSource,
            frameDerived: result.frameDerived,
            measuredMetrics: result.measuredMetrics,
            sprintScan: scan,
          })
        : [],
    [result, scan],
  );

  if (!scan || !src) return null;

  return (
    <ReplayStage
      src={src}
      metrics={metrics}
      fullscreen={fullscreen}
      onFullscreenChange={setFullscreen}
    />
  );
}
