import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Crop, Flag, Gauge, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { containedVideoRect, trimMarkers } from "@/lib/lab/analyzer";
import { loadExactFrame, type FrameResponse } from "@/lib/lab/nativeCamera";
import type { LabMarkers, LabTestDefinition, NativeVideoCapture } from "@/lib/lab/types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function FrameAnalyzer({
  capture,
  test,
  onCancel,
  onComplete,
  saving = false,
}: {
  capture: NativeVideoCapture;
  test: LabTestDefinition;
  onCancel: () => void;
  onComplete: (markers: LabMarkers) => void;
  saving?: boolean;
}) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [trimStartFrame, setTrimStartFrame] = useState(0);
  const [trimEndFrame, setTrimEndFrame] = useState(Math.max(1, capture.frameCount - 1));
  const [firstFrame, setFirstFrame] = useState<number | null>(null);
  const [secondFrame, setSecondFrame] = useState<number | null>(null);
  const [activeMarker, setActiveMarker] = useState<0 | 1>(0);
  const [guidePositions, setGuidePositions] = useState<[number, number]>(
    test.guideMode === "shared" ? [0.72, 0.72] : [0.32, 0.68],
  );
  const [loadedFrame, setLoadedFrame] = useState<FrameResponse | null>(null);
  const [paintedFrame, setPaintedFrame] = useState<FrameResponse | null>(null);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const requestRef = useRef(0);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [viewerSize, setViewerSize] = useState({ width: 0, height: 0 });
  const videoRect = containedVideoRect(
    viewerSize.width,
    viewerSize.height,
    capture.width,
    capture.height,
  );

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(viewer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const requestId = ++requestRef.current;
    setLoadedFrame(null);
    setPaintedFrame(null);
    setFrameError(null);
    const timeout = window.setTimeout(() => {
      void loadExactFrame(capture.path, currentFrame)
        .then((response) => {
          if (requestId !== requestRef.current) return;
          if (
            !response?.dataUrl ||
            response.frameIndex !== currentFrame ||
            !Number.isFinite(response.actualTimeSeconds) ||
            Math.abs(response.actualTimeSeconds - capture.frameTimestampsSeconds[currentFrame]) >
              1e-9
          ) {
            throw new Error("Odczytano inną klatkę niż wybrana.");
          }
          setLoadedFrame(response);
        })
        .catch(() => {
          if (requestId === requestRef.current)
            setFrameError("Nie można odczytać dokładnej klatki.");
        });
    }, 45);
    return () => {
      window.clearTimeout(timeout);
      requestRef.current += 1;
    };
  }, [capture, currentFrame, retry]);

  const frameReady =
    !frameError &&
    loadedFrame !== null &&
    paintedFrame === loadedFrame &&
    loadedFrame.frameIndex === currentFrame;
  const loadingFrame = !frameReady && !frameError;

  function setTrim(start: number, end: number) {
    const markers = trimMarkers(
      {
        firstFrame,
        secondFrame,
        trimStartFrame,
        trimEndFrame,
        firstGuidePosition: guidePositions[0],
        secondGuidePosition: guidePositions[1],
      },
      start,
      end,
    );
    setTrimStartFrame(start);
    setTrimEndFrame(end);
    setFirstFrame(markers.firstFrame);
    setSecondFrame(markers.secondFrame);
    setCurrentFrame((frame) => clamp(frame, start, end));
  }

  function move(frames: number) {
    setCurrentFrame((value) => clamp(value + frames, trimStartFrame, trimEndFrame));
  }

  function updateGuide(event: React.PointerEvent<HTMLDivElement>) {
    if (saving || !frameReady || videoRect.width <= 0 || videoRect.height <= 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left - videoRect.left;
    const y = event.clientY - bounds.top - videoRect.top;
    if (x < 0 || y < 0 || x > videoRect.width || y > videoRect.height) return;
    const value = test.guideAxis === "vertical" ? x / videoRect.width : y / videoRect.height;
    const next = clamp(value, 0.05, 0.95);
    setGuidePositions((positions) =>
      test.guideMode === "shared"
        ? [next, next]
        : activeMarker === 0
          ? [next, positions[1]]
          : [positions[0], next],
    );
  }

  const [firstMarker, secondMarker] = test.markers;
  const ready =
    frameReady &&
    !saving &&
    firstFrame !== null &&
    secondFrame !== null &&
    secondFrame > firstFrame &&
    firstFrame >= trimStartFrame &&
    secondFrame <= trimEndFrame;

  return (
    <div className="bw-workspace bg-[#071426] text-white">
      <div className="bw-page-content mx-auto grid h-full w-full max-w-[var(--bw-content-width)] grid-rows-[auto_minmax(8rem,1fr)_minmax(0,1fr)_auto] min-[640px]:landscape:grid-cols-[minmax(0,1fr)_17.5rem] min-[640px]:landscape:grid-rows-[auto_minmax(0,1fr)_auto] min-[640px]:landscape:gap-x-[var(--bw-section-gap)] lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_minmax(0,1fr)_auto] lg:gap-x-[var(--bw-section-gap)]">
        <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 pb-3 pt-[max(1rem,env(safe-area-inset-top))] min-[640px]:landscape:col-span-2 lg:col-span-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={saving}
            onClick={onCancel}
            className="bg-white/10 text-white hover:bg-white/20 hover:text-white"
            aria-label="Anuluj analizę"
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="text-center">
            <h2 className="bw-section-title">{test.title}</h2>
            <p className="text-sm text-white/60">
              Klatka {currentFrame + 1} / {capture.frameCount}
            </p>
          </div>
          <span className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold">
            {capture.fps.toFixed(0)} FPS
          </span>
        </header>

        <div
          ref={viewerRef}
          className="relative min-h-0 flex-1 touch-none overflow-hidden bg-black min-[640px]:landscape:row-start-2 min-[640px]:landscape:row-span-2 lg:row-start-2 lg:row-span-2"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            updateGuide(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) updateGuide(event);
          }}
        >
          {loadedFrame && loadedFrame.frameIndex === currentFrame ? (
            <img
              key={`${loadedFrame.frameIndex}-${retry}`}
              src={loadedFrame.dataUrl}
              onLoad={() => setPaintedFrame(loadedFrame)}
              onError={() => setFrameError("Nie można wyświetlić klatki.")}
              alt="Dokładna klatka nagrania"
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-white/60">
              Ładowanie klatki…
            </div>
          )}
          <div className="pointer-events-none absolute overflow-hidden" style={videoRect}>
            {(test.guideMode === "shared" ? [guidePositions[0]] : guidePositions).map(
              (position, lineIndex) => (
                <div
                  key={lineIndex}
                  className={
                    test.guideAxis === "vertical"
                      ? `pointer-events-none absolute inset-y-0 w-0.5 shadow-[0_0_0_1px_rgba(0,0,0,.4)] ${lineIndex === 0 ? "bg-[#f4c84a]" : "bg-[#55d8ff]"}`
                      : `pointer-events-none absolute inset-x-0 h-0.5 shadow-[0_0_0_1px_rgba(0,0,0,.4)] ${lineIndex === 0 ? "bg-[#f4c84a]" : "bg-[#55d8ff]"}`
                  }
                  style={
                    test.guideAxis === "vertical"
                      ? { left: `${position * 100}%` }
                      : { top: `${position * 100}%` }
                  }
                >
                  {test.guideMode === "separate" && (
                    <span className="absolute left-1 top-2 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-[10px] font-bold text-white">
                      {lineIndex + 1}
                    </span>
                  )}
                </div>
              ),
            )}
          </div>
          {loadingFrame && (
            <div className="absolute right-3 top-3 h-2 w-2 animate-pulse rounded-full bg-[#f4c84a]" />
          )}
          {frameError && (
            <div className="absolute inset-x-4 top-4 rounded-lg bg-red-600/90 px-4 py-3 text-center text-sm">
              {frameError}
              <Button
                type="button"
                variant="link"
                className="ml-2 min-h-11 text-white underline"
                onClick={() => setRetry((value) => value + 1)}
              >
                Ponów
              </Button>
            </div>
          )}
          <div className="absolute bottom-3 left-3 right-3 bg-black/55 px-3 py-2 text-sm">
            {test.guideMode === "shared"
              ? "Przeciągnij linię na wspólny punkt odniesienia"
              : `Przeciągasz linię ${activeMarker + 1}: ${test.markers[activeMarker].label}`}
          </div>
        </div>

        <fieldset
          disabled={saving}
          className="m-0 min-w-0 space-y-3 overflow-y-auto border-0 bg-[#0b1c32] pb-3 pt-4 min-[640px]:landscape:col-start-2 min-[640px]:landscape:row-start-2 lg:col-start-2 lg:row-start-2"
        >
          <p className="text-sm leading-relaxed text-white/80" aria-live="polite">
            {test.markers[activeMarker].instruction}
          </p>
          <input
            type="range"
            min={trimStartFrame}
            max={trimEndFrame}
            value={currentFrame}
            onChange={(event) => setCurrentFrame(Number(event.target.value))}
            className="w-full accent-[#f4c84a]"
            aria-label="Wybór klatki"
          />

          <div className="grid grid-cols-4 gap-2">
            {[-10, -1, 1, 10].map((step) => (
              <Button
                key={step}
                type="button"
                variant="secondary"
                aria-label={`${step < 0 ? "Cofnij" : "Przejdź do przodu"} o ${Math.abs(step)} ${Math.abs(step) === 1 ? "klatkę" : "klatek"}`}
                onClick={() => move(step)}
                className="h-11 min-h-11 w-full bg-white/10 p-0 text-sm text-white hover:bg-white/20 active:bg-white/20"
              >
                {step < 0 ? <ChevronLeft className="mr-0.5 h-4 w-4" /> : null}
                {Math.abs(step)}
                {step > 0 ? <ChevronRight className="ml-0.5 h-4 w-4" /> : null}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setTrim(Math.min(currentFrame, trimEndFrame - 1), trimEndFrame);
              }}
              className="border-white/15 bg-transparent px-3 text-sm text-white hover:bg-white/10 hover:text-white"
            >
              <Crop className="mr-1.5 inline h-3.5 w-3.5" /> Początek klipu
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setTrim(trimStartFrame, Math.max(currentFrame, trimStartFrame + 1));
              }}
              className="border-white/15 bg-transparent px-3 text-sm text-white hover:bg-white/10 hover:text-white"
            >
              <Crop className="mr-1.5 inline h-3.5 w-3.5" /> Koniec klipu
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!frameReady || saving}
              onFocus={() => setActiveMarker(0)}
              onClick={() => {
                if (!frameReady || saving) return;
                setFirstFrame(currentFrame);
                setActiveMarker(0);
              }}
              className={`block h-auto px-3 py-3 text-left text-white hover:bg-white/10 hover:text-white disabled:opacity-40 ${
                firstFrame === currentFrame
                  ? "border-[#f4c84a] bg-[#f4c84a]/15"
                  : "border-white/15 bg-transparent"
              }`}
            >
              <span className="block text-sm text-white/55">1. Zaznacz</span>
              <span className="mt-0.5 block text-sm font-semibold">{firstMarker.label}</span>
              <span className="mt-1 block text-sm text-white/60">
                {firstFrame === null ? "Brak" : `Klatka ${firstFrame + 1}`}
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!frameReady || saving}
              onFocus={() => setActiveMarker(1)}
              onClick={() => {
                if (!frameReady || saving) return;
                setSecondFrame(currentFrame);
                setActiveMarker(1);
              }}
              className={`block h-auto px-3 py-3 text-left text-white hover:bg-white/10 hover:text-white disabled:opacity-40 ${
                secondFrame === currentFrame
                  ? "border-[#f4c84a] bg-[#f4c84a]/15"
                  : "border-white/15 bg-transparent"
              }`}
            >
              <span className="block text-sm text-white/55">2. Zaznacz</span>
              <span className="mt-0.5 block text-sm font-semibold">{secondMarker.label}</span>
              <span className="mt-1 block text-sm text-white/60">
                {secondFrame === null ? "Brak" : `Klatka ${secondFrame + 1}`}
              </span>
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-white/55">
            <span>
              <Flag className="mr-1 inline h-3.5 w-3.5" /> Zakres {trimStartFrame + 1}–
              {trimEndFrame + 1}
            </span>
            <span>
              <Gauge className="mr-1 inline h-3.5 w-3.5" /> {(1000 / capture.fps).toFixed(2)}{" "}
              ms/klatkę
            </span>
          </div>
        </fieldset>
        <footer className="bg-[#0b1c32] pb-3 pt-2 min-[640px]:landscape:col-start-2 min-[640px]:landscape:row-start-3 lg:col-start-2 lg:row-start-3">
          <Button
            type="button"
            disabled={!ready}
            onClick={() => {
              if (!ready || firstFrame === null || secondFrame === null) return;
              onComplete({
                firstFrame,
                secondFrame,
                trimStartFrame,
                trimEndFrame,
                firstGuidePosition: guidePositions[0],
                secondGuidePosition: guidePositions[1],
              });
            }}
            className="h-12 w-full bg-[#f4c84a] font-semibold text-[#071426] hover:bg-[#f4c84a]/90"
          >
            {saving ? "Zapisywanie…" : "Oblicz wynik"}
          </Button>
        </footer>
      </div>
    </div>
  );
}
