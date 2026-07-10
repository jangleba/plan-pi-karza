import { Play, Pause, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";

const FPS_OPTIONS = [30, 60, 120, 240];

interface Props {
  fps: number;
  onFpsChange: (fps: number) => void;
  playing: boolean;
  onPlayPause: () => void;
  onStep: (deltaFrames: number) => void;
  currentTime: number;
  currentFrame: number;
}

/** Sterowanie klatkami: play/pause, ±1, ±5, FPS, aktualny czas i klatka. */
export function FrameControls({
  fps,
  onFpsChange,
  playing,
  onPlayPause,
  onStep,
  currentTime,
  currentFrame,
}: Props) {
  const custom = !FPS_OPTIONS.includes(fps);
  return (
    <div className="space-y-3">
      {/* FPS */}
      <div className="soft-card p-3">
        <div className="mb-2 text-xs font-semibold text-foreground">FPS filmu</div>
        <div className="flex flex-wrap gap-2">
          {FPS_OPTIONS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFpsChange(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
                fps === f ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
              }`}
            >
              {f}
            </button>
          ))}
          <input
            type="number"
            min={1}
            placeholder="custom"
            value={custom ? fps : ""}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v > 0) onFpsChange(v);
            }}
            className={`w-20 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              custom ? "border-primary bg-accent text-foreground" : "border-border bg-secondary text-secondary-foreground"
            }`}
          />
        </div>
      </div>

      {/* Czas + klatka */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="soft-card p-3">
          <div className="text-[11px] text-muted-foreground">Czas filmu</div>
          <div className="text-sm font-semibold text-foreground">{currentTime.toFixed(3)} s</div>
        </div>
        <div className="soft-card p-3">
          <div className="text-[11px] text-muted-foreground">Aktualna klatka</div>
          <div className="text-sm font-semibold text-foreground">{currentFrame}</div>
        </div>
      </div>

      {/* Transport */}
      <div className="flex items-center justify-between gap-2">
        <StepBtn label="-5" Icon={ChevronsLeft} onClick={() => onStep(-5)} />
        <StepBtn label="-1" Icon={ChevronLeft} onClick={() => onStep(-1)} />
        <button
          type="button"
          onClick={onPlayPause}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground active:scale-95"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <StepBtn label="+1" Icon={ChevronRight} onClick={() => onStep(1)} />
        <StepBtn label="+5" Icon={ChevronsRight} onClick={() => onStep(5)} />
      </div>
    </div>
  );
}

function StepBtn({
  label,
  Icon,
  onClick,
}: {
  label: string;
  Icon: typeof ChevronRight;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-secondary py-2 text-[11px] font-semibold text-secondary-foreground active:scale-95"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
