/** Three.js runtime of the first-person 3v2 lesson.
 *
 * - Logic runs in the fixed 60 Hz simulator; rendering interpolates between the last two
 *   simulated frames, so the action is the same at 30, 60 or 120 FPS.
 * - React is told only about phase changes, never every frame.
 * - Adaptive resolution keeps the frame time in budget; no shadow maps (soft discs instead).
 * - Hidden page → loop and simulation pause. dispose() releases every GPU resource.
 */
import {
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Camera,
  type Mesh,
  type Object3D,
} from "three";
import { loadRunningModel, makeActor, PLAYER_HEIGHT, type RunningModel } from "../mixamo";
import { RUN_STRIDE_UNITS, WALK_STRIDE_UNITS } from "../animation";
import { angleDiff, dist, headingOf, lerpAngle, v, type V } from "./fpMath";
import {
  createSim,
  DT,
  KICK_CLIP_SECONDS,
  ROLES,
  stepSim,
  type Aim,
  type Frame,
  type FpInput,
  type Phase,
  type Role,
  type SimState,
} from "./fpSim";
import type { FpVariant } from "./fpVariants";
import { buildWorld, toWorld, BALL_R } from "./fpWorld";
import { LookController, pitchOf, yawOf, type LookStatus } from "./fpLook";

export const EYE_HEIGHT = 1.68;
const PLAYER_METRES = 1.8;
const AIM_CONE = 0.16; // ≈ 9°: how close to a partner the view must point to aim at him
const MAX_PASS = 45;

/** Fixed-step accumulator: runs `step` a whole number of times per frame, returns the blend. */
export class FixedStep {
  private acc = 0;
  constructor(
    private readonly step = DT,
    private readonly maxFrame = 0.1,
  ) {}
  advance(frameSeconds: number, run: () => boolean | void) {
    this.acc += Math.min(Math.max(0, frameSeconds), this.maxFrame);
    while (this.acc >= this.step) {
      this.acc -= this.step;
      if (run() === false) {
        this.acc = 0;
        break;
      }
    }
    return this.acc / this.step;
  }
  reset() {
    this.acc = 0;
  }
}

/** Adaptive render resolution: lower when frames are slow, raise again when there is room. */
/**
 * Compiles every shader of the scene before the first frame. With the parallel-compile
 * extension (Safari/WebKit, Chrome) the GPU driver works off the main thread, so the first
 * seconds of play do not stutter while materials are seen for the first time. Never fatal:
 * without the extension or on an error the shaders compile on first use, as before.
 */
export async function precompileScene(
  renderer: { compileAsync?: (scene: Object3D, camera: Camera) => Promise<unknown> },
  scene: Object3D,
  camera: Camera,
  signal?: AbortSignal,
) {
  if (typeof renderer.compileAsync !== "function" || signal?.aborted) return;
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    // The first render compiles what is missing.
  }
}

export class AdaptiveResolution {
  ratio: number;
  private avg = 16.7;
  private cooldown = 0;
  constructor(
    private readonly min: number,
    private readonly max: number,
  ) {
    this.ratio = max;
  }
  /** Returns the new pixel ratio when it changes, otherwise null. */
  sample(frameMs: number) {
    this.avg += (Math.min(frameMs, 100) - this.avg) * 0.08;
    this.cooldown -= frameMs;
    if (this.cooldown > 0) return null;
    let next = this.ratio;
    if (this.avg > 19.5 && this.ratio > this.min) next = Math.max(this.min, this.ratio - 0.15);
    else if (this.avg < 14.5 && this.ratio < this.max) next = Math.min(this.max, this.ratio + 0.1);
    if (next === this.ratio) return null;
    this.ratio = next;
    this.cooldown = 1200;
    return next;
  }
}

export type SceneEvent =
  | { type: "ready" }
  | { type: "phase"; phase: Phase }
  | { type: "done"; sim: SimState; inputs: FpInput[] }
  | { type: "playback-end" }
  | { type: "look"; status: LookStatus }
  | { type: "hidden" }
  | { type: "visible" }
  | { type: "context-lost" };

export type AimInfo = { aim: Aim; yaw: number; point: V };

type Actor = ReturnType<typeof makeActor> & { holder: Group; shadow: Mesh };

export async function createFpScene(
  host: HTMLElement,
  onEvent: (e: SceneEvent) => void,
  signal?: AbortSignal,
) {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  const maxRatio = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
  const resolution = new AdaptiveResolution(Math.min(0.85, maxRatio), maxRatio);
  renderer.setPixelRatio(resolution.ratio);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.domElement.className = "fp-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.prepend(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color("#1c2a33");
  scene.fog = new Fog("#24333b", 70, 230);
  scene.add(new HemisphereLight("#dfe8f2", "#3a4a30", 1.5));
  const sun = new DirectionalLight("#fff3df", 2.4);
  sun.position.set(40, 70, 20);
  scene.add(sun);
  const world = buildWorld();
  scene.add(world.group);

  const eye = new PerspectiveCamera(70, 1, 0.05, 500);
  const overhead = new PerspectiveCamera(45, 1, 0.5, 600);
  let camera: PerspectiveCamera = eye;

  const look = new LookController({
    target: host,
    onStatus: (status) => onEvent({ type: "look", status }),
  });

  // --- players
  let asset: RunningModel | null = null;
  const actors = new Map<Role, Actor>();
  try {
    asset = await loadRunningModel(signal);
  } catch (error) {
    if (signal?.aborted) {
      dispose();
      throw error;
    }
    asset = null; // players without the model would be wrong; the UI shows an error then.
  }
  if (signal?.aborted) {
    dispose();
    throw new DOMException("aborted", "AbortError");
  }
  if (!asset) {
    dispose();
    throw new Error("Nie udało się wczytać modeli zawodników.");
  }
  ROLES.forEach((role, i) => {
    const team = role === "ty" || role === "support" || role === "runner" ? "home" : "away";
    const actor = makeActor(
      asset!,
      { id: role, team, number: i + 2, role, x: 0, y: 0, goalkeeper: role === "gk" },
      i * 0.37,
    );
    const holder = new Group();
    holder.scale.setScalar(PLAYER_METRES / PLAYER_HEIGHT);
    holder.add(actor.root);
    const shadow = world.makeShadow(1);
    scene.add(holder);
    scene.add(shadow);
    actors.set(role, { ...actor, holder, shadow });
  });

  // --- state of the current run
  let mode: "idle" | "live" | "playback" = "idle";
  let sim: SimState | null = null;
  let inputs: FpInput[] = [];
  let lastPhase: Phase | null = null;
  let doneSent = false;
  const stepper = new FixedStep();
  let paused = false;
  let frames: Frame[] = [];
  let playTime = 0;
  let playSpeed = 1;
  let playEnd = 0;
  let playStart = 0;
  let playing = false;
  let blend = 0;
  let lastBallRoll = 0;

  const tmp = new Vector3();
  const q = new Quaternion();

  function resize() {
    const w = Math.max(1, host.clientWidth),
      h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    for (const cam of [eye, overhead]) {
      cam.aspect = w / h;
      // Keep a natural horizontal field of view in landscape and in portrait.
      cam.fov = cam === eye ? (w > h ? 62 : 74) : w > h ? 42 : 58;
      cam.updateProjectionMatrix();
    }
  }
  resize();
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  observer?.observe(host);
  window.addEventListener("orientationchange", resize);

  function poseActors(a: Frame, b: Frame, t: number, time: number, hideTy: boolean) {
    ROLES.forEach((role, i) => {
      const actor = actors.get(role)!;
      const p = a.agents[i]!,
        n = b.agents[i]!;
      const x = p.x + (n.x - p.x) * t,
        y = p.y + (n.y - p.y) * t;
      const heading = lerpAngle(p.heading, n.heading, t);
      const speed = p.speed + (n.speed - p.speed) * t;
      const stride = p.stride + (n.stride - p.stride) * t;
      toWorld(x, y, 0, actor.holder.position);
      actor.shadow.position.set(actor.holder.position.x, 0.015, actor.holder.position.z);
      actor.holder.visible = !(hideTy && role === "ty");
      actor.shadow.visible = actor.holder.visible;
      const walking = speed < 2.2;
      const kicking = n.anim === "kick";
      const clipT = kicking ? p.animT + (n.animT - p.animT) * t : 0;
      actor.pose({
        // makeActor faces +Z at 0; pitch heading 0 faces −Z here.
        heading: Math.PI - heading,
        distance: stride * (walking ? WALK_STRIDE_UNITS : RUN_STRIDE_UNITS),
        moving: !kicking && speed > 0.35,
        elapsed: 0,
        duration: 1,
        gait: walking ? "walk" : "run",
        state: kicking ? "pass" : speed > 0.35 ? "move" : "idle",
        phase: kicking ? Math.min(0.999, clipT / KICK_CLIP_SECONDS) : 0,
        weight: kicking
          ? Math.max(0, Math.min(1, clipT / 0.12, (KICK_CLIP_SECONDS - clipT) / 0.2))
          : Math.min(1, speed / 1.2),
        clock: time,
      });
    });
    const bx = a.ball.x + (b.ball.x - a.ball.x) * t,
      by = a.ball.y + (b.ball.y - a.ball.y) * t,
      bh = a.ball.h + (b.ball.h - a.ball.h) * t,
      roll = a.ball.roll + (b.ball.roll - a.ball.roll) * t;
    toWorld(bx, by, Math.max(BALL_R, bh), world.ball.position);
    const dRoll = roll - lastBallRoll;
    lastBallRoll = roll;
    if (Math.abs(dRoll) > 1e-5 && Math.abs(dRoll) < 3) {
      const h = b.ball.heading;
      // Rolling axis: horizontal, perpendicular to the direction of travel.
      tmp.set(-Math.cos(h), 0, -Math.sin(h));
      world.ball.rotateOnWorldAxis(tmp, dRoll / BALL_R);
    }
    world.ballShadow.position.set(world.ball.position.x, 0.012, world.ball.position.z);
    world.ballShadow.scale.setScalar(0.3 * Math.max(0.4, 1 - bh / 6));
    return {
      ty: v(
        a.agents[0]!.x + (b.agents[0]!.x - a.agents[0]!.x) * t,
        a.agents[0]!.y + (b.agents[0]!.y - a.agents[0]!.y) * t,
      ),
    };
  }

  /** What the current view points at: a partner close to the centre of view, else a spot. */
  function currentAim(): AimInfo | null {
    if (!sim) return null;
    const yaw = yawOf(look.quaternion);
    const pitch = pitchOf(look.quaternion);
    const ty = sim.agents.ty.pos;
    const heading = -yaw;
    let bestId: "support" | "runner" | null = null,
      bestErr = AIM_CONE;
    for (const id of ["support", "runner"] as const) {
      const p = sim.agents[id].pos;
      const d = dist(ty, p);
      if (d > MAX_PASS) continue;
      const errYaw = Math.abs(angleDiff(heading, headingOf({ x: p.x - ty.x, y: p.y - ty.y })));
      const errPitch = Math.abs(pitch - Math.atan2(1.0 - EYE_HEIGHT, d));
      const err = Math.hypot(errYaw, errPitch * 0.6);
      if (err < bestErr) {
        bestErr = err;
        bestId = id;
      }
    }
    if (bestId)
      return { aim: { kind: "player", id: bestId }, yaw, point: { ...sim.agents[bestId].pos } };
    const ground = pitch < -0.035 ? Math.min(MAX_PASS, EYE_HEIGHT / Math.tan(-pitch)) : 24;
    const distance = Math.max(4, ground);
    const point = v(ty.x + Math.sin(heading) * distance, ty.y + Math.cos(heading) * distance);
    return { aim: { kind: "point", x: point.x, y: point.y }, yaw, point };
  }

  function updateAimMarker() {
    const aim =
      sim && (sim.phase === "possession" || sim.phase === "touch") && mode === "live"
        ? currentAim()
        : null;
    world.aimRing.visible = !!aim;
    if (aim) toWorld(aim.point.x, aim.point.y, 0.02, world.aimRing.position);
  }

  function placeOverhead(f: Frame) {
    // "From above": high behind the action, framing every outfield player and the ball.
    let minX = f.ball.x,
      maxX = f.ball.x,
      minY = f.ball.y,
      maxY = f.ball.y;
    for (const a of f.agents.slice(0, 5)) {
      minX = Math.min(minX, a.x);
      maxX = Math.max(maxX, a.x);
      minY = Math.min(minY, a.y);
      maxY = Math.max(maxY, a.y);
    }
    const cx = (minX + maxX) / 2,
      cy = (minY + maxY) / 2;
    const spanX = maxX - minX + 12,
      spanY = maxY - minY + 12;
    const tanHalf = Math.tan((overhead.fov * Math.PI) / 360);
    const fit = Math.max(spanY, spanX / overhead.aspect) / (2 * tanHalf);
    const height = Math.max(20, Math.min(70, fit * 0.92));
    toWorld(cx, cy - height * 0.45, height, tmp);
    overhead.position.lerp(tmp, overhead.userData.placed ? 0.05 : 1);
    overhead.userData.placed = true;
    toWorld(cx, cy, 0, tmp);
    overhead.lookAt(tmp);
  }

  // --- loop
  let raf = 0;
  let last = 0;
  let time = 0;
  let hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = last ? (now - last) / 1000 : 0;
    last = now;
    const changed = resolution.sample(dt * 1000);
    if (changed) renderer.setPixelRatio(changed);
    time += dt;
    look.update(dt);
    if (mode === "live" && sim) {
      if (!paused && sim.phase !== "done") {
        blend = stepper.advance(dt, () => {
          stepSim(sim!, inputs);
          if (sim!.phase !== lastPhase) {
            lastPhase = sim!.phase;
            onEvent({ type: "phase", phase: sim!.phase });
          }
          return sim!.phase !== "done";
        });
      }
      if (sim.phase === "done" && !doneSent) {
        doneSent = true;
        onEvent({ type: "done", sim, inputs: [...inputs] });
      }
      const n = sim.frames.length;
      const a = sim.frames[Math.max(0, n - 2)]!,
        b = sim.frames[n - 1]!;
      const pose = poseActors(a, b, sim.phase === "done" ? 1 : blend, time, camera === eye);
      if (camera === eye) {
        toWorld(pose.ty.x, pose.ty.y, EYE_HEIGHT, eye.position);
        eye.quaternion.copy(look.quaternion);
      } else placeOverhead(b);
      updateAimMarker();
    } else if (mode === "playback" && frames.length) {
      if (playing && !paused) {
        playTime = Math.min(playEnd, playTime + dt * playSpeed);
        if (playTime >= playEnd) {
          playing = false;
          onEvent({ type: "playback-end" });
        }
      }
      const f = playTime / DT;
      const i = Math.min(frames.length - 1, Math.floor(f));
      const a = frames[i]!,
        b = frames[Math.min(frames.length - 1, i + 1)]!;
      poseActors(a, b, f - i, time, false);
      placeOverhead(b);
      world.aimRing.visible = false;
    }
    renderer.render(scene, camera);
  }
  function startLoop() {
    if (raf || hidden) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  const onVisibility = () => {
    const nowHidden = document.visibilityState === "hidden";
    if (nowHidden === hidden) return;
    hidden = nowHidden;
    if (hidden) {
      stopLoop();
      stepper.reset();
      onEvent({ type: "hidden" });
    } else {
      look.resume();
      onEvent({ type: "visible" });
      startLoop();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  const onLost = (e: Event) => {
    e.preventDefault();
    stopLoop();
    onEvent({ type: "context-lost" });
  };
  renderer.domElement.addEventListener("webglcontextlost", onLost);

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    stopLoop();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("orientationchange", resize);
    renderer.domElement.removeEventListener("webglcontextlost", onLost);
    observer?.disconnect();
    look.dispose();
    actors.forEach((a) => a.dispose());
    actors.clear();
    world.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }

  await precompileScene(renderer, scene, camera, signal);
  if (signal?.aborted) {
    dispose();
    throw new DOMException("aborted", "AbortError");
  }
  startLoop();
  onEvent({ type: "ready" });

  return {
    look,
    /** First-person live action of a variant. */
    startLive(variant: FpVariant) {
      sim = createSim(variant);
      inputs = [];
      lastPhase = sim.phase;
      doneSent = false;
      stepper.reset();
      paused = false;
      mode = "live";
      camera = eye;
      lastBallRoll = 0;
      // Start looking at the passer: the ball comes from there.
      const ty = variant.start.ty,
        passer = variant.start.support;
      look.recenter(-headingOf({ x: passer.x - ty.x, y: passer.y - ty.y }));
      onEvent({ type: "phase", phase: sim.phase });
    },
    /** Thumb button: first touch before the ball arrives, pass with the ball. */
    primary(lofted = false) {
      if (!sim || mode !== "live" || paused) return false;
      const aim = currentAim();
      if (!aim) return false;
      if (sim.phase === "build" || sim.phase === "incoming") {
        inputs.push({ tick: sim.tick, kind: "touch", dir: -aim.yaw });
        return "touch" as const;
      }
      if (sim.phase === "possession" || sim.phase === "touch") {
        inputs.push({
          tick: sim.tick,
          kind: "pass",
          aim: aim.aim,
          ...(lofted ? { lofted: true } : {}),
        });
        return "pass" as const;
      }
      return false;
    },
    carry() {
      if (!sim || mode !== "live" || paused || sim.phase !== "possession") return false;
      inputs.push({ tick: sim.tick, kind: "carry", dir: -yawOf(look.quaternion) });
      return true;
    },
    recenterForward() {
      look.recenter(0);
    },
    /** Points the view at a player (browser QA and tests). */
    lookAt(role: Role) {
      if (!sim) return;
      const from = sim.agents.ty.pos,
        to = sim.agents[role].pos;
      look.recenter(-headingOf({ x: to.x - from.x, y: to.y - from.y }));
    },
    /** Plays recorded frames from above (demonstration and replay). */
    playFrames(next: Frame[], from = 0, speed = 1) {
      frames = next;
      mode = "playback";
      camera = overhead;
      overhead.userData.placed = false;
      playStart = from * DT;
      playTime = playStart;
      playEnd = (next.length - 1) * DT;
      playSpeed = speed;
      playing = true;
      lastBallRoll = next[Math.min(next.length - 1, from)]?.ball.roll ?? 0;
    },
    setPlaying(on: boolean) {
      if (on && playTime >= playEnd) playTime = playStart;
      playing = on;
    },
    seek(fraction: number) {
      playTime = playStart + (playEnd - playStart) * Math.max(0, Math.min(1, fraction));
    },
    progress() {
      return playEnd > playStart ? (playTime - playStart) / (playEnd - playStart) : 0;
    },
    setPaused(on: boolean) {
      paused = on;
      stepper.reset();
    },
    debugState: () => ({
      mode,
      phase: sim?.phase,
      tick: sim?.tick,
      ratio: resolution.ratio,
      look: look.status,
      q: q.toArray(),
    }),
    dispose,
  };
}
export type FpScene = Awaited<ReturnType<typeof createFpScene>>;
