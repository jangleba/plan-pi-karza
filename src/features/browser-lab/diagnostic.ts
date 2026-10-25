import avcClip from "./__fixtures__/240fps-bframes.mp4?url";
import hevcClip from "./__fixtures__/240fps-hevc.mov?url";
import { createJumpFrameDecoder, openJumpVideo } from "./video";
import { timedMeasurement } from "./results";
export interface SafariCheck {
  date: string;
  secure: boolean;
  userAgent: string;
  avc: { passed: boolean; detail: string };
  hevc: { passed: boolean; detail: string };
  knownJumpCm: number | null;
}
export async function runSafariCheck(
  signal: AbortSignal,
  progress: (text: string) => void,
): Promise<SafariCheck> {
  const check: SafariCheck = {
    date: new Date().toISOString(),
    secure: globalThis.isSecureContext,
    userAgent: navigator.userAgent,
    avc: { passed: false, detail: "Nie sprawdzono" },
    hevc: { passed: false, detail: "Nie sprawdzono" },
    knownJumpCm: null,
  };
  for (const [codec, url, indices] of [
    ["avc", avcClip, [177, 4, 105, 359]],
    ["hevc", hevcClip, [177, 4, 105, 239]],
  ] as const) {
    signal.throwIfAborted();
    progress(
      `Sprawdzam ${codec === "avc" ? "H.264" : "HEVC"}: oryginalne czasy i kolejność klatek…`,
    );
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error("Nie można pobrać pliku kontrolnego. Sprawdź połączenie.");
      const blob = await response.blob();
      signal.throwIfAborted();
      const video = await openJumpVideo(
        new File([blob], codec === "avc" ? "kontrola.mp4" : "kontrola.mov"),
        signal,
      );
      if (Math.abs(video.timeline.fps - 240) > 0.001)
        throw new Error("Czasy klatek kontrolnych są nieprawidłowe.");
      const decoder = createJumpFrameDecoder(video, indices);
      try {
        for (const index of indices) {
          signal.throwIfAborted();
          const frame = await decoder.decode(index, signal);
          try {
            if (
              frame.timestamp !== video.timeline.frames[index].timestampUs ||
              frame.displayWidth !== 160 ||
              frame.displayHeight !== 120
            )
              throw new Error("Przeglądarka zwróciła niewłaściwą klatkę.");
            const canvas = document.createElement("canvas");
            canvas.width = 160;
            canvas.height = 120;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Przeglądarka nie wyświetla klatek.");
            context.drawImage(frame, 0, 0);
            if (!context.getImageData(0, 0, 160, 120).data.some((v, i) => i % 4 !== 3 && v > 20))
              throw new Error("Obraz klatki jest pusty.");
          } finally {
            frame.close();
          }
        }
      } finally {
        decoder.dispose();
      }
      const jump = timedMeasurement("cmj", video.timeline, 60, 164);
      if (Math.abs(jump.primaryValue - 23.01838680555555) > 1e-7)
        throw new Error("Kontrolne obliczenie czasu nie zgadza się.");
      if (codec === "avc") check.knownJumpCm = jump.primaryValue;
      check[codec] = {
        passed: true,
        detail: "4 klatki w losowej kolejności, PTS i obraz potwierdzone. 240 FPS.",
      };
    } catch (error) {
      signal.throwIfAborted();
      check[codec] = {
        passed: false,
        detail: error instanceof Error ? error.message : "Nie udało się odczytać klatek.",
      };
    }
  }
  return check;
}
