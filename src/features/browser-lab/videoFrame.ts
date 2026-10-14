import type { JumpVideo } from "./video";

export interface PaintedFrame {
  width: number;
  height: number;
  aspect: number;
}

/** Paints the decoded pixels in the container's display orientation. The same
 * function is used by the editor and automatic analysis so their coordinates
 * cannot silently diverge. */
export function paintVideoFrame(
  target: HTMLCanvasElement,
  frame: VideoFrame,
  rotation: JumpVideo["rotation"],
  maxDimension = 1280,
): PaintedFrame {
  const width = frame.displayWidth;
  const height = frame.displayHeight;
  const swapped = rotation === 90 || rotation === 270;
  const displayedWidth = swapped ? height : width;
  const displayedHeight = swapped ? width : height;
  const scale = Math.min(1, maxDimension / Math.max(displayedWidth, displayedHeight));
  target.width = Math.max(1, Math.round(displayedWidth * scale));
  target.height = Math.max(1, Math.round(displayedHeight * scale));
  const context = target.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Nie można wyświetlić klatki. Odśwież Safari.");
  context.save();
  context.clearRect(0, 0, target.width, target.height);
  context.translate(target.width / 2, target.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(
    frame,
    (-width * scale) / 2,
    (-height * scale) / 2,
    width * scale,
    height * scale,
  );
  context.restore();
  return { width: target.width, height: target.height, aspect: displayedWidth / displayedHeight };
}
