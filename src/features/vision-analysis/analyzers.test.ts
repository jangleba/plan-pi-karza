import { describe, it, expect } from "vitest";
import { resolveAnalysisStatus } from "./statusPolicy";
import { cmjAnalyzer } from "./analyzers/cmjAnalyzer";
import { pogoAnalyzer } from "./analyzers/pogoAnalyzer";
import { gymAnalyzer } from "./analyzers/gymAnalyzer";
import type { AnalysisContext, FramePose, Landmark, VideoMetadata } from "./types";
import { POSE } from "./types";
import { multiplePeopleDetected } from "./poseSeries";
import { isPlausibleHumanPose } from "./poseEngine";

function landmarksWith(hipY: number, footY: number): Landmark[] {
  const arr: Landmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.9,
  }));
  arr[POSE.LEFT_HIP] = { x: 0.5, y: hipY, z: 0, visibility: 0.95 };
  arr[POSE.RIGHT_HIP] = { x: 0.5, y: hipY, z: 0, visibility: 0.95 };
  for (const i of [
    POSE.LEFT_ANKLE,
    POSE.RIGHT_ANKLE,
    POSE.LEFT_HEEL,
    POSE.RIGHT_HEEL,
    POSE.LEFT_FOOT_INDEX,
    POSE.RIGHT_FOOT_INDEX,
  ]) {
    arr[i] = { x: 0.5, y: footY, z: 0, visibility: 0.95 };
  }
  return arr;
}

/** Buduje syntetyczny skok CMJ: stanie → lot → lądowanie. */
function buildCmjPoses(fps: number): FramePose[] {
  const dt = 1 / fps;
  const poses: FramePose[] = [];
  const standFoot = 0.9;
  const airFoot = 0.5;
  const takeoff = 20;
  const landing = 68; // 48 klatek lotu @120fps = 0.4s
  const total = 90;
  for (let i = 0; i < total; i++) {
    const airborne = i >= takeoff && i < landing;
    const footY = airborne ? airFoot : standFoot;
    const hipY = airborne ? 0.5 : i < takeoff ? 0.55 : 0.55;
    poses.push({
      frameIndex: i,
      mediaTime: i * dt,
      presentationTimestamp: i * dt,
      sourceTimestampMs: Math.round(i * dt * 1000),
      mediaPipeTimestampMs: Math.round(i * dt * 1000),
      landmarks: landmarksWith(hipY, footY),
      peopleCount: 1,
      trackingConfidence: 0.9,
    });
  }
  return poses;
}

/** CMJ bliższy nagraniu z telefonu: faza zejścia, wybicie, lot i szum landmarków. */
function buildRealisticCmjPoses(fps = 120): FramePose[] {
  const poses: FramePose[] = [];
  for (let i = 0; i < 180; i++) {
    let hipY = 0.55;
    let footY = 0.9;
    if (i >= 40 && i < 70) hipY = 0.55 + ((i - 40) / 30) * 0.09;
    if (i >= 70 && i < 85) hipY = 0.64 - ((i - 70) / 15) * 0.13;
    if (i >= 85 && i < 133) {
      footY = 0.72 + (i % 2 === 0 ? 0.002 : -0.002);
      const phase = (i - 85) / 48;
      hipY = 0.51 - Math.sin(Math.PI * phase) * 0.08;
    }
    if (i >= 133) hipY = 0.56;
    const landmarks = landmarksWith(hipY, footY);
    for (const left of [true, false]) {
      const x = left ? 0.46 : 0.54;
      landmarks[left ? POSE.LEFT_SHOULDER : POSE.RIGHT_SHOULDER] = {
        x,
        y: hipY - 0.25,
        z: 0,
        visibility: 0.95,
      };
      landmarks[left ? POSE.LEFT_KNEE : POSE.RIGHT_KNEE] = {
        x: x + (left ? -0.025 : 0.025),
        y: hipY + 0.13,
        z: 0,
        visibility: 0.95,
      };
      landmarks[left ? POSE.LEFT_ANKLE : POSE.RIGHT_ANKLE] = {
        x,
        y: footY,
        z: 0,
        visibility: 0.95,
      };
    }
    // Jeden absurdalny punkt o niskiej widoczności nie może udawać podłoża.
    if (i === 20) {
      for (const index of [27, 28, 29, 30, 31, 32]) {
        landmarks[index] = { x: 0.5, y: 0.99, z: 0, visibility: 0.05 };
      }
    }
    poses.push({
      frameIndex: i,
      sourceFrameIndex: i,
      mediaTime: i / fps,
      presentationTimestamp: i / fps,
      sourceTimestampUs: Math.round((i / fps) * 1_000_000),
      sourceTimestampMs: Math.round((i / fps) * 1000),
      mediaPipeTimestampMs: Math.round((i / fps) * 1000),
      landmarks,
      peopleCount: 1,
      trackingConfidence: 0.9,
    });
  }
  return poses;
}

function meta(fps: number): VideoMetadata {
  return {
    fps,
    fpsMeasured: true,
    declaredFps: fps,
    durationSeconds: 0.75,
    frameCount: 90,
    width: 1080,
    height: 1920,
    orientation: "portrait",
  };
}

describe("resolveAnalysisStatus (bezpiecznik)", () => {
  it("NIE pozwala na 'completed' gdy brak metryk", () => {
    const d = resolveAnalysisStatus({
      validationStatus: "completed",
      metricsCount: 0,
      confidence: 0.99,
    });
    expect(d.status).not.toBe("completed");
    expect(d.status).toBe("needs_review");
  });

  it("akceptuje wynik przy wysokim confidence i metrykach", () => {
    const d = resolveAnalysisStatus({
      validationStatus: "completed",
      metricsCount: 2,
      confidence: 0.9,
    });
    expect(d.status).toBe("completed");
  });

  it("oznacza needs_review przy niskim confidence", () => {
    const d = resolveAnalysisStatus({
      validationStatus: "completed",
      metricsCount: 2,
      confidence: 0.5,
    });
    expect(d.status).toBe("needs_review");
  });

  it("respektuje invalid_recording z analizatora", () => {
    const d = resolveAnalysisStatus({
      validationStatus: "invalid_recording",
      metricsCount: 5,
      confidence: 0.9,
    });
    expect(d.status).toBe("invalid_recording");
  });
});

describe("cmjAnalyzer", () => {
  const fps = 120;
  const ctx: AnalysisContext = {
    testType: "cmj",
    metadata: meta(fps),
    poses: buildCmjPoses(fps),
    cameraSetup: "side",
    calibration: null,
  };

  it("wykrywa wybicie i lądowanie", async () => {
    const events = await cmjAnalyzer.detectKeyEvents(ctx);
    const types = events.map((e) => e.type);
    expect(types).toContain("takeoff");
    expect(types).toContain("landing");
  });

  it("liczy realną wysokość skoku z czasu lotu", async () => {
    const events = await cmjAnalyzer.detectKeyEvents(ctx);
    const metrics = cmjAnalyzer.calculateMetrics(events, ctx);
    const height = metrics.find((m) => m.key === "jump_height_cm");
    expect(height).toBeDefined();
    // ~0.4s lotu → ~19-20 cm
    expect(height!.value).toBeGreaterThan(10);
    expect(height!.value).toBeLessThan(30);
  });

  it("odrzuca nagranie bez wyskoku (EVENTS_NOT_DETECTED)", () => {
    const flat: FramePose[] = Array.from({ length: 40 }, (_, i) => ({
      frameIndex: i,
      mediaTime: i / fps,
      presentationTimestamp: i / fps,
      sourceTimestampMs: Math.round((i / fps) * 1000),
      mediaPipeTimestampMs: Math.round((i / fps) * 1000),
      landmarks: landmarksWith(0.55, 0.9),
      peopleCount: 1,
      trackingConfidence: 0.9,
    }));
    const c2: AnalysisContext = { ...ctx, poses: flat };
    const v = cmjAnalyzer.validateRecording(c2);
    expect(v.issues).toContain("EVENTS_NOT_DETECTED");
    expect(v.status).toBe("invalid_recording");
  });

  it("z realnego przebiegu liczy fazy, kąty i RSI-mod bez fałszywego lotu z szumu", async () => {
    const poses = buildRealisticCmjPoses();
    const realCtx: AnalysisContext = {
      ...ctx,
      poses,
      metadata: { ...meta(120), durationSeconds: poses.length / 120, frameCount: poses.length },
    };
    const events = await cmjAnalyzer.detectKeyEvents(realCtx);
    const metrics = cmjAnalyzer.calculateMetrics(events, realCtx);
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["movement_start", "lowest_position", "takeoff", "landing"]),
    );
    expect(metrics.map((metric) => metric.key)).toEqual(
      expect.arrayContaining([
        "jump_height_cm",
        "flight_time_s",
        "countermovement_depth_pct",
        "knee_angle_bottom_deg",
        "hip_angle_bottom_deg",
        "time_to_takeoff_s",
        "rsi_modified",
        "eccentric_phase_time_s",
        "propulsion_time_s",
      ]),
    );
    const height = metrics.find((metric) => metric.key === "jump_height_cm")!.value;
    expect(height).toBeGreaterThan(15);
    expect(height).toBeLessThan(25);
  });

  it("wykrywa CMJ mimo pojedynczej stopy błędnie przyklejonej do podłoża", async () => {
    const poses = buildRealisticCmjPoses();
    for (let i = 85; i < 133; i++) {
      const landmarks = poses[i].landmarks!;
      for (const index of [POSE.RIGHT_ANKLE, POSE.RIGHT_HEEL, POSE.RIGHT_FOOT_INDEX]) {
        landmarks[index] = { ...landmarks[index], y: 0.9 };
      }
    }
    const noisyCtx: AnalysisContext = {
      ...ctx,
      poses,
      metadata: { ...meta(120), durationSeconds: poses.length / 120, frameCount: poses.length },
    };
    const events = await cmjAnalyzer.detectKeyEvents(noisyCtx);
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["takeoff", "landing"]),
    );
  });
});

describe("walidacja liczby osób", () => {
  it("nie odrzuca filmu przez pojedyncze fałszywe wykrycie drugiej osoby", () => {
    const poses = buildRealisticCmjPoses();
    poses[40].peopleCount = 2;
    expect(multiplePeopleDetected(poses)).toBe(false);
  });

  it("odrzuca film, gdy druga osoba jest widoczna stale", () => {
    const poses = buildRealisticCmjPoses();
    for (let i = 30; i < 90; i++) poses[i].peopleCount = 2;
    expect(multiplePeopleDetected(poses)).toBe(true);
  });
});

describe("filtr prawdziwej sylwetki", () => {
  it("akceptuje spójną sylwetkę z widocznym łańcuchem stawów", () => {
    const landmarks = landmarksWith(0.52, 0.9);
    landmarks[POSE.LEFT_SHOULDER] = { x: 0.44, y: 0.25, z: 0, visibility: 0.95 };
    landmarks[POSE.LEFT_HIP] = { x: 0.46, y: 0.52, z: 0, visibility: 0.95 };
    landmarks[POSE.LEFT_KNEE] = { x: 0.47, y: 0.7, z: 0, visibility: 0.95 };
    landmarks[POSE.LEFT_ANKLE] = { x: 0.48, y: 0.9, z: 0, visibility: 0.95 };
    expect(isPlausibleHumanPose(landmarks)).toBe(true);
  });

  it("odrzuca skupisko punktów z dłoni, torby lub fragmentu tła", () => {
    const landmarks: Landmark[] = Array.from({ length: 33 }, (_, index) => ({
      x: 0.49 + (index % 3) * 0.004,
      y: 0.5 + (index % 4) * 0.004,
      z: 0,
      visibility: 0.95,
    }));
    expect(isPlausibleHumanPose(landmarks)).toBe(false);
  });
});

describe("cmjAnalyzer — powtarzalność (determinizm)", () => {
  const fps = 60;
  it("10 uruchomień tego samego wejścia daje identyczne wyniki (0ms, 0 klatek, 0.0cm)", async () => {
    type Run = {
      decodedFrames: number;
      takeoffFrame: number;
      landingFrame: number;
      takeoffTs: number;
      landingTs: number;
      flightTime: number;
      jumpHeight: number;
    };
    const runs: Run[] = [];
    for (let r = 0; r < 10; r++) {
      // Świeże wejście za każdym razem (symuluje pełny cleanup + nowy analysisRunId).
      const poses = buildCmjPoses(fps);
      const ctx: AnalysisContext = {
        testType: "cmj",
        metadata: meta(fps),
        poses,
        cameraSetup: "side",
        calibration: null,
      };
      const events = await cmjAnalyzer.detectKeyEvents(ctx);
      const metrics = cmjAnalyzer.calculateMetrics(events, ctx);
      const takeoff = events.find((e) => e.type === "takeoff")!;
      const landing = events.find((e) => e.type === "landing")!;
      runs.push({
        decodedFrames: poses.length,
        takeoffFrame: takeoff.frameIndex,
        landingFrame: landing.frameIndex,
        takeoffTs: takeoff.timestampSeconds,
        landingTs: landing.timestampSeconds,
        flightTime: metrics.find((m) => m.key === "flight_time_s")!.value,
        jumpHeight: metrics.find((m) => m.key === "jump_height_cm")!.value,
      });
    }
    const first = runs[0];
    for (const run of runs) {
      expect(run).toEqual(first);
    }
  });
});

describe("pogoAnalyzer protocol guard", () => {
  it("odrzuca pojedynczy skok CMJ jako TEST_PROTOCOL_MISMATCH zamiast błędu technicznego", () => {
    const ctx: AnalysisContext = {
      testType: "pogo_jumps",
      metadata: meta(120),
      poses: buildCmjPoses(120),
      cameraSetup: "side",
      calibration: null,
    };
    const validation = pogoAnalyzer.validateRecording(ctx);
    const metrics = pogoAnalyzer.calculateMetrics([], ctx);

    expect(validation.status).toBe("invalid_recording");
    expect(validation.issues).toContain("TEST_PROTOCOL_MISMATCH");
    expect(validation.issues).not.toContain("EVENTS_NOT_DETECTED");
    expect(metrics).toHaveLength(0);
  });
});

describe("gymAnalyzer", () => {
  it("nie generuje fałszywego pomiaru AI (0 metryk, needs_review)", () => {
    const ctx: AnalysisContext = {
      testType: "analyze_gym_exercise",
      metadata: meta(30),
      poses: buildCmjPoses(30),
      cameraSetup: "side",
      calibration: null,
    };
    const metrics = gymAnalyzer.calculateMetrics([], ctx);
    expect(metrics).toHaveLength(0);
    const v = gymAnalyzer.validateRecording(ctx);
    expect(v.status).toBe("needs_review");
  });
});
