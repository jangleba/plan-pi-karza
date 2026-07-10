import { forwardRef } from "react";

interface Props {
  src: string | null;
  onLoadedMetadata: (duration: number) => void;
  onTimeUpdate: (t: number) => void;
}

/** Odtwarzacz filmu do analizy klatkowej. Ref przekazywany z analizatora. */
export const FrameVideoPlayer = forwardRef<HTMLVideoElement, Props>(
  function FrameVideoPlayer({ src, onLoadedMetadata, onTimeUpdate }, ref) {
    if (!src) {
      return (
        <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-dashed border-border bg-card text-center text-sm text-muted-foreground">
          Brak filmu. Wróć do uploadu i wybierz plik.
        </div>
      );
    }
    return (
      <video
        ref={ref}
        src={src}
        playsInline
        preload="auto"
        className="w-full rounded-2xl bg-black"
        onLoadedMetadata={(e) => onLoadedMetadata(e.currentTarget.duration)}
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
      />
    );
  },
);
