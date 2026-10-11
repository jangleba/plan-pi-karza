export const GRAVITY = 9.80665;

export interface TimedSample {
  cts: number;
  timescale: number;
  duration: number;
}

export interface JumpTimeline {
  /** Presentation order, never decoder callback order. */
  frames: { sampleIndex: number; seconds: number; timestampUs: number }[];
  fps: number;
  intervalSeconds: number;
  durationSeconds: number;
}

export function buildJumpTimeline(samples: readonly TimedSample[]): JumpTimeline {
  if (samples.length < 3 || samples.length > 6500)
    throw new Error("Wybierz krótkie nagranie jednej próby (maksymalnie 20 sekund).");
  const timescale = samples[0].timescale;
  if (
    !Number.isSafeInteger(timescale) ||
    timescale <= 0 ||
    samples.some(
      (s) =>
        s.timescale !== timescale ||
        !Number.isSafeInteger(s.cts) ||
        !Number.isSafeInteger(s.duration) ||
        s.duration <= 0,
    )
  )
    throw new Error("Film nie ma poprawnych czasów klatek. Wybierz oryginalny plik.");
  const ordered = samples
    .map((s, sampleIndex) => ({ sampleIndex, ticks: s.cts }))
    .sort((a, b) => a.ticks - b.ticks);
  const origin = ordered[0].ticks;
  const frames = ordered.map((s) => ({
    sampleIndex: s.sampleIndex,
    seconds: (s.ticks - origin) / timescale,
    timestampUs: Math.round(((s.ticks - origin) * 1_000_000) / timescale),
  }));
  const gaps = frames.slice(1).map((f, i) => f.seconds - frames[i].seconds);
  if (gaps.some((gap, i) => gap <= 0 || frames[i + 1].timestampUs <= frames[i].timestampUs))
    throw new Error("Film ma powtórzone czasy klatek. Pomiar jest zablokowany.");
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const intervalSeconds = sortedGaps[Math.floor(sortedGaps.length / 2)];
  const fps = 1 / intervalSeconds;
  if (fps < 119 || fps > 300)
    throw new Error(
      "Film ma mniej niż 120 klatek/s albo zmienione tempo. Nagraj krótki film w 120 lub 240 FPS i wybierz oryginał, bez eksportowania slow motion.",
    );
  if (gaps.some((gap) => gap > intervalSeconds * 1.6 || gap < intervalSeconds * 0.6))
    throw new Error(
      "Czasy klatek mają przerwy lub zmienne tempo. Wybierz inne, oryginalne nagranie.",
    );
  const durationSeconds =
    frames.at(-1)!.seconds + samples[frames.at(-1)!.sampleIndex].duration / timescale;
  if (durationSeconds > 20.05)
    throw new Error("Film jest za długi. Nagraj nowy, krótki klip jednej próby (do 20 sekund).");
  return { frames, fps, intervalSeconds, durationSeconds };
}

export function measureJump(timeline: JumpTimeline, takeoff: number, landing: number) {
  if (
    !Number.isInteger(takeoff) ||
    !Number.isInteger(landing) ||
    takeoff < 1 ||
    landing >= timeline.frames.length ||
    landing <= takeoff
  )
    throw new Error(
      "Zaznacz wybicie i późniejsze lądowanie. Przed wybiciem musi być widoczna poprzednia klatka.",
    );
  // Both events use the first frame after the transition: first airborne / first contact.
  const flightSeconds = timeline.frames[landing].seconds - timeline.frames[takeoff].seconds;
  if (flightSeconds < 0.15 || flightSeconds > 1.1)
    throw new Error("Czas lotu jest nietypowy dla CMJ. Sprawdź klatki wybicia i lądowania.");
  // Exact event times lie in the adjacent-frame brackets. This is temporal resolution,
  // not a confidence interval or the total biomechanical error of flight-time height.
  const minSeconds = timeline.frames[landing - 1].seconds - timeline.frames[takeoff].seconds;
  const maxSeconds = timeline.frames[landing].seconds - timeline.frames[takeoff - 1].seconds;
  const height = (t: number) => ((GRAVITY * t * t) / 8) * 100;
  return {
    flightSeconds,
    heightCm: height(flightSeconds),
    frameCount: landing - takeoff,
    resolutionMinCm: height(Math.max(0, minSeconds)),
    resolutionMaxCm: height(maxSeconds),
  };
}

export function validateEdits(
  edits: readonly { media_rate_integer: number; media_rate_fraction: number }[] = [],
) {
  if (edits.some((edit) => edit.media_rate_integer !== 1 || edit.media_rate_fraction !== 0))
    throw new Error(
      "Film zawiera zmianę tempa slow motion. Potrzebny jest oryginalny plik z kamery.",
    );
}
