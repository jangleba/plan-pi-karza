import { describe, it, expect } from "vitest";
import type { AnalysisContext, FramePose, Landmark, VideoMetadata } from "./types";
import { POSE } from "./types";
import { cmjAnalyzer } from "./analyzers/cmjAnalyzer";
import { squatJumpAnalyzer } from "./analyzers/squatJumpAnalyzer";
import { dropJumpAnalyzer } from "./analyzers/dropJumpAnalyzer";
import { repeatedJumpsAnalyzer } from "./analyzers/repeatedJumpsAnalyzer";
import { pogoAnalyzer } from "./analyzers/pogoAnalyzer";
import { recognizeTestProtocol } from "./testProtocolRecognizer";
import type { TestType } from "./types";

// ---------- syntetyczne generatory pozy (deterministyczne) ----------

function lms(hipY: number, footY: number): Landmark[] {
  const arr: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
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

function frame(i: number, fps: number, hipY: number, footY: number): FramePose {
  const dt = 1 / fps;
  return {
    frameIndex: i,
    sourceFrameIndex: i,
    mediaTime: i * dt,
    presentationTimestamp: i * dt,
    sourceTimestampMs: Math.round(i * dt * 1000),
    sourceTimestampUs: Math.round(i * dt * 1_000_000),
    mediaPipeTimestampMs: Math.round(i * dt * 1000),
    landmarks: lms(hipY, footY),
    peopleCount: 1,
    trackingConfidence: 0.9,
  };
}

/** CMJ: stanie → countermovement (dip) → lot → lądowanie. */
function cmjPoses(fps = 120): FramePose[] {
  const p: FramePose[] = [];
  for (let i = 0; i < 90; i++) {
    let hipY = 0.55;
    let footY = 0.9;
    if (i >= 10 && i < 20) hipY = 0.63; // countermovement
    if (i >= 20 && i < 68) { hipY = 0.5; footY = 0.5; } // lot
    p.push(frame(i, fps, hipY, footY));
  }
  return p;
}

/** Squat Jump: statyczny przysiad (bez dynamicznego zejścia) → lot → lądowanie. */
function squatJumpPoses(fps = 120): FramePose[] {
  const p: FramePose[] = [];
  for (let i = 0; i < 90; i++) {
    let hipY = 0.62; // stały przysiad
    let footY = 0.9;
    if (i >= 20 && i < 68) { hipY = 0.5; footY = 0.5; }
    if (i >= 68) hipY = 0.55;
    p.push(frame(i, fps, hipY, footY));
  }
  return p;
}

/** Pogo: seria szybkich odbić z krótkim kontaktem. */
function pogoPoses(fps = 240): FramePose[] {
  const p: FramePose[] = [];
  for (let i = 0; i < 240; i++) {
    const phase = i % 12;
    const airborne = phase >= 4;
    p.push(frame(i, fps, 0.55, airborne ? 0.78 : 0.9));
  }
  return p;
}

/** Drop Jump: skrzynia → zejście → kontakt → wybicie → lot → lądowanie. */
function dropJumpPoses(fps = 240): FramePose[] {
  const p: FramePose[] = [];
  for (let i = 0; i < 170; i++) {
    let footY = 0.9;
    if (i < 10) footY = 0.6; // na skrzyni (uniesione stopy)
    else if (i >= 10 && i < 40) footY = 0.9; // pierwszy kontakt
    else if (i >= 40 && i < 136) footY = 0.55; // drugi lot
    else footY = 0.9; // lądowanie
    p.push(frame(i, fps, 0.5, footY));
  }
  return p;
}

/** Pojedynczy skok bez skrzyni (do testu „Drop Jump bez skrzyni"). */
function singleJumpPoses(fps = 240): FramePose[] {
  const p: FramePose[] = [];
  for (let i = 0; i < 170; i++) {
    let footY = 0.9;
    if (i >= 40 && i < 136) footY = 0.55;
    p.push(frame(i, fps, 0.5, footY));
  }
  return p;
}

/** Repeated Jumps z zadaną liczbą pełnych cykli. */
function repeatedJumpsPoses(cycles: number, fps = 240): FramePose[] {
  const p: FramePose[] = [];
  const ground = 10;
  const air = 30;
  let i = 0;
  const push = (footY: number, n: number) => {
    for (let k = 0; k < n; k++) p.push(frame(i++, fps, 0.5, footY));
  };
  push(0.9, ground); // kontakt startowy
  for (let c = 0; c < cycles; c++) {
    push(0.55, air); // lot
    push(0.9, ground); // kontakt
  }
  return p;
}

function meta(fps: number, n: number): VideoMetadata {
  return {
    fps,
    fpsMeasured: true,
    declaredFps: fps,
    durationSeconds: n / fps,
    frameCount: n,
    width: 1080,
    height: 1920,
    orientation: "portrait",
  };
}

function ctxOf(testType: TestType, poses: FramePose[], fps: number): AnalysisContext {
  return { testType, metadata: meta(fps, poses.length), poses, cameraSetup: "side", calibration: null };
}

// ---------- testy akceptacyjne ----------

describe("Vertical/Reactive families — acceptance", () => {
  it("1. CMJ rozpoznany jako CMJ", async () => {
    const poses = cmjPoses();
    const rec = recognizeTestProtocol("cmj", poses);
    expect(rec.protocolMatch).toBe(true);
    const ctx = ctxOf("cmj", poses, 120);
    expect(cmjAnalyzer.validateRecording(ctx).status).not.toBe("invalid_recording");
    const ev = await cmjAnalyzer.detectKeyEvents(ctx);
    const m = cmjAnalyzer.calculateMetrics(ev, ctx);
    expect(m.find((x) => x.key === "jump_height_cm")!.value).toBeGreaterThan(10);
  });

  it("2. CMJ NIE przechodzi jako Pogo (TEST_PROTOCOL_MISMATCH)", () => {
    const rec = recognizeTestProtocol("pogo_jumps", cmjPoses());
    expect(rec.protocolMatch).toBe(false);
    expect(rec.errorCode).toBe("TEST_PROTOCOL_MISMATCH");
    const v = pogoAnalyzer.validateRecording(ctxOf("pogo_jumps", cmjPoses(), 120));
    expect(v.issues).toContain("TEST_PROTOCOL_MISMATCH");
  });

  it("3. CMJ NIE przechodzi jako Squat Jump (countermovement wykryty)", () => {
    const v = squatJumpAnalyzer.validateRecording(ctxOf("squat_jump", cmjPoses(), 120));
    expect(v.issues).toContain("TEST_PROTOCOL_MISMATCH");
    expect(v.status).toBe("invalid_recording");
    // A prawidłowy Squat Jump przechodzi:
    const ok = squatJumpAnalyzer.validateRecording(ctxOf("squat_jump", squatJumpPoses(), 120));
    expect(ok.status).not.toBe("invalid_recording");
  });

  it("4. Prawidłowe Pogo daje wynik serii", () => {
    const poses = pogoPoses();
    const rec = recognizeTestProtocol("pogo_jumps", poses);
    expect(rec.protocolMatch).toBe(true);
    const ctx = ctxOf("pogo_jumps", poses, 240);
    const ev = pogoPoses().length ? [] : [];
    void ev;
    const events = detectContacts(ctx);
    const m = pogoAnalyzer.calculateMetrics(events, ctx);
    expect(m.find((x) => x.key === "rsi")).toBeDefined();
  });

  it("5. Prawidłowy Drop Jump: GCT, flight, height, RSI", async () => {
    const poses = dropJumpPoses();
    const rec = recognizeTestProtocol("drop_jump", poses);
    expect(rec.detectedSignature).toBe("DROP_REBOUND");
    expect(rec.protocolMatch).toBe(true);
    const ctx = ctxOf("drop_jump", poses, 240);
    expect(dropJumpAnalyzer.validateRecording(ctx).status).not.toBe("invalid_recording");
    const ev = await dropJumpAnalyzer.detectKeyEvents(ctx);
    const m = dropJumpAnalyzer.calculateMetrics(ev, ctx);
    const keys = m.map((x) => x.key);
    expect(keys).toEqual(expect.arrayContaining(["ground_contact_s", "flight_time_s", "jump_height_cm", "rsi"]));
  });

  it("6. Drop Jump bez skrzyni jest odrzucony", () => {
    const rec = recognizeTestProtocol("drop_jump", singleJumpPoses());
    expect(rec.protocolMatch).toBe(false);
    const v = dropJumpAnalyzer.validateRecording(ctxOf("drop_jump", singleJumpPoses(), 240));
    expect(v.issues).toContain("INVALID_TEST_EXECUTION");
  });

  it("7. Repeated Jumps z za małą liczbą cykli → WRONG_REPETITION_COUNT", () => {
    const v = repeatedJumpsAnalyzer.validateRecording(ctxOf("repeated_jumps", repeatedJumpsPoses(3), 240));
    expect(v.issues).toContain("WRONG_REPETITION_COUNT");
    // Prawidłowa seria (6 cykli) przechodzi:
    const ok = repeatedJumpsAnalyzer.validateRecording(ctxOf("repeated_jumps", repeatedJumpsPoses(6), 240));
    expect(ok.status).not.toBe("invalid_recording");
  });

  it("8. Ten sam film 10× → identyczne wyniki (drop jump + cmj)", async () => {
    const runDrop = async () => {
      const ctx = ctxOf("drop_jump", dropJumpPoses(), 240);
      const ev = await dropJumpAnalyzer.detectKeyEvents(ctx);
      const m = dropJumpAnalyzer.calculateMetrics(ev, ctx);
      return JSON.stringify({ ev, m });
    };
    const runCmj = async () => {
      const ctx = ctxOf("cmj", cmjPoses(), 120);
      const ev = await cmjAnalyzer.detectKeyEvents(ctx);
      const m = cmjAnalyzer.calculateMetrics(ev, ctx);
      return JSON.stringify({ ev, m });
    };
    const drops = await Promise.all(Array.from({ length: 10 }, runDrop));
    const cmjs = await Promise.all(Array.from({ length: 10 }, runCmj));
    for (const d of drops) expect(d).toBe(drops[0]);
    for (const c of cmjs) expect(c).toBe(cmjs[0]);
  });
});

// pomocnik: detekcja kontaktów pogo (adapter liczy na ich podstawie)
import { detectGroundContacts } from "./analyzers/jumpDetection";
function detectContacts(ctx: AnalysisContext) {
  return detectGroundContacts(ctx.poses);
}
