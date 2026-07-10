import { describe, it, expect } from "vitest";
import { resolveAnalysisStatus } from "./statusPolicy";
import { cmjAnalyzer } from "./analyzers/cmjAnalyzer";
import { gymAnalyzer } from "./analyzers/gymAnalyzer";
import type { AnalysisContext, FramePose, Landmark, VideoMetadata } from "./types";
import { POSE } from "./types";

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
      landmarks: landmarksWith(hipY, footY),
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
      landmarks: landmarksWith(0.55, 0.9),
      peopleCount: 1,
      trackingConfidence: 0.9,
    }));
    const c2: AnalysisContext = { ...ctx, poses: flat };
    const v = cmjAnalyzer.validateRecording(c2);
    expect(v.issues).toContain("EVENTS_NOT_DETECTED");
    expect(v.status).toBe("invalid_recording");
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
