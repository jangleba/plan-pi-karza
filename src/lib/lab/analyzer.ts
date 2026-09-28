import type { LabMarkers } from "./types";

export function trimMarkers(markers: LabMarkers, start: number, end: number): LabMarkers {
  const retain = (frame: number | null) =>
    frame !== null && frame >= start && frame <= end ? frame : null;
  return {
    ...markers,
    trimStartFrame: start,
    trimEndFrame: end,
    firstFrame: retain(markers.firstFrame),
    secondFrame: retain(markers.secondFrame),
  };
}

export function containedVideoRect(
  width: number,
  height: number,
  videoWidth: number,
  videoHeight: number,
) {
  const scale = Math.min(width / videoWidth, height / videoHeight);
  const imageWidth = videoWidth * scale;
  const imageHeight = videoHeight * scale;
  return {
    left: (width - imageWidth) / 2,
    top: (height - imageHeight) / 2,
    width: imageWidth,
    height: imageHeight,
  };
}
