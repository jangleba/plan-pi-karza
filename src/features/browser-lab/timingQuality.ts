/** Recording resolution, never a claim about field accuracy or athlete performance. */
export const REVIEWED_TIMING_PROTOCOL = "ballwise-browser-lab-2.0";

export function eventGapLimit(fps: number) {
  // A lost image at 240 FPS must not inherit the tolerance of a 15 FPS clip.
  return Math.min(0.125, 1.6 / fps);
}

export function timingRecordingQuality(data: {
  fps: number;
  startSeconds: number;
  startPreviousSeconds: number;
  endSeconds: number;
  endPreviousSeconds: number;
  testId?: string;
}) {
  const jump = data.testId === "cmj" || data.testId === "single_leg_cmj";
  const largestGap = Math.max(
    data.startSeconds - data.startPreviousSeconds,
    data.endSeconds - data.endPreviousSeconds,
  );
  const incomplete =
    !Number.isFinite(data.fps) ||
    data.fps <= 0 ||
    !Number.isFinite(largestGap) ||
    largestGap <= 0 ||
    largestGap > eventGapLimit(data.fps) + 1e-7;
  return {
    status: incomplete
      ? ("incomplete" as const)
      : data.fps < 119
        ? ("indicative" as const)
        : ("reviewed" as const),
    largestGap,
    label: incomplete
      ? "Luka przy zdarzeniu"
      : data.fps < 119
        ? "Wynik orientacyjny"
        : "Klatki bez wykrytej luki",
    description: incomplete
      ? jump
        ? "Brakuje klatek przy wybiciu lub lądowaniu. Nagraj ponownie w dobrym świetle."
        : "Brakuje klatek przy starcie lub mecie. Nagraj ponownie w dobrym świetle."
      : data.fps < 119
        ? "Do porównania małych zmian nagraj oryginał w 120 lub 240 FPS."
        : jump
          ? "Wybicie i pierwszy kontakt sprawdzasz na filmie. Porównuj próby z podobną techniką."
          : "Start i metę sprawdzasz na filmie. Częstotliwość klatek nie określa całego błędu pomiaru.",
  };
}

export function resultRecordingQuality(data: Parameters<typeof timingRecordingQuality>[0]) {
  if (data.testId === "standing_long_jump")
    return {
      status: "indicative" as const,
      largestGap: 0,
      label: "Odległość z filmu",
      description:
        "Sprawdź kontakt pięty i porównaj odległość z taśmą. Czułość geometrii nie jest całkowitym błędem pomiaru.",
    };
  return timingRecordingQuality(data);
}

export function timingMethodLabel(method?: "manual" | "assisted") {
  return method === "assisted"
    ? "Start wskazany ręcznie · meta sprawdzona"
    : "Zdarzenia wskazane ręcznie";
}
