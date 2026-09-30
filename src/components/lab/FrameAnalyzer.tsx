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
    <div className="fixed inset-0 z-[120] grid grid-rows-[auto_minmax(0,1fr)_auto] bg-[#071426] text-white landscape:grid-cols-[minmax(0,1fr)_20rem] landscape:grid-rows-[auto_minmax(0,1fr)]">
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] landscape:col-span-2">
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="grid h-11 w-11 place-items-center rounded-full bg-white/10"
          aria-label="Anuluj analizę"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="text-[15px] font-semibold">{test.title}</p>
          <p className="text-xs text-white/60">
            Klatka {currentFrame + 1} / {capture.frameCount}
          </p>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-2 text-xs font-semibold">
          {capture.fps.toFixed(0)} FPS
        </span>
      </header>

      <div
        ref={viewerRef}
        className="relative min-h-0 flex-1 touch-none overflow-hidden bg-black"
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
          <div className="absolute inset-x-4 top-4 rounded-xl bg-red-600/90 px-4 py-3 text-center text-xs">
            {frameError}
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => setRetry((value) => value + 1)}
            >
              Ponów
            </button>
          </div>
        )}
        <div className="absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1.5 text-[11px] backdrop-blur">
          {test.guideMode === "shared"
            ? "Przeciągnij linię na wspólny punkt odniesienia"
            : `Przeciągasz linię ${activeMarker + 1}: ${test.markers[activeMarker].label}`}
        </div>
      </div>

      <fieldset
        disabled={saving}
        className="m-0 max-h-[55dvh] min-w-0 space-y-3 overflow-y-auto border-0 bg-[#0b1c32] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 landscape:col-start-2 landscape:row-start-2 landscape:max-h-full"
      >
        <p className="text-xs leading-relaxed text-white/80" aria-live="polite">
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
            <button
              key={step}
              type="button"
              onClick={() => move(step)}
              className="flex h-11 items-center justify-center rounded-xl bg-white/10 text-sm font-semibold active:bg-white/20"
            >
              {step < 0 ? <ChevronLeft className="mr-0.5 h-4 w-4" /> : null}
              {Math.abs(step)}
              {step > 0 ? <ChevronRight className="ml-0.5 h-4 w-4" /> : null}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setTrim(Math.min(currentFrame, trimEndFrame - 1), trimEndFrame);
            }}
            className="rounded-xl border border-white/15 px-3 py-2.5 text-xs"
          >
            <Crop className="mr-1.5 inline h-3.5 w-3.5" /> Początek klipu
          </button>
          <button
            type="button"
            onClick={() => {
              setTrim(trimStartFrame, Math.max(currentFrame, trimStartFrame + 1));
            }}
            className="rounded-xl border border-white/15 px-3 py-2.5 text-xs"
          >
            <Crop className="mr-1.5 inline h-3.5 w-3.5" /> Koniec klipu
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!frameReady || saving}
            onFocus={() => setActiveMarker(0)}
            onClick={() => {
              if (!frameReady || saving) return;
              setFirstFrame(currentFrame);
              setActiveMarker(0);
            }}
            className={`rounded-xl border px-3 py-3 text-left disabled:opacity-40 ${
              firstFrame === currentFrame ? "border-[#f4c84a] bg-[#f4c84a]/15" : "border-white/15"
            }`}
          >
            <span className="block text-[11px] text-white/55">1. Zaznacz</span>
            <span className="mt-0.5 block text-sm font-semibold">{firstMarker.label}</span>
            <span className="mt-1 block text-[11px] text-white/60">
              {firstFrame === null ? "Brak" : `Klatka ${firstFrame + 1}`}
            </span>
          </button>
          <button
            type="button"
            disabled={!frameReady || saving}
            onFocus={() => setActiveMarker(1)}
            onClick={() => {
              if (!frameReady || saving) return;
              setSecondFrame(currentFrame);
              setActiveMarker(1);
            }}
            className={`rounded-xl border px-3 py-3 text-left disabled:opacity-40 ${
              secondFrame === currentFrame ? "border-[#f4c84a] bg-[#f4c84a]/15" : "border-white/15"
            }`}
          >
            <span className="block text-[11px] text-white/55">2. Zaznacz</span>
            <span className="mt-0.5 block text-sm font-semibold">{secondMarker.label}</span>
            <span className="mt-1 block text-[11px] text-white/60">
              {secondFrame === null ? "Brak" : `Klatka ${secondFrame + 1}`}
            </span>
          </button>
        </div>

        <div className="flex items-center justify-between text-[11px] text-white/55">
          <span>
            <Flag className="mr-1 inline h-3.5 w-3.5" /> Zakres {trimStartFrame + 1}–
            {trimEndFrame + 1}
          </span>
          <span>
            <Gauge className="mr-1 inline h-3.5 w-3.5" /> {(1000 / capture.fps).toFixed(2)}{" "}
            ms/klatkę
          </span>
        </div>

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
          className="h-12 w-full rounded-full bg-[#f4c84a] font-semibold text-[#071426] hover:bg-[#f4c84a]/90"
        >
          {saving ? "Zapisywanie…" : "Oblicz wynik"}
        </Button>
      </fieldset>
    </div>
  );
}
