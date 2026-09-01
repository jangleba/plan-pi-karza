import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { VisionHeader } from "./visionUi";
import { useAuth } from "@/lib/loadwise/auth";
import type {
  FrameAnalysisResult,
  FrameMarkerDef,
  FrameMarkerKey,
  VisionTest,
} from "@/lib/vision/types";
import { computeFrameResult, getTestMarkers, timeToFrame } from "@/lib/vision/frameAnalysisService";
import { getFlow, updateFlow } from "@/lib/vision/visionFlow";
import { clearVisionSessionVideo, loadVisionSessionVideo } from "@/lib/vision/visionSessionVideo";
import { saveFrameResult } from "@/lib/vision/visionResultService";

const FPS_OPTIONS = [30, 60, 120, 240];

/**
 * Zawodniczy analizator klatkowy.
 *
 * Pomiar nie zależy od klasyfikatora pozy: użytkownik wskazuje widoczne
 * zdarzenia w źródłowym filmie, a czysta funkcja domenowa liczy wynik z FPS.
 * Dzięki temu plecak, łóżko ani chwilowy błąd szkieletu nie zmieniają czasu.
 */
export function VisionAthleteFrameAnalysis({ test }: { test: VisionTest }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const markerDefs = useMemo(() => getTestMarkers(test.id), [test.id]);

  const initialFlow = getFlow(test.id);
  const [sourceState, setSourceState] = useState<"loading" | "ready" | "missing">("loading");
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [fps, setFps] = useState(initialFlow.fps || test.recommendedFps || 60);
  const [fpsConfirmed, setFpsConfirmed] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [markers, setMarkers] = useState<Partial<Record<FrameMarkerKey, number>>>({});
  const [activeMarker, setActiveMarker] = useState(0);
  const [saving, setSaving] = useState(false);

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
      if (!flow.file) {
        updateFlow(test.id, { file, fileName: file.name, videoUrl: null, uploaded: false });
      }
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      setVideoSrc(url);
      setSourceState("ready");
    })();
    return () => {
      cancelled = true;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    };
  }, [test.id]);

  const currentFrame = timeToFrame(currentTime, fps);
  const frameStep = 1 / Math.max(1, fps);
  const analysis = useMemo<FrameAnalysisResult | null>(() => {
    if (!fpsConfirmed || markerDefs.some((def) => def.required && markers[def.key] == null)) {
      return null;
    }
    return computeFrameResult({ testId: test.id, fps, markers, markedBy: "user" });
  }, [fps, fpsConfirmed, markerDefs, markers, test.id]);

  function seekTo(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    const next = Math.min(Math.max(0, seconds), duration || video.duration || 0);
    video.currentTime = next;
    setCurrentTime(next);
  }

  function step(frames: number) {
    seekTo(currentTime + frames / fps);
  }

  function setMarker(def: FrameMarkerDef, index: number) {
    setMarkers((previous) => ({ ...previous, [def.key]: currentFrame }));
    if (index < markerDefs.length - 1) setActiveMarker(index + 1);
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

  const activeDef = markerDefs[activeMarker];
  const validResult = analysis && analysis.status !== "invalid";

  return (
    <div className="pb-32">
      <VisionHeader
        title="Ustaw kluczowe klatki"
        subtitle={`${test.name} · realny pomiar z filmu`}
        backTo="/vision-lab"
      />

      <div className="space-y-4 px-4">
        <div className="overflow-hidden rounded-2xl bg-black">
          <video
            ref={videoRef}
            src={videoSrc}
            playsInline
            muted
            preload="auto"
            className="max-h-[48vh] w-full object-contain"
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onSeeked={(event) => setCurrentTime(event.currentTarget.currentTime)}
          />
        </div>

        <div className="soft-card space-y-3 p-4">
          <div>
            <div className="text-sm font-semibold text-foreground">1. FPS źródłowego nagrania</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Wybierz ustawienie użyte w aparacie. To ono wyznacza czas między klatkami.
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {FPS_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setFps(option);
                  setFpsConfirmed(true);
                  setMarkers({});
                  setActiveMarker(0);
                }}
                className={`rounded-xl py-2 text-sm font-semibold ${
                  fpsConfirmed && fps === option
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          {!fpsConfirmed && (
            <p className="text-xs font-medium text-amber-700">
              Wybierz FPS, zanim zaznaczysz klatki.
            </p>
          )}
        </div>

        <div
          className={`soft-card space-y-3 p-4 ${!fpsConfirmed ? "pointer-events-none opacity-45" : ""}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">
                2. {activeDef?.label ?? "Kluczowa klatka"}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {activeDef?.key === "takeoff_frame"
                  ? "Znajdź pierwszą klatkę, na której obie stopy nie dotykają podłoża."
                  : activeDef?.key === "landing_frame"
                    ? "Znajdź pierwszą klatkę ponownego kontaktu stopy z podłożem."
                    : "Ustaw dokładną klatkę zdarzenia widocznego na filmie."}
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
            step={frameStep}
            value={Math.min(currentTime, duration || 0)}
            onChange={(event) => seekTo(Number(event.target.value))}
            className="w-full accent-primary"
            aria-label="Pozycja filmu"
          />

          <div className="grid grid-cols-5 gap-2">
            <FrameStep label="−5" onClick={() => step(-5)} />
            <FrameStep label="−1" onClick={() => step(-1)} />
            <button
              type="button"
              onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                if (video.paused) void video.play();
                else video.pause();
              }}
              className="rounded-xl bg-secondary py-2 text-xs font-semibold text-secondary-foreground"
            >
              Play
            </button>
            <FrameStep label="+1" onClick={() => step(1)} />
            <FrameStep label="+5" onClick={() => step(5)} />
          </div>

          {activeDef && (
            <Button className="w-full" onClick={() => setMarker(activeDef, activeMarker)}>
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
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs ${
                    activeMarker === index
                      ? "bg-primary/10 text-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
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

        {validResult && (
          <div className="soft-card p-5">
            <div className="text-center">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Wynik
              </div>
              <div className="mt-1 text-4xl font-bold text-foreground">
                {analysis.mainResultValue}{" "}
                <span className="text-xl">{analysis.mainResultUnit}</span>
              </div>
            </div>
            <dl className="mt-4 space-y-2 border-t border-border pt-3">
              {analysis.basis.items
                .filter((item) =>
                  [
                    "Czas lotu",
                    "Czas kontaktu",
                    "Wysokość skoku",
                    "Wysokość odbicia",
                    "RSI",
                    "Zakres rozdzielczości klatek",
                  ].includes(item.label),
                )
                .map((item) => (
                  <div key={item.label} className="flex justify-between gap-3 text-xs">
                    <dt className="text-muted-foreground">{item.label}</dt>
                    <dd className="font-semibold text-foreground">{item.value}</dd>
                  </div>
                ))}
            </dl>
          </div>
        )}

        <div className="flex items-start gap-2 rounded-2xl bg-accent px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <span>
            Film jest analizowany lokalnie i nie trafia do chmury. Po zapisie zachowujemy wynik, FPS
            i numery klatek — nie nagranie.
          </span>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setMarkers({});
            setActiveMarker(0);
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
              "Zapisz prawdziwy wynik"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FrameStep({ label, onClick }: { label: string; onClick: () => void }) {
  const Icon = label.startsWith("−") ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center rounded-xl bg-secondary py-2 text-xs font-semibold text-secondary-foreground"
    >
      <Icon className="mr-0.5 h-3.5 w-3.5" /> {label.replace(/[−+]/, "")}
    </button>
  );
}
