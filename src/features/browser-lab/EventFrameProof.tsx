import { useEffect, useRef, useState } from "react";
import { createJumpFrameDecoder, type OpenedVideo } from "./video";
import { paintVideoFrame } from "./videoFrame";
import { messageOf } from "./LabUI";

/** Adjacent original frames, cropped for visibility. Never replaces them with pose artwork. */
export function EventFrameProof({
  video,
  index,
  focus,
  onReady,
  line,
}: {
  video: OpenedVideo;
  index: number;
  focus: [number, number];
  onReady: (ready: boolean) => void;
  line?: number;
}) {
  const before = useRef<HTMLCanvasElement>(null),
    after = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  const [x, y] = focus;
  useEffect(() => {
    const controller = new AbortController(),
      decoder = createJumpFrameDecoder(video, [index - 1, index]);
    const scratch = document.createElement("canvas");
    let live = true;
    onReady(false);
    setError("");
    void (async () => {
      if (index < 1) throw new Error("Brakuje poprzedniej klatki.");
      for (const [target, i] of [
        [before.current, index - 1],
        [after.current, index],
      ] as const) {
        if (!target) throw new Error("Podgląd nie jest gotowy.");
        const frame = await decoder.decode(i, controller.signal);
        try {
          if (!live || controller.signal.aborted) return;
          paintVideoFrame(scratch, frame, video.rotation, 4096);
          const size = Math.min(scratch.width, scratch.height) * 0.14,
            width = (size * 4) / 3;
          const left = Math.max(0, Math.min(scratch.width - width, x * scratch.width - width / 2));
          const top = Math.max(0, Math.min(scratch.height - size, y * scratch.height - size / 2));
          target.width = 320;
          target.height = 240;
          const ctx = target.getContext("2d");
          if (!ctx) throw new Error("Nie można wyświetlić klatek.");
          ctx.drawImage(scratch, left, top, width, size, 0, 0, 320, 240);
          if (line !== undefined) {
            const at = ((line * scratch.width - left) / width) * 320;
            if (at >= 0 && at <= 320) {
              ctx.beginPath();
              ctx.moveTo(at, 0);
              ctx.lineTo(at, 240);
              ctx.strokeStyle = "#0b4978";
              ctx.lineWidth = 2;
              ctx.stroke();
            }
          }
        } finally {
          frame.close();
        }
      }
      if (live) onReady(true);
    })().catch((reason) => {
      if (live && !controller.signal.aborted) setError(messageOf(reason));
    });
    return () => {
      live = false;
      controller.abort();
      decoder.dispose();
      scratch.width = 0;
      scratch.height = 0;
    };
  }, [video, index, x, y, onReady, line]);
  return (
    <section className="bl-event-proof" aria-label="Porównaj sąsiednie klatki">
      <figure>
        <canvas ref={before} aria-label="Klatka przed zdarzeniem" />
        <figcaption>Poprzednia · {index}</figcaption>
      </figure>
      <figure>
        <canvas ref={after} aria-label="Wybrana klatka zdarzenia" />
        <figcaption>Wybrana · {index + 1}</figcaption>
      </figure>
      {error && <p role="alert">{error} Przejdź do ręcznego oznaczania.</p>}
    </section>
  );
}
