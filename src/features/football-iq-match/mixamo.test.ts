import fs from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import {
  parseCompactAnimation,
  attachAerialClips,
  attachOptionalClips,
  readAnimationFile,
  makeActor,
  prepareAdditionalClip,
  prepareRunningModel,
  PLAYER_HEIGHT,
} from "./mixamo";
import { AnimationClip, Bone, Group, QuaternionKeyframeTrack, Vector3 } from "three";
import type { AerialCalibration } from "./aerialClips";
import type { RunningModel } from "./mixamo";
import {
  BALL_RADIUS,
  BALL_REST_HEIGHT,
  createPlayback,
  PASS_CONTACT_PHASE,
  PASS_RECOVERY_SECONDS,
  PASS_WINDUP_SECONDS,
  samplePlayback,
  WALK_STRIDE_UNITS,
} from "./playback";
import type { Scenario } from "./types";

let asset: RunningModel;
beforeAll(() => {
  const bytes = fs.readFileSync(new URL("./assets/running.fbx", import.meta.url));
  const model = new FBXLoader().parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  asset = prepareRunningModel(model);
  const passBytes = fs.readFileSync(new URL("./assets/soccer-pass.fbx", import.meta.url));
  const passModel = new FBXLoader().parse(
    passBytes.buffer.slice(passBytes.byteOffset, passBytes.byteOffset + passBytes.byteLength),
    "",
  );
  asset.clips["soccer-pass"] = prepareAdditionalClip(passModel, asset.model, "soccer-pass");
  const idleBytes = fs.readFileSync(new URL("./assets/idle.fbx", import.meta.url));
  const idleModel = new FBXLoader().parse(
    idleBytes.buffer.slice(idleBytes.byteOffset, idleBytes.byteOffset + idleBytes.byteLength),
    "",
  );
  asset.clips.idle = prepareAdditionalClip(idleModel, asset.model, "idle");
  const walkBytes = fs.readFileSync(new URL("./assets/walking.fbx", import.meta.url));
  const walkModel = new FBXLoader().parse(
    walkBytes.buffer.slice(walkBytes.byteOffset, walkBytes.byteOffset + walkBytes.byteLength),
    "",
  );
  asset.clips.walking = prepareAdditionalClip(walkModel, asset.model, "walking");
});

describe("actual Mixamo asset", () => {
  it("keeps the installed clips usable when optional files are absent or corrupt", async () => {
    const local: RunningModel = {
      ...asset,
      clips: { ...asset.clips },
      aerial: {},
      aerialStatus: { ...asset.aerialStatus },
    };
    const calibration: AerialCalibration = {
      sha256: "a".repeat(64),
      fps: 30,
      durationSeconds: 1.6,
      contactFrame: 24,
      takeoffFrame: 10,
      landingFrame: 40,
      contact: { lateral: 0, forward: 1, height: 8 },
    };
    let reads = 0;
    const broken = async () => {
      reads++;
      throw new Error("corrupt FBX");
    };
    await attachAerialClips(local, {}, {}, broken);
    expect(reads).toBe(0);
    expect(local.aerialStatus.header).toBe("missing");
    await attachAerialClips(local, { header: "header.fbx" }, {}, broken);
    expect(reads).toBe(0);
    expect(local.aerialStatus.header).toBe("uncalibrated");
    await attachAerialClips(local, { header: "header.fbx" }, { header: calibration }, broken);
    expect(reads).toBe(1);
    expect(local.aerialStatus.header).toBe("invalid");
    expect(local.clips["soccer-pass"]).toBe(asset.clips["soccer-pass"]);
    expect(local.clips.header).toBeUndefined();
  });
  it("plays an optional calibrated jumping clip without losing hip lift or accumulating on seeks", async () => {
    // A synthetic jump over the real skeleton tests the pipeline, not the motion quality
    // of a future Mixamo export. No synthetic animation is bundled for users.
    const source = new Group(),
      hips = new Bone();
    hips.name = "mixamorigHips";
    hips.position.copy(asset.model.getObjectByName("mixamorigHips")!.position);
    source.add(hips);
    const jump = asset.clips["soccer-pass"]!.clone();
    const track = jump.tracks.find((t) => t.name === "mixamorigHips.position")!;
    for (let i = 0; i < track.times.length; i++) {
      track.values[i * 3 + 1] =
        hips.position.y + 45 * Math.max(0, 1 - Math.abs(track.times[i] - 0.8) / 0.45);
    }
    // The real pass has the same required Y Bot head/spine tracks.
    source.animations = [jump];
    const calibration: AerialCalibration = {
      sha256: "a".repeat(64),
      fps: 30,
      durationSeconds: jump.duration,
      contactFrame: 24,
      takeoffFrame: 10,
      landingFrame: 40,
      contact: { lateral: 0, forward: 1, height: 8 },
    };
    const local: RunningModel = {
      ...asset,
      clips: { ...asset.clips },
      aerial: {},
      aerialStatus: { ...asset.aerialStatus },
    };
    await attachAerialClips(local, { header: "test.fbx" }, { header: calibration }, async () => ({
      source,
      sha256: calibration.sha256,
    }));
    expect(local.aerialStatus.header).toBe("ready");
    const actor = makeActor(local, { id: "h", team: "home", number: 9, role: "N", x: 50, y: 25 });
    const base = { moving: false, heading: 0, distance: 0, elapsed: 0, duration: 1.6 };
    const hip = actor.root.getObjectByName("mixamorigHips")!;
    actor.pose(base);
    const restingY = hip.position.y;
    actor.pose({ ...base, state: "header", clip: "header", phase: 0.5, weight: 1 });
    expect(hip.position.y - restingY).toBeGreaterThan(40);
    const first = hip.position.clone();
    actor.pose(base);
    actor.pose({ ...base, state: "header", clip: "header", phase: 0.5, weight: 1 });
    expect(hip.position.toArray()).toEqual(first.toArray());
    for (let i = 0; i < 60; i++)
      actor.pose({ ...base, state: "header", clip: "header", phase: 0.5, weight: 1 });
    expect(hip.position.toArray()).toEqual(first.toArray());
    actor.dispose();
    await attachAerialClips(local, { header: "wrong.fbx" }, { header: calibration }, async () => ({
      source,
      sha256: "c".repeat(64),
    }));
    expect(local.aerialStatus.header).toBe("invalid");
    expect(local.aerial.header).toBeUndefined();
  });
  it("keeps kick contact intact and adds seek-safe aerial follow-through and control", () => {
    const actor = makeActor(asset, { id: "a", team: "home", number: 8, role: "SP", x: 0, y: 0 });
    const base = { heading: 0, distance: 0, moving: false, elapsed: 0, duration: 0 };
    const toe = actor.root.getObjectByName("mixamorigRightToeBase")!;
    const leg = actor.root.getObjectByName("mixamorigRightUpLeg")!;
    const atToe = () => {
      actor.root.updateMatrixWorld(true);
      return toe.getWorldPosition(new Vector3());
    };
    actor.pose({ ...base, state: "pass", phase: PASS_CONTACT_PHASE, weight: 1 });
    const contact = atToe();
    for (const delivery of ["chip", "lofted", "cross"] as const) {
      actor.pose({ ...base, state: "pass", phase: PASS_CONTACT_PHASE, weight: 1, delivery });
      expect(atToe().distanceTo(contact)).toBeLessThan(0.000001);
      actor.pose({ ...base, state: "pass", phase: 0.6, weight: 1 });
      const ground = leg.quaternion.clone();
      actor.pose({ ...base, state: "pass", phase: 0.6, weight: 1, delivery });
      const air = leg.quaternion.clone();
      expect(air.angleTo(ground)).toBeGreaterThan(0.1);
      actor.pose(base);
      actor.pose({ ...base, state: "pass", phase: 0.6, weight: 1, delivery });
      expect(leg.quaternion.toArray()).toEqual(air.toArray());
      for (let i = 0; i < 60; i++)
        actor.pose({ ...base, state: "pass", phase: 0.6, weight: 1, delivery });
      expect(leg.quaternion.toArray()).toEqual(air.toArray());
    }
    actor.pose({ ...base, state: "receive", phase: 0.5, weight: 1, control: "aerial" });
    const received = atToe();
    actor.pose(base);
    actor.pose({ ...base, state: "receive", phase: 0.5, weight: 1, control: "aerial" });
    expect(atToe().distanceTo(received)).toBeLessThan(0.000001);
    actor.dispose();
  });
  it("does not bind helper bones with duplicate names twice", () => {
    const names = asset.idle.tracks.map((track) => track.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it("keeps the neutral hip position at its original height", () => {
    const player = { id: "a", team: "home" as const, number: 7, role: "PS", x: 50, y: 70 };
    const actor = makeActor({ ...asset, clips: {} }, player);
    const hips = actor.root.getObjectByName("mixamorigHips")!;
    const height = hips.position.y;
    actor.pose({ moving: false, heading: 0, distance: 0, elapsed: 0, duration: 0 });
    expect(hips.position.y).toBeCloseTo(height, 5);
    expect(hips.position.y).toBeGreaterThan(100);
    actor.dispose();
  });
  it("animates cloned players independently and returns from running to neutral", () => {
    const player = { id: "a", team: "home" as const, number: 7, role: "PS", x: 50, y: 70 };
    const a = makeActor(asset, player);
    const b = makeActor(asset, { ...player, id: "b" });
    const idle = { moving: false, heading: 0, distance: 0, elapsed: 0, duration: 0 };
    a.pose(idle);
    b.pose(idle);
    const hipsA = a.root.getObjectByName("mixamorigHips")!;
    const hipsB = b.root.getObjectByName("mixamorigHips")!;
    const before = hipsB.position.y;
    a.pose({ moving: true, heading: 1, distance: 1, elapsed: 1, duration: 5 });
    expect(hipsA.position.y).not.toBeCloseTo(before, 2);
    expect(hipsB.position.y).toBeCloseTo(before, 5);
    a.pose(idle);
    expect(hipsA.position.y).toBeCloseTo(before, 5);
    a.dispose();
    b.dispose();
  });
  it("normalizes translation in an additional clip without modifying its source", () => {
    const source = new Group();
    source.animations = [asset.running];
    const clip = prepareAdditionalClip(source, asset.model, "walking");
    const sourceHips = asset.running.tracks.find(
      (track) => track.name === "mixamorigHips.position",
    )!;
    const hips = clip.tracks.find((track) => track.name === "mixamorigHips.position")!;
    expect(clip).not.toBe(asset.running);
    expect(hips.values).not.toBe(sourceHips.values);
    expect(hips.values[0]).toBeCloseTo(asset.model.getObjectByName("mixamorigHips")!.position.x);
    expect(hips.values[1]).toBeCloseTo(asset.model.getObjectByName("mixamorigHips")!.position.y);
  });
  it("rejects an animation using a different skeleton", () => {
    const source = new Group();
    source.animations = [
      new AnimationClip("other", 1, [
        new QuaternionKeyframeTrack("OtherHips.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
      ]),
    ];
    expect(() => prepareAdditionalClip(source, asset.model, "soccer-pass")).toThrow("Y Bot");
  });
  it("plays a supplied gesture independently and returns to neutral after it", () => {
    const actor = makeActor(asset, {
      id: "a",
      team: "home",
      number: 7,
      role: "PS",
      x: 50,
      y: 70,
    });
    const hips = actor.root.getObjectByName("mixamorigHips")!;
    const idle = { moving: false, heading: 0, distance: 0, elapsed: 0, duration: 0 };
    actor.pose(idle);
    const initial = hips.position.y;
    actor.pose({ ...idle, state: "pass", phase: 0.25, weight: 1 });
    expect(hips.position.y).not.toBeCloseTo(initial, 2);
    actor.pose(idle);
    expect(hips.position.y).toBeCloseTo(initial, 5);
    actor.dispose();
  });
  it("uses the actual 1.6 second pass with a natural-speed contact marker", () => {
    const clip = asset.clips["soccer-pass"]!;
    expect(clip.duration).toBeCloseTo(1.6, 5);
    expect(clip.tracks).toHaveLength(53);
    expect(PASS_WINDUP_SECONDS + PASS_RECOVERY_SECONDS).toBeCloseTo(clip.duration, 5);
    expect(PASS_CONTACT_PHASE * clip.duration).toBeCloseTo(PASS_WINDUP_SECONDS, 5);
    const hips = clip.tracks.find((track) => track.name === "mixamorigHips.position")!;
    // Preserve the local step/weight transfer, which would be lost by freezing x/z.
    expect(hips.values[14 * 3] - hips.values[0]).toBeGreaterThan(19);
    expect(hips.values[14 * 3 + 2] - hips.values[2]).toBeGreaterThan(22);
    expect(hips.values.at(-3)).toBeCloseTo(hips.values[0], 3);
    expect(hips.values.at(-1)).toBeCloseTo(hips.values[2], 3);
  });
  it("releases the ball at the actual right toe in all four pitch directions", () => {
    for (const target of [
      { x: 50, y: 110 },
      { x: 90, y: 70 },
      { x: 50, y: 30 },
      { x: 10, y: 70 },
    ]) {
      const scenario: Scenario = {
        id: "contact",
        title: "",
        question: "",
        focus: "",
        seconds: 8,
        controlledPlayerId: "a",
        ballCarrierId: "a",
        referenceActions: [],
        players: [
          { id: "a", team: "home", number: 8, role: "SP", x: 50, y: 70 },
          { id: "b", team: "home", number: 7, role: "PS", ...target },
        ],
      };
      const plan = createPlayback(scenario, [
        {
          id: "pass",
          type: "pass",
          playerId: "a",
          targetId: "b",
          from: { x: 50, y: 70 },
          to: target,
        },
      ]);
      const release = plan.segments[0].turn + PASS_WINDUP_SECONDS;
      const frame = samplePlayback(plan, (release + 0.000001) / plan.duration);
      const before = samplePlayback(plan, (release - 0.000001) / plan.duration);
      const actor = makeActor(asset, scenario.players[0]);
      actor.root.position.set(50, 0, 70);
      actor.pose(frame.motions.get("a")!);
      actor.root.updateMatrixWorld(true);
      const toe = actor.root
        .getObjectByName("mixamorigRightToeBase")!
        .getWorldPosition(new Vector3());
      const ball = new Vector3(frame.ballVisual.x, BALL_REST_HEIGHT, frame.ballVisual.y);
      expect(before.ballInFlight).toBe(false);
      expect(frame.ballInFlight).toBe(true);
      expect(toe.distanceTo(ball)).toBeLessThan(BALL_RADIUS + 0.03);
      actor.dispose();
    }
  });
  it("replays the same real kick after neutral and arbitrary seeks without retaining its last pose", () => {
    const actor = makeActor(asset, { id: "a", team: "home", number: 8, role: "SP", x: 50, y: 70 });
    const base = { moving: false, heading: 0, distance: 0, elapsed: 0, duration: 0 };
    const pose = { ...base, state: "pass" as const, phase: PASS_CONTACT_PHASE, weight: 1 };
    const toe = actor.root.getObjectByName("mixamorigRightToeBase")!;
    const point = () => {
      actor.root.updateMatrixWorld(true);
      return toe.getWorldPosition(new Vector3());
    };
    actor.pose(pose);
    const first = point();
    actor.pose({ ...pose, phase: 0.95 });
    actor.pose(base);
    actor.pose(pose);
    expect(point().distanceTo(first)).toBeLessThan(0.000001);
    actor.dispose();
  });
  it("plays the real Idle while keeping both feet on the ground across repeated loops", () => {
    const actor = makeActor(asset, { id: "a", team: "home", number: 8, role: "SP", x: 50, y: 70 });
    const idle = { heading: 0, distance: 0, moving: false, elapsed: 0, duration: 0 };
    const hand = actor.root.getObjectByName("mixamorigRightHand")!;
    actor.pose(idle, 0);
    actor.root.updateMatrixWorld(true);
    const start = hand.getWorldPosition(new Vector3());
    actor.pose(idle, 0.8);
    actor.root.updateMatrixWorld(true);
    expect(hand.getWorldPosition(new Vector3()).distanceTo(start)).toBeGreaterThan(0.025);
    for (let i = 0; i < 120; i++) {
      actor.pose(idle, i / 30);
      actor.root.updateMatrixWorld(true);
      for (const side of ["Left", "Right"]) {
        const foot = actor.root
          .getObjectByName(`mixamorig${side}ToeBase`)!
          .getWorldPosition(new Vector3());
        expect(foot.y).toBeLessThan(0.025);
        expect(foot.y).toBeGreaterThan(-0.025);
      }
    }
    const duration = asset.clips.idle!.duration;
    actor.pose(idle, duration - 0.00001);
    actor.root.updateMatrixWorld(true);
    const end = hand.getWorldPosition(new Vector3());
    actor.pose(idle, duration + 0.00001);
    actor.root.updateMatrixWorld(true);
    expect(hand.getWorldPosition(new Vector3()).distanceTo(end)).toBeLessThan(0.005);
    actor.dispose();
  });
  it("allows independent Idle phases and blends back continuously from running", () => {
    const player = { id: "a", team: "home" as const, number: 8, role: "SP", x: 50, y: 70 };
    const a = makeActor(asset, player);
    const b = makeActor(asset, { ...player, id: "b" }, 0.8);
    const idle = { heading: 0, distance: 0, moving: false, elapsed: 0, duration: 0 };
    a.pose(idle, 0);
    b.pose(idle, 0);
    expect(a.root.getObjectByName("mixamorigHips")!.position.y).not.toBeCloseTo(
      b.root.getObjectByName("mixamorigHips")!.position.y,
      2,
    );
    a.pose(idle, 0.5);
    const expected = a.root.getObjectByName("mixamorigHips")!.position.clone();
    a.pose({ ...idle, moving: true, elapsed: 1, duration: 4, distance: 2, weight: 0.00001 }, 0.5);
    expect(a.root.getObjectByName("mixamorigHips")!.position.distanceTo(expected)).toBeLessThan(
      0.001,
    );
    a.dispose();
    b.dispose();
  });
  it("matches the supplied Walking stride and removes its forward root travel", () => {
    const bytes = fs.readFileSync(new URL("./assets/walking.fbx", import.meta.url));
    const source = new FBXLoader().parse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
    const raw = source.animations[0].tracks.find((t) => t.name === "mixamorigHips.position")!;
    const stride = Math.hypot(
      raw.values.at(-3)! - raw.values[0],
      raw.values.at(-1)! - raw.values[2],
    );
    expect(stride * asset.scale).toBeCloseTo(WALK_STRIDE_UNITS, 2);
    const walking = asset.clips.walking!;
    expect(walking.duration).toBeCloseTo(31 / 30, 5);
    expect(walking.tracks).toHaveLength(53);
    const normalized = walking.tracks.find((t) => t.name === "mixamorigHips.position")!;
    for (let i = 0; i < normalized.values.length; i += 3) {
      expect(normalized.values[i]).toBe(normalized.values[0]);
      expect(normalized.values[i + 2]).toBe(normalized.values[2]);
    }
    expect(raw.values.at(-1)! - raw.values[2]).toBeGreaterThan(180);
  });
  it("keeps the supporting walking toes grounded and planted in every heading", () => {
    const player = { id: "a", team: "home" as const, number: 8, role: "SP", x: 0, y: 0 };
    const actor = makeActor(asset, player);
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      for (const [side, start, end] of [
        ["Right", 0.02, 0.16],
        ["Left", 0.38, 0.67],
        ["Right", 0.87, 1.16],
      ] as const) {
        let first: Vector3 | undefined;
        for (let phase = start; phase <= end; phase += 0.01) {
          const distance = phase * WALK_STRIDE_UNITS;
          actor.root.position.set(Math.sin(heading) * distance, 0, Math.cos(heading) * distance);
          actor.pose({
            heading,
            distance,
            moving: true,
            gait: "walk",
            elapsed: 1,
            duration: 5,
            weight: 1,
          });
          actor.root.updateMatrixWorld(true);
          const toe = actor.root
            .getObjectByName(`mixamorig${side}ToeBase`)!
            .getWorldPosition(new Vector3());
          first ??= toe.clone();
          expect(Math.abs(toe.y)).toBeLessThan(0.025);
          // Same relative planting tolerance at the larger display scale.
          expect(Math.hypot(toe.x - first.x, toe.z - first.z) / PLAYER_HEIGHT).toBeLessThan(
            0.1 / 6.8,
          );
        }
      }
    }
    actor.dispose();
  });
  it("selects the real walk independently of running and repeats it after a seek", () => {
    const player = { id: "a", team: "home" as const, number: 8, role: "SP", x: 0, y: 0 };
    const a = makeActor(asset, player);
    const b = makeActor(asset, { ...player, id: "b" });
    const motion = {
      heading: 0,
      moving: true,
      distance: WALK_STRIDE_UNITS * 0.15,
      elapsed: 1,
      duration: 5,
      weight: 1,
    };
    a.pose({ ...motion, gait: "walk" });
    b.pose({ ...motion, gait: "run" });
    const leg = a.root.getObjectByName("mixamorigRightLeg")!;
    const first = leg.quaternion.clone();
    expect(first.angleTo(b.root.getObjectByName("mixamorigRightLeg")!.quaternion)).toBeGreaterThan(
      0.1,
    );
    a.pose({ ...motion, gait: "walk", distance: WALK_STRIDE_UNITS * 2.85 });
    a.pose({ ...motion, gait: "walk" });
    expect(leg.quaternion.toArray()).toEqual(first.toArray());
    a.dispose();
    b.dispose();
  });
  it("blends walking continuously into Idle before the next run", () => {
    const actor = makeActor(asset, { id: "a", team: "home", number: 8, role: "SP", x: 0, y: 0 });
    const idle = { heading: 0, distance: 0, moving: false, elapsed: 0, duration: 0 };
    const hand = actor.root.getObjectByName("mixamorigRightHand")!;
    const point = () => {
      actor.root.updateMatrixWorld(true);
      return hand.getWorldPosition(new Vector3());
    };
    actor.pose(idle, 0.5);
    const resting = point();
    actor.pose(
      {
        ...idle,
        moving: true,
        gait: "walk",
        distance: 3,
        elapsed: 1,
        duration: 4,
        weight: 0.00001,
      },
      0.5,
    );
    expect(point().distanceTo(resting)).toBeLessThan(0.001);
    actor.pose(
      { ...idle, moving: true, gait: "run", distance: 3, elapsed: 1, duration: 4, weight: 0.00001 },
      0.5,
    );
    expect(point().distanceTo(resting)).toBeLessThan(0.001);
    actor.dispose();
  });
});

describe("progressive optional animations", () => {
  it("keeps the base model usable when an optional FBX has the wrong skeleton", async () => {
    const local = { ...asset, clips: {}, aerial: {}, aerialStatus: { ...asset.aerialStatus } };
    await expect(
      attachOptionalClips(local, { "idle.fbx": "bad" }, async () => new Group()),
    ).resolves.toBeUndefined();
    expect(local.clips).toEqual({});
    const actor = makeActor(local, {
      id: "test",
      team: "home",
      number: 1,
      role: "M",
      x: 50,
      y: 70,
    });
    expect(() =>
      actor.pose({ moving: true, heading: 0, distance: 1, elapsed: 1, duration: 2 }),
    ).not.toThrow();
    actor.dispose();
  });
  it("applies a late walking clip to actors already displayed in the base scene", () => {
    const lateAsset: RunningModel = { ...asset, clips: {} };
    const player = { id: "test", team: "home" as const, number: 1, role: "M", x: 50, y: 70 };
    const late = makeActor(lateAsset, player);
    const early = makeActor({ ...asset, clips: { walking: asset.clips.walking } }, player);
    lateAsset.clips.walking = asset.clips.walking;
    const motion = {
      moving: true,
      gait: "walk" as const,
      heading: 0,
      distance: 2,
      elapsed: 1,
      duration: 2,
    };
    late.pose(motion);
    early.pose(motion);
    expect(
      late.root
        .getObjectByName("mixamorigLeftUpLeg")!
        .quaternion.angleTo(early.root.getObjectByName("mixamorigLeftUpLeg")!.quaternion),
    ).toBeLessThan(0.00001);
    late.dispose();
    early.dispose();
  });
  it("aborts a stalled asset download at the timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, options: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) =>
            options.signal.addEventListener("abort", () => reject(options.signal.reason), {
              once: true,
            }),
          ),
      ),
    );
    try {
      const request = readAnimationFile("slow.fbx", undefined, 100);
      const rejected = expect(request).rejects.toThrow("trwa za długo");
      await vi.advanceTimersByTimeAsync(100);
      await rejected;
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});

describe("compact motion assets", () => {
  it.each(["idle", "walking", "soccer-pass"] as const)(
    "preserves every original %s motion track and bind height",
    (name) => {
      const original = fs.readFileSync(new URL(`./assets/${name}.fbx`, import.meta.url));
      const compact = fs.readFileSync(new URL(`./assets/${name}.clip.json`, import.meta.url));
      const buffer = (data: Buffer) =>
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      const raw = new FBXLoader().parse(buffer(original), "");
      const restored = parseCompactAnimation(buffer(compact));
      const expected = prepareAdditionalClip(raw, asset.model, name);
      const actual = prepareAdditionalClip(restored, asset.model, name);
      expect(actual.duration).toBe(expected.duration);
      expect(actual.toJSON().tracks).toEqual(expected.toJSON().tracks);
      expect(compact.byteLength).toBeLessThan(original.byteLength / 4);
    },
  );
});
