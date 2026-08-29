import { describe, it, expect } from "vitest";
import { TimingLineRegistry } from "../timingPlane";
import { computeSprintSplits, buildVelocityProfile } from "./splits";
import { detectSprintPhases } from "./phases";
import { analyzeSprintMechanics } from "./mechanics";
import { selectSprintLimiter, NO_LIMITER_MESSAGE } from "./limiter";
import { recommendationForLimiter } from "./recommendations";
import type { SprintMechanics, MechanicMetric, SprintSplit } from "./types";
import type { FramePose, Landmark, TimingLineSpec } from "../types";
import { POSE } from "../types";
import type { Homography } from "../calibrationProfiles";
import type { CalculationBasis } from "@/lib/vision/types";

/** Homografia world(mm)→image(px): u = 0.03·x + 100 (jak w sprintTiming.test). */
const H: Homography = [0.03, 0, 100, 0, 0.03, 0, 0, 0, 1];
const WIDTH = 1000;
const HEIGHT = 1000;

function line(id: string, role: TimingLineSpec["role"], x: number): TimingLineSpec {
  return {
    id,
    role,
    groundStartPointMm: { x, y: 0 },
    groundEndPointMm: { x, y: 3000 },
    direction: "forward",
  };
}

function lm(x: number, y: number, vis = 1): Landmark {
  return { x, y, z: 0, visibility: vis };
}

function buildPoses(opts?: {
  frames?: number;
  fps?: number;
  silhouetteHeight?: number;
  visibility?: number;
  stride?: boolean;
}): FramePose[] {
  const frames = opts?.frames ?? 80;
  const fps = opts?.fps ?? 240;
  const sil = opts?.silhouetteHeight ?? 0.6;
  const vis = opts?.visibility ?? 1;
  const intervalUs = Math.round(1_000_000 / fps);
  const poses: FramePose[] = [];
  for (let i = 0; i < frames; i++) {
    const t = i / (frames - 1);
    // Ruch przyspieszający: pozycja rośnie kwadratowo → realne fazy.
    const normX = 0.02 + 0.73 * (t * t * 0.6 + t * 0.4);
    const topY = 0.2;
    const bottomY = topY + sil;
    const arr: Landmark[] = new Array(33).fill(null).map(() => lm(normX, 0.5, vis));
    arr[POSE.NOSE] = lm(normX, topY, vis);
    arr[POSE.LEFT_SHOULDER] = lm(normX + 0.02, 0.4, vis);
    arr[POSE.RIGHT_SHOULDER] = lm(normX + 0.02, 0.4, vis);
    arr[POSE.LEFT_HIP] = lm(normX, 0.55, vis);
    arr[POSE.RIGHT_HIP] = lm(normX, 0.55, vis);
    arr[POSE.LEFT_KNEE] = lm(normX, 0.68, vis);
    arr[POSE.RIGHT_KNEE] = lm(normX, 0.68, vis);
    const swing = opts?.stride === false ? 0 : Math.sin(i * 0.6) * 0.03;
    arr[POSE.LEFT_ANKLE] = lm(normX, bottomY + swing, vis);
    arr[POSE.RIGHT_ANKLE] = lm(normX, bottomY - swing, vis);
    arr[POSE.LEFT_FOOT_INDEX] = lm(normX + 0.01, bottomY + swing, vis);
    arr[POSE.RIGHT_FOOT_INDEX] = lm(normX + 0.01, bottomY - swing, vis);
    poses.push({
      frameIndex: i,
      sourceFrameIndex: i,
      mediaTime: (i * intervalUs) / 1_000_000,
      presentationTimestamp: (i * intervalUs) / 1_000_000,
      sourceTimestampUs: i * intervalUs,
      landmarks: arr,
      peopleCount: 1,
      trackingConfidence: 0.9,
    });
  }
  return poses;
}

const SPLIT_LINES: TimingLineSpec[] = [
  line("start", "START", 0),
  line("s5", "SPLIT_5M", 5000),
  line("s10", "SPLIT_10M", 10000),
  line("finish", "FINISH", 20000),
];

function splitInput(over?: Partial<Parameters<typeof computeSprintSplits>[0]>) {
  return {
    poses: buildPoses(),
    homography: H as Homography | null,
    registry: TimingLineRegistry.from(SPLIT_LINES),
    startRole: "START" as const,
    finishRole: "FINISH" as const,
    protocolDistanceM: 20,
    width: WIDTH,
    height: HEIGHT,
    cameraStable: true,
    trackingStable: true,
    ...over,
  };
}

describe("Sprint splits — tylko skalibrowane linie pośrednie", () => {
  it("raportuje splity skumulowane i prędkości odcinkowe", () => {
    const res = computeSprintSplits(splitInput());
    expect(res.blockedBy).toBeNull();
    expect(res.splits.length).toBeGreaterThanOrEqual(3);
    const cumulative = res.splits.map((s) => s.cumulativeTimeS);
    expect([...cumulative].sort((a, b) => a - b)).toEqual(cumulative);
    for (const s of res.splits) {
      expect(s.cumulativeTimeS).toBeGreaterThan(0);
      if (s.segmentSpeedMs != null) expect(s.segmentSpeedMs).toBeGreaterThan(0);
    }
  });

  it("bez kalibracji nie zwraca żadnych splitów", () => {
    const res = computeSprintSplits(splitInput({ homography: null }));
    expect(res.splits).toHaveLength(0);
    expect(res.blockedBy).toBe("NO_CALIBRATION");
    expect(res.velocityProfile).toBeNull();
  });

  it("brak linii pośrednich i brak mety → NO_SPLIT_LINES", () => {
    const res = computeSprintSplits(
      splitInput({
        registry: TimingLineRegistry.from([line("start", "START", 0)]),
        protocolDistanceM: null,
      }),
    );
    expect(res.blockedBy).toBe("NO_SPLIT_LINES");
  });

  it("determinizm: 10 przebiegów daje identyczny wynik", () => {
    const sig = Array.from({ length: 10 }, () => JSON.stringify(computeSprintSplits(splitInput())));
    expect(new Set(sig).size).toBe(1);
  });

  it("profil prędkości tylko przy stabilnym torze i 3+ odcinkach", () => {
    const splits: SprintSplit[] = [1, 2, 3].map((i) => ({
      role: "SPLIT_5M",
      label: `S${i}`,
      distanceM: i * 5,
      cumulativeTimeS: i * 0.7,
      segmentTimeS: 0.7,
      segmentSpeedMs: 5 + i,
      segmentSpeedKmh: (5 + i) * 3.6,
      cumulativeUncertaintyS: 0.001,
      frameBeforeIndex: i,
      frameAfterIndex: i + 1,
    }));
    expect(buildVelocityProfile(splits, false)).toBeNull();
    expect(buildVelocityProfile(splits.slice(0, 2), true)).toBeNull();
    const p = buildVelocityProfile(splits, true);
    expect(p?.peakSegmentSpeedMs).toBe(8);
    expect(p?.peakAtLastSegment).toBe(true);
  });
});

describe("Fazy sprintu", () => {
  it("wyznacza fazy w rosnącej kolejności bez wymyślania brakujących", () => {
    const phases = detectSprintPhases(buildPoses());
    expect(phases.length).toBeGreaterThan(0);
    const times = phases.map((p) => p.startTimeS);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    for (const p of phases) expect(p.endTimeS).toBeGreaterThanOrEqual(p.startTimeS);
  });

  it("zbyt krótkie nagranie → brak faz", () => {
    expect(detectSprintPhases(buildPoses({ frames: 3 }))).toHaveLength(0);
  });
});

describe("Mechanika sprintu", () => {
  it("liczy metryki przy dobrej widoczności i wielkości sylwetki", () => {
    const phases = detectSprintPhases(buildPoses());
    const mech = analyzeSprintMechanics(buildPoses(), phases);
    expect(mech.availability).toBe("AVAILABLE");
    expect(mech.metrics.length).toBeGreaterThan(0);
    for (const m of mech.metrics) {
      expect(m.rangeMin).toBeLessThanOrEqual(m.value);
      expect(m.rangeMax).toBeGreaterThanOrEqual(m.value);
      expect(m.confidence).toBeGreaterThan(0);
      expect(m.samples).toBeGreaterThanOrEqual(2);
    }
  });

  it("mała sylwetka → mechanika niedostępna, ale bez wpływu na czas", () => {
    const poses = buildPoses({ silhouetteHeight: 0.1 });
    const mech = analyzeSprintMechanics(poses, []);
    expect(mech.availability).toBe("ATHLETE_TOO_SMALL_FOR_MECHANICS");
    expect(mech.metrics).toHaveLength(0);
    // Czas nadal liczony z tych samych klatek:
    expect(computeSprintSplits(splitInput({ poses })).splits.length).toBeGreaterThan(0);
  });

  it("słaby sygnał (niska widoczność) → odrzucenie metryk", () => {
    const mech = analyzeSprintMechanics(buildPoses({ visibility: 0.2 }), []);
    expect(mech.availability).toBe("LOW_VISIBILITY");
    expect(mech.metrics).toHaveLength(0);
  });
});

function metric(over: Partial<MechanicMetric>): MechanicMetric {
  return {
    key: "trunk_lean_deg",
    label: "x",
    unit: "°",
    value: 0,
    rangeMin: 0,
    rangeMax: 0,
    samples: 10,
    confidence: 0.8,
    phase: "acceleration",
    evidenceFrameIndex: 5,
    ...over,
  };
}

function mechanics(metrics: MechanicMetric[]): SprintMechanics {
  return {
    availability: "AVAILABLE",
    metrics,
    framesUsed: 40,
    medianSilhouetteFraction: 0.5,
    medianVisibility: 0.9,
  };
}

describe("Wybór limitera", () => {
  it("wskazuje limiter przy dwóch niezależnych dowodach", () => {
    const { limiter } = selectSprintLimiter(
      mechanics([
        metric({ key: "trunk_lean_deg", value: 8 }),
        metric({ key: "shank_angle_deg", value: 10 }),
      ]),
    );
    expect(limiter?.id).toBe("acceleration_position");
    expect(limiter?.evidence).toHaveLength(2);
  });

  it("jeden dowód nie wystarcza", () => {
    const { limiter, reason } = selectSprintLimiter(
      mechanics([metric({ key: "trunk_lean_deg", value: 8 })]),
    );
    expect(limiter).toBeNull();
    expect(reason).toBe(NO_LIMITER_MESSAGE);
  });

  it("dowody o niskiej pewności są ignorowane", () => {
    const { limiter } = selectSprintLimiter(
      mechanics([
        metric({ key: "trunk_lean_deg", value: 8, confidence: 0.3 }),
        metric({ key: "shank_angle_deg", value: 10, confidence: 0.3 }),
      ]),
    );
    expect(limiter).toBeNull();
  });

  it("mechanika niedostępna → brak limitera", () => {
    const { limiter } = selectSprintLimiter({ ...mechanics([]), availability: "LOW_VISIBILITY" });
    expect(limiter).toBeNull();
  });

  it("deterministycznie wybiera zawsze ten sam limiter", () => {
    const input = mechanics([
      metric({ key: "trunk_lean_deg", value: 8 }),
      metric({ key: "shank_angle_deg", value: 10 }),
      metric({ key: "hip_extension_deg", value: 140 }),
    ]);
    const ids = Array.from({ length: 10 }, () => selectSprintLimiter(input).limiter?.id);
    expect(new Set(ids)).toEqual(new Set(["acceleration_position"]));
  });

  it("zalecenie tylko dla potwierdzonego limitera", () => {
    expect(recommendationForLimiter(null)).toBeNull();
    const rec = recommendationForLimiter("braking_contact");
    expect(rec?.exerciseIds.length).toBeGreaterThanOrEqual(2);
    expect(rec?.exerciseIds.length).toBeLessThanOrEqual(3);
  });
});

describe("Zgodność starych raportów", () => {
  it("rekord bez sprintScan pozostaje poprawny", () => {
    const legacy: CalculationBasis = { method: "cmj-1.0.0", items: [], coachVerifiedFrames: false };
    expect(legacy.sprintScan).toBeUndefined();
  });
});
