/** Pomiar z klatek wideo: czasy z numerów klatek i fps. */

/** Czas lotu (s) z numerów klatek odbicia i lądowania. */
export function flightTimeFromFrames(takeoff: number, landing: number, fps: number): number {
  if (!(fps > 0) || landing <= takeoff) throw new RangeError("Lądowanie musi być po odbiciu");
  return (landing - takeoff) / fps;
}

/** Czasy (s) od klatki startu do kolejnych znaczników (10, 20, 30 m). */
export function splitsFromFrames(start: number, marks: number[], fps: number): number[] {
  if (!(fps > 0)) throw new RangeError("fps musi być dodatnie");
  let prev = start;
  return marks.map((m) => {
    if (m <= prev) throw new RangeError("Znaczniki muszą rosnąć");
    prev = m;
    return (m - start) / fps;
  });
}

/**
 * fps ze średniej różnicy czasu na całym odcinku (znaczniki czasu w plikach bywają
 * zaokrąglone do 1 ms, więc mediana różnic dawałaby 125 zamiast 120 klatek/s).
 * Wymaga kolejnych klatek bez pominięć – dlatego odtwarzanie jest spowolnione.
 */
export function estimateFps(mediaTimes: number[]): number | null {
  if (mediaTimes.length < 4) return null;
  const span = mediaTimes[mediaTimes.length - 1]! - mediaTimes[0]!;
  return span > 0 ? (mediaTimes.length - 1) / span : null;
}

/** Zaokrągla do najbliższego standardowego fps, jeśli różnica jest niewielka. */
export function snapFps(fps: number): number {
  const std = [24, 25, 30, 50, 60, 100, 120, 240];
  const near = std.find((s) => Math.abs(s - fps) / s < 0.06);
  return near ?? Math.round(fps * 10) / 10;
}

/** Rozdzielczość czasowa jednej klatki (ms). */
export function frameMs(fps: number): number {
  return 1000 / fps;
}
