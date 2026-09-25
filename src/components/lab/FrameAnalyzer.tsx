import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Crop, Flag, Gauge, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadExactFrame } from "@/lib/lab/nativeCamera";
import type { LabMarkers, LabTestDefinition, NativeVideoCapture } from "@/lib/lab/types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function FrameAnalyzer({
  capture,
  test,
  onCancel,
  onComplete,
}: {
  capture: NativeVideoCapture;
  test: LabTestDefinition;
  onCancel: () => void;
  onComplete: (markers: LabMarkers) => void;
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
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [loadingFrame, setLoadingFrame] = useState(true);
  const [frameError, setFrameError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;
    const timeout = window.setTimeout(() => {
      setLoadingFrame(true);
      setFrameError(null);
      void loadExactFrame(capture.path, currentFrame)
        .then((response) => {
          if (requestId === requestRef.current && response?.dataUrl) setFrameUrl(response.dataUrl);
        })
        .catch(() => {
          if (requestId === requestRef.current) setFrameError("Nie można odczytać tej klatki.");
        })
        .finally(() => {
          if (requestId === requestRef.current) setLoadingFrame(false);
        });
    }, 45);
    return () => window.clearTimeout(timeout);
  }, [capture.path, currentFrame]);

  function move(frames: number) {
    setCurrentFrame((value) => clamp(value + frames, trimStartFrame, trimEndFrame));
  }

  function updateGuide(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const value =
      test.guideAxis === "vertical"
        ? (event.clientX - bounds.left) / bounds.width
        : (event.clientY - bounds.top) / bounds.height;
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
  const ready = firstFrame !== null && secondFrame !== null && secondFrame > firstFrame;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-[#071426] text-white">
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
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
        className="relative min-h-0 flex-1 touch-none overflow-hidden bg-black"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateGuide(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) updateGuide(event);
        }}
      >
        {frameUrl ? (
          <img
            src={frameUrl}
            alt="Dokładna klatka nagrania"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-white/60">
            Ładowanie klatki…
          </div>
        )}
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
        {loadingFrame && (
          <div className="absolute right-3 top-3 h-2 w-2 animate-pulse rounded-full bg-[#f4c84a]" />
        )}
        {frameError && (
          <div className="absolute inset-x-4 top-4 rounded-xl bg-red-600/90 px-4 py-3 text-center text-xs">
            {frameError}
          </div>
        )}
        <div className="absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1.5 text-[11px] backdrop-blur">
          {test.guideMode === "shared"
            ? "Przeciągnij linię na wspólny punkt odniesienia"
            : `Przeciągasz linię ${activeMarker + 1}: ${test.markers[activeMarker].label}`}
        </div>
      </div>

      <section className="space-y-3 bg-[#0b1c32] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
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
              setTrimStartFrame(Math.min(currentFrame, trimEndFrame - 1));
              if (firstFrame !== null && firstFrame < currentFrame) setFirstFrame(null);
            }}
            className="rounded-xl border border-white/15 px-3 py-2.5 text-xs"
          >
            <Crop className="mr-1.5 inline h-3.5 w-3.5" /> Początek klipu
          </button>
          <button
            type="button"
            onClick={() => {
              setTrimEndFrame(Math.max(currentFrame, trimStartFrame + 1));
              if (secondFrame !== null && secondFrame > currentFrame) setSecondFrame(null);
            }}
            className="rounded-xl border border-white/15 px-3 py-2.5 text-xs"
          >
            <Crop className="mr-1.5 inline h-3.5 w-3.5" /> Koniec klipu
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setFirstFrame(currentFrame);
              setActiveMarker(0);
            }}
            className={`rounded-xl border px-3 py-3 text-left ${
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
            onClick={() => {
              setSecondFrame(currentFrame);
              setActiveMarker(1);
            }}
            className={`rounded-xl border px-3 py-3 text-left ${
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
            if (firstFrame === null || secondFrame === null) return;
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
          Oblicz wynik
        </Button>
      </section>
    </div>
  );
}
