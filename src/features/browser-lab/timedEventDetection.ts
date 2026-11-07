import type { DetectedPose } from "./pose";
import type { JumpTimeline } from "./measurement";
import type { BrowserTestId, TestSide } from "./protocols";
import { protocolFor } from "./protocols";

export type TimedTestId = Exclude<BrowserTestId, "standing_long_jump">;
export type TimedPoseFrame = DetectedPose & { frameIndex: number };
export interface TimedEventProposal {
  /** A search anchor, not an automatically accepted first movement. */
  start: number;
  /** Sprint starts are chosen manually, beginning before the movement threshold. */
  startReviewFrom?: number;
  endReviewFrom?: number;
  end: number;
  turn?: number;
  confidence: number;
  method: "pose-proposal-v1";
  focus: { start: [number, number]; end: [number, number]; turn?: [number, number] };
}
export const medianOf = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const torso = (p: DetectedPose) => (p.hip[0] + p.shoulders[0]) / 2;
const footY = (p: DetectedPose, side: TestSide) =>
  side
    ? Math.max(p.heels[side === "left" ? 0 : 1][1], p.toes[side === "left" ? 0 : 1][1])
    : Math.max(...p.heels.map((p) => p[1]), ...p.toes.map((p) => p[1]));

/** Proposals only. Pose landmarks do not establish sub-frame contact or camera accuracy. */
export function selectTimedEvents(
  test: TimedTestId,
  timeline: JumpTimeline,
  input: readonly TimedPoseFrame[],
  side: TestSide,
  line?: number,
  imageSize?: { width: number; height: number },
): TimedEventProposal {
  const unique = new Map(
    input
      .filter((p) => p.confidence >= 0.58 && Number.isFinite(p.bodyHeight) && p.bodyHeight >= 0.16)
      .map((p) => [p.frameIndex, p]),
  );
  const frames = [...unique.values()].sort((a, b) => a.frameIndex - b.frameIndex);
  if (frames.length < 8 || frames.some((p) => !timeline.frames[p.frameIndex]))
    throw new Error("Za mało wyraźnych klatek sylwetki. Możesz oznaczyć zdarzenia ręcznie.");
  const seconds = (p: TimedPoseFrame) => timeline.frames[p.frameIndex].seconds;
  const first = seconds(frames[0]),
    baseline = frames.filter((p) => seconds(p) - first <= 0.3);
  const h = medianOf(frames.map((p) => p.bodyHeight));
  const horizontalHeight = h * (imageSize ? imageSize.height / imageSize.width : 1);
  let start: TimedPoseFrame | undefined,
    end: TimedPoseFrame | undefined,
    turn: TimedPoseFrame | undefined;
  if (test === "cmj" || test === "single_leg_cmj") {
    if (test === "single_leg_cmj" && !side) throw new Error("Wybierz nogę podporową.");
    if (baseline.length < 3 || seconds(baseline.at(-1)!) - first < 0.16)
      throw new Error("Pokaż chwilę spokojnego stania przed skokiem.");
    const ys = baseline.map((p) => footY(p, side)),
      floor = medianOf(ys);
    if (Math.max(...ys) - Math.min(...ys) > h * 0.04)
      throw new Error("Nie widzę stabilnego podłoża przed skokiem. Oznacz klatki ręcznie.");
    const airborne = (p: TimedPoseFrame) => footY(p, side) < floor - Math.max(0.004, h * 0.012);
    const windows: { start: TimedPoseFrame; end: TimedPoseFrame }[] = [];
    let lift: TimedPoseFrame | undefined;
    for (const p of frames) {
      if (airborne(p) && !lift) lift = p;
      else if (!airborne(p) && lift) {
        const duration = seconds(p) - seconds(lift);
        if (duration >= 0.12 && duration <= 1.15) windows.push({ start: lift, end: p });
        lift = undefined;
      }
    }
    if (windows.length !== 1 || lift)
      throw new Error(
        "Potrzebny jest jeden wyraźny skok z widocznym wybiciem i lądowaniem. Możesz oznaczyć je ręcznie.",
      );
    ({ start, end } = windows[0]);
    if (test === "single_leg_cmj") {
      const other = side === "left" ? "right" : "left";
      if (
        frames.some(
          (p) =>
            p.frameIndex > start!.frameIndex &&
            p.frameIndex < end!.frameIndex &&
            footY(p, other) >= floor - Math.max(0.004, h * 0.012),
        )
      )
        throw new Error(
          "Możliwy kontakt drugiej stopy. Sprawdź próbę ręcznie lub nagraj ponownie.",
        );
    }
    const after = frames.filter((p) => seconds(p) > seconds(end!) + 0.08);
    if (
      after.length < 2 ||
      Math.abs(medianOf(after.slice(-4).map((p) => footY(p, side))) - floor) > h * 0.04
    )
      throw new Error("Nie widzę powrotu stopy na to samo podłoże. Sprawdź nagranie ręcznie.");
    if (
      Math.max(...frames.map((p) => p.hip[0])) - Math.min(...frames.map((p) => p.hip[0])) >
      horizontalHeight * 0.35
    )
      throw new Error(
        "Wykryłem zbyt duży ruch w bok lub ruch telefonu. Wybierz skok pionowy albo oznacz klatki ręcznie.",
      );
  } else {
    if (line === undefined || !Number.isFinite(line) || line < 0.03 || line > 0.97)
      throw new Error("Najpierw ustaw linię pomiarową na obrazie.");
    const crossings: { before: TimedPoseFrame; after: TimedPoseFrame; dir: number }[] = [];
    for (let i = 1; i < frames.length; i++) {
      const a = torso(frames[i - 1]) - line,
        b = torso(frames[i]) - line;
      if ((a * b < 0 || (b === 0 && a !== 0)) && Math.abs(b - a) > 1e-7) {
        const dir = Math.sign(b - a),
          next = frames[i + 1];
        if (next && (torso(next) - line) * dir >= 0)
          crossings.push({ before: frames[i - 1], after: frames[i], dir });
      }
    }
    if (test === "sprint_10m") {
      if (baseline.length < 3) throw new Error("Pokaż spokojną pozycję przed startem.");
      const xs = baseline.map(torso),
        origin = medianOf(xs),
        dir = Math.sign(torso(frames.at(-1)!) - origin);
      const spread = Math.max(...xs) - Math.min(...xs);
      if (spread > horizontalHeight * 0.05 || !dir)
        throw new Error("Nie widzę stabilnej pozycji startowej. Zaznacz pierwszy ruch ręcznie.");
      const motionThreshold = Math.max(
        horizontalHeight * 0.005,
        spread * 1.8,
        1 / (imageSize?.width ?? 1280),
      );
      start = frames.find(
        (p, i) =>
          seconds(p) > first + 0.2 &&
          (torso(p) - origin) * dir > motionThreshold &&
          frames[i + 1] &&
          (torso(frames[i + 1]) - origin) * dir > motionThreshold,
      );
      if (!start) throw new Error("Nie widzę wyraźnego rozpoczęcia biegu.");
      const exits = crossings.filter((c) => c.dir === dir && seconds(c.after) > seconds(start!));
      if (exits.length !== 1)
        throw new Error("Nie widzę jednego przecięcia mety. Sprawdź linię i klatki ręcznie.");
      end = exits[0].after;
    } else {
      const pairs = crossings.flatMap((a, i) =>
        crossings
          .slice(i + 1)
          .filter((b) => a.dir !== b.dir && seconds(b.after) - seconds(a.after) >= 1)
          .map((b) => [a, b] as const),
      );
      if (pairs.length !== 1)
        throw new Error(
          "Nie widzę pojedynczego wejścia i powrotu przez tę samą linię. Oznacz 505 ręcznie.",
        );
      const [a, b] = pairs[0];
      start = a.after;
      end = b.after;
      const middle = frames.filter(
        (p) => p.frameIndex > start!.frameIndex && p.frameIndex < end!.frameIndex,
      );
      turn = [...middle].sort((p, q) => Math.abs(torso(q) - line) - Math.abs(torso(p) - line))[0];
      if (!turn || Math.abs(torso(turn) - line) < horizontalHeight * 0.2)
        throw new Error("Nawrót jest nieczytelny. Wskaż kontakt nogi na linii nawrotu.");
    }
  }
  if (!start || !end) throw new Error("Nie udało się zaproponować obu zdarzeń.");
  const elapsed = seconds(end) - seconds(start),
    protocol = protocolFor(test);
  if (
    start.frameIndex < 1 ||
    elapsed < protocol.minimumSeconds ||
    elapsed > protocol.maximumSeconds
  )
    throw new Error("Proponowany czas nie pasuje do testu. Sprawdź oznaczenia ręcznie.");
  const focus = (p: TimedPoseFrame, feet: boolean): [number, number] =>
    feet
      ? [
          side ? p.heels[side === "left" ? 0 : 1][0] : (p.heels[0][0] + p.heels[1][0]) / 2,
          footY(p, side),
        ]
      : [torso(p), (p.hip[1] + p.shoulders[1]) / 2];
  const jumping = test === "cmj" || test === "single_leg_cmj";
  return {
    start: start.frameIndex,
    ...(test === "sprint_10m" || jumping
      ? {
          startReviewFrom: Math.max(
            1,
            timeline.frames.findIndex(
              (frame) => frame.seconds >= Math.max(first, seconds(start) - (jumping ? 0.12 : 0.35)),
            ),
          ),
        }
      : {}),
    ...(jumping
      ? {
          endReviewFrom: Math.max(
            start.frameIndex + 1,
            timeline.frames.findIndex((frame) => frame.seconds >= seconds(end) - 0.08),
          ),
        }
      : {}),
    end: end.frameIndex,
    ...(turn ? { turn: turn.frameIndex } : {}),
    confidence: Math.min(start.confidence, end.confidence, turn?.confidence ?? 1),
    method: "pose-proposal-v1",
    focus: {
      start: focus(start, jumping),
      end: focus(end, jumping),
      ...(turn ? { turn: focus(turn, true) } : {}),
    },
  };
}
