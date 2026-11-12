/** Three.js runtime of the first-person 5v5 lesson (ten players on a 40 × 25 m pitch).
 *
 * - Logic runs in the fixed 60 Hz simulator; rendering interpolates between the last two
 *   simulated frames, so play is the same at 30, 60 or 120 FPS.
 * - Three directions are kept apart: the camera (phone orientation or drag), the body
 *   (simulated, turns with limited speed) and the movement (joystick). The joystick direction
 *   is fixed relative to the view at the moment the thumb goes down, so looking around while
 *   running never bends the run; lifting the thumb and pressing again takes the new view.
 * - React hears only about state changes (with/without the ball, end), never every frame.
 * - Shared world resources, adaptive resolution, no shadow maps (soft discs instead), pause
 *   when hidden, and dispose() releases every GPU resource.
 */
import {
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from "three";
import { loadRunningModel, makeActor, PLAYER_HEIGHT, type RunningModel } from "../mixamo";
import { RUN_STRIDE_UNITS, WALK_STRIDE_UNITS } from "../animation";
import { angleDiff, dist, headingOf, lerpAngle, v, type V } from "../firstPerson/fpMath";
import { AdaptiveResolution, EYE_HEIGHT, FixedStep, precompileScene } from "../firstPerson/fpScene";
import { buildWorld, toWorld, BALL_R } from "../firstPerson/fpWorld";
import { LookController, pitchOf, yawOf, type LookStatus } from "../firstPerson/fpLook";
import {
  createSim,
  DT,
  KICK_CLIP_SECONDS,
  stepSim,
  type F5Input,
  type Frame,
  type KickType,
  type SimState,
} from "./f5Sim";
import { F5_PITCH, PLAYER_COUNT, type F5Variant } from "./f5Variants";
import { quantMove } from "./f5Bot";
import { startYaw } from "./f5Debrief";

const PLAYER_METRES = 1.8;
/** Eye this far behind you (m) and the drag view this far down (rad): the ball at your feet
 * shows at the bottom of the picture, as in the reference picture. */
const EYE_BEHIND = 1.4;
const LOOK_PITCH = -0.24;
/** View from behind (third person): camera this far behind you and this high (m). */
const BEHIND_DISTANCE = 5;
const BEHIND_HEIGHT = 2.9;
export type F5View = "eye" | "behind";
// Kits after the reference picture: light blue with navy shorts, maroon.
const HOME_KIT = { shirt: "#7cc0ea", shorts: "#1d2f52" };
const AWAY_KIT = { shirt: "#7c2334", shorts: "#4a1420" };
const AIM_CONE = 0.14; // ≈ 8°: how close to a partner the view must point to aim at him

/** What the screen needs to show the right buttons; sent only when it changes. */
export type HudState = {
  /** with: you have the ball · attack: your team has it · defend: the rivals have it. */
  mode: "with" | "attack" | "defend" | "wait";
};

export type F5SceneEvent =
  | { type: "ready" }
  | { type: "hud"; hud: HudState }
  | { type: "done"; sim: SimState; inputs: F5Input[] }
  | { type: "playback-end" }
  | { type: "look"; status: LookStatus }
  | { type: "hidden" }
  | { type: "visible" }
  | { type: "context-lost" };

type Actor = ReturnType<typeof makeActor> & { holder: Group; shadow: Mesh };

export async function createF5Scene(
  host: HTMLElement,
  onEvent: (e: F5SceneEvent) => void,
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
  // Sunny afternoon (after the reference picture): bright sky, warm low sun, light haze.
  scene.background = new Color("#a9c6df");
  scene.fog = new Fog("#b7cadb", 70, 240);
  scene.add(new HemisphereLight("#e8f1fb", "#4d6a3a", 1.7));
  const sun = new DirectionalLight("#fff1d6", 2.8);
  sun.position.set(-40, 55, 25);
  scene.add(sun);
  const world = buildWorld({ ...F5_PITCH, small: true }, { day: true });
  scene.add(world.group);

  // Far planes beyond the sky dome (radius 400) so it is never clipped.
  const eye = new PerspectiveCamera(72, 1, 0.05, 900);
  const overhead = new PerspectiveCamera(45, 1, 0.5, 900);
  // In the replay from above: a ring under you, so you can find yourself.
  const youGeo = new RingGeometry(0.62, 0.82, 32);
  const youMat = new MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const youRing = new Mesh(youGeo, youMat);
  youRing.rotation.x = -Math.PI / 2;
  youRing.visible = false;
  scene.add(youRing);
  let youIndex: number | null = null;
  let camera: PerspectiveCamera = eye;

  const look = new LookController({
    target: host,
    initialPitch: LOOK_PITCH,
    onStatus: (status) => onEvent({ type: "look", status }),
  });

  const actors: Actor[] = [];
  let asset: RunningModel | null;
  try {
    asset = await loadRunningModel(signal);
  } catch (error) {
    if (signal?.aborted) {
      dispose();
      throw error;
    }
    asset = null; // players without the model would be wrong; the UI shows an error then
  }
  if (signal?.aborted) {
    dispose();
    throw new DOMException("aborted", "AbortError");
  }
  if (!asset) {
    dispose();
    throw new Error("Nie udało się wczytać modeli zawodników.");
  }
  for (let i = 0; i < PLAYER_COUNT; i++) {
    const team = i < 5 ? "home" : "away";
    const actor = makeActor(
      asset,
      {
        id: `p${i}`,
        team,
        number: i + 1,
        role: i % 5 === 0 ? "gk" : "field",
        x: 0,
        y: 0,
        goalkeeper: i % 5 === 0,
      },
      i * 0.37,
      team === "home" ? HOME_KIT : AWAY_KIT,
    );
    const holder = new Group();
    holder.scale.setScalar(PLAYER_METRES / PLAYER_HEIGHT);
    holder.add(actor.root);
    const shadow = world.makeShadow(1);
    scene.add(holder);
    scene.add(shadow);
    actors.push({ ...actor, holder, shadow });
  }

  // --- state of the current run
  let mode: "idle" | "live" | "playback" = "idle";
  let sim: SimState | null = null;
  let inputs: F5Input[] = [];
  let doneSent = false;
  const stepper = new FixedStep(DT);
  let paused = false;
  let frames: Frame[] = [];
  let playTime = 0,
    playSpeed = 1,
    playEnd = 0,
    playStart = 0,
    playing = false,
    blend = 0,
    lastBallRoll = 0;
  let hud: HudState["mode"] | null = null;
  // Joystick: direction relative to the view when the thumb went down.
  let stickRef: number | null = null;
  let lastMove = { dir: 0, speed: 0 };
  const queued: F5Input[] = [];

  const tmp = new Vector3();
  // The eye sits a little behind you, so the ball at your feet is in the picture. It
  // follows the body heading smoothly (never the look), so looking around never moves it.
  // From behind (third person) the camera circles you with the look, higher and further
  // back, and your own player is drawn.
  const camAt = v(0, 0);
  let view: F5View = "eye";
  let camHeight = EYE_HEIGHT;
  let camHeading: number | null = null,
    camTime = 0;
  function placeEye(x: number, y: number, heading: number, time: number) {
    const dt = Math.min(0.1, Math.max(0, time - camTime));
    camTime = time;
    camHeading =
      camHeading === null
        ? heading
        : camHeading + angleDiff(camHeading, heading) * (1 - Math.exp(-dt / 0.25));
    const behind = view === "behind";
    const around = behind ? -yawOf(look.quaternion) : camHeading;
    const back = behind ? BEHIND_DISTANCE : EYE_BEHIND;
    camHeight = behind ? BEHIND_HEIGHT : EYE_HEIGHT;
    camAt.x = x - Math.sin(around) * back;
    camAt.y = y - Math.cos(around) * back;
    toWorld(camAt.x, camAt.y, camHeight, eye.position);
  }

  function resize() {
    const w = Math.max(1, host.clientWidth),
      h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    for (const cam of [eye, overhead]) {
      cam.aspect = w / h;
      cam.fov = cam === eye ? (w > h ? 64 : 76) : w > h ? 42 : 58;
      cam.updateProjectionMatrix();
    }
  }
  resize();
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  observer?.observe(host);
  window.addEventListener("orientationchange", resize);

  function poseActors(a: Frame, b: Frame, t: number, time: number, hide: number | null) {
    for (let i = 0; i < PLAYER_COUNT; i++) {
      const actor = actors[i]!;
      const p = a.agents[i]!,
        n = b.agents[i]!;
      const x = p.x + (n.x - p.x) * t,
        y = p.y + (n.y - p.y) * t;
      const heading = lerpAngle(p.heading, n.heading, t);
      const speed = p.speed + (n.speed - p.speed) * t;
      const stride = p.stride + (n.stride - p.stride) * t;
      toWorld(x, y, 0, actor.holder.position);
      actor.shadow.position.set(actor.holder.position.x, 0.015, actor.holder.position.z);
      actor.holder.visible = hide !== i;
      actor.shadow.visible = actor.holder.visible;
      const walking = speed < 2.2;
      const kicking = n.anim === "kick";
      const clipT = kicking ? p.animT + (n.animT - p.animT) * t : 0;
      actor.pose({
        heading: Math.PI - heading,
        // Feet follow the ground: the clip advances with the distance actually covered.
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
    }
    const bx = a.ball.x + (b.ball.x - a.ball.x) * t,
      by = a.ball.y + (b.ball.y - a.ball.y) * t,
      bh = a.ball.h + (b.ball.h - a.ball.h) * t,
      roll = a.ball.roll + (b.ball.roll - a.ball.roll) * t;
    toWorld(bx, by, Math.max(BALL_R, bh), world.ball.position);
    const dRoll = roll - lastBallRoll;
    lastBallRoll = roll;
    if (Math.abs(dRoll) > 1e-5 && Math.abs(dRoll) < 3) {
      const h = b.ball.heading;
      tmp.set(-Math.cos(h), 0, -Math.sin(h));
      world.ball.rotateOnWorldAxis(tmp, dRoll / BALL_R);
    }
    world.ballShadow.position.set(world.ball.position.x, 0.012, world.ball.position.z);
    world.ballShadow.scale.setScalar(0.3 * Math.max(0.4, 1 - bh / 6));
  }

  /** Partner close to the centre of the view (pass target), or null. */
  function aimedPartner(): number | null {
    if (!sim) return null;
    const yaw = yawOf(look.quaternion);
    const pitch = pitchOf(look.quaternion);
    const ty = sim.players[sim.ty]!.pos;
    const heading = -yaw;
    let best: number | null = null,
      bestErr = AIM_CONE;
    for (let i = 0; i < 5; i++) {
      if (i === sim.ty) continue;
      const p = sim.players[i]!.pos;
      const d = dist(ty, p);
      if (d > 35 || d < 1.5) continue;
      const errYaw = Math.abs(angleDiff(heading, headingOf({ x: p.x - ty.x, y: p.y - ty.y })));
      const errPitch = Math.abs(pitch - Math.atan2(1.0 - camHeight, Math.max(0.5, dist(camAt, p))));
      const err = Math.hypot(errYaw, errPitch * 0.6);
      if (err < bestErr) {
        bestErr = err;
        best = i;
      }
    }
    return best;
  }

  function aimPoint(): V | null {
    if (!sim) return null;
    const partner = aimedPartner();
    if (partner !== null) return { ...sim.players[partner]!.pos };
    const yaw = yawOf(look.quaternion),
      pitch = pitchOf(look.quaternion);
    const ty = sim.players[sim.ty]!.pos;
    // Where the view meets the grass, measured from the camera (it sits behind you).
    const ground = pitch < -0.04 ? Math.min(30, camHeight / Math.tan(-pitch)) : 18;
    const aim = v(camAt.x + Math.sin(-yaw) * ground, camAt.y + Math.cos(-yaw) * ground);
    const d = Math.max(3, dist(ty, aim));
    const h = headingOf({ x: aim.x - ty.x, y: aim.y - ty.y });
    return v(ty.x + Math.sin(h) * d, ty.y + Math.cos(h) * d);
  }

  function updateHud() {
    if (!sim || mode !== "live") return;
    const owner = sim.ball.owner;
    const next: HudState["mode"] =
      sim.phase === "restart"
        ? "wait"
        : owner === sim.ty
          ? "with"
          : owner !== null
            ? owner < 5
              ? "attack"
              : "defend"
            : sim.possession === "away"
              ? "defend"
              : "attack";
    if (next !== hud) {
      hud = next;
      onEvent({ type: "hud", hud: { mode: next } });
    }
  }

  function placeOverhead(f: Frame) {
    // From above and behind your team's attack, framing the ball and the players near it.
    let minX = f.ball.x,
      maxX = f.ball.x,
      minY = f.ball.y,
      maxY = f.ball.y;
    const whole = frames.length === 1 && mode === "playback";
    for (const a of f.agents) {
      if (!whole && Math.hypot(a.x - f.ball.x, a.y - f.ball.y) > 16) continue;
      minX = Math.min(minX, a.x);
      maxX = Math.max(maxX, a.x);
      minY = Math.min(minY, a.y);
      maxY = Math.max(maxY, a.y);
    }
    const cx = (minX + maxX) / 2,
      cy = (minY + maxY) / 2;
    const spanX = maxX - minX + 10,
      spanY = maxY - minY + 10;
    const tanHalf = Math.tan((overhead.fov * Math.PI) / 360);
    const fit = Math.max(spanY, spanX / overhead.aspect) / (2 * tanHalf);
    const height = Math.max(16, Math.min(42, fit * 0.95));
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
          const now = queued.splice(0).map((x) => ({ ...x, tick: sim!.tick }));
          inputs.push(...now);
          stepSim(sim!, now);
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
      poseActors(
        a,
        b,
        sim.phase === "done" ? 1 : blend,
        time,
        camera === eye && view === "eye" ? sim.ty : null,
      );
      if (camera === eye) {
        const p = a.agents[sim.ty]!,
          q = b.agents[sim.ty]!;
        const t = sim.phase === "done" ? 1 : blend;
        placeEye(
          p.x + (q.x - p.x) * t,
          p.y + (q.y - p.y) * t,
          lerpAngle(p.heading, q.heading, t),
          time,
        );
        eye.quaternion.copy(look.quaternion);
      } else placeOverhead(b);
      const aim = sim.ball.owner === sim.ty ? aimPoint() : null;
      world.aimRing.visible = !!aim;
      if (aim) toWorld(aim.x, aim.y, 0.02, world.aimRing.position);
      updateHud();
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
      poseActors(a, b, f - i, time, null);
      placeOverhead(b);
      world.aimRing.visible = false;
      if (youIndex !== null) {
        const p = a.agents[youIndex]!,
          q = b.agents[youIndex]!,
          t = f - i;
        toWorld(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t, 0.03, youRing.position);
      }
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
    actors.length = 0;
    world.dispose();
    youGeo.dispose();
    youMat.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }

  const live = () => !!sim && mode === "live" && !paused && sim.phase !== "done";
  const sendMove = (dir: number, speed: number) => {
    const q = quantMove(dir, speed);
    if (q.speed === lastMove.speed && (q.speed === 0 || q.dir === lastMove.dir)) return;
    lastMove = q;
    queued.push({ tick: 0, kind: "move", ...q });
  };

  await precompileScene(renderer, scene, camera, signal);
  if (signal?.aborted) {
    dispose();
    throw new DOMException("aborted", "AbortError");
  }
  startLoop();
  onEvent({ type: "ready" });

  return {
    look,
    /** First-person live fragment of a variant (starts paused until setPaused(false)). */
    /** The starting picture of a variant, from above (before play). */
    preview(variant: F5Variant) {
      const start = createSim(variant);
      this.playFrames(start.frames, 0, 1, start.ty);
      playing = false;
    },
    startLive(variant: F5Variant) {
      youRing.visible = false;
      sim = createSim(variant);
      inputs = [];
      queued.length = 0;
      doneSent = false;
      stepper.reset();
      paused = false;
      mode = "live";
      camera = eye;
      lastBallRoll = 0;
      hud = null;
      stickRef = null;
      lastMove = { dir: 0, speed: 0 };
      camHeading = null;
      // Start looking at your keeper: the first ball comes from him.
      look.recenter(startYaw(sim));
    },
    /** Joystick vector (x right, y forward, length 0…1). null: thumb lifted. */
    stick(vec: { x: number; y: number } | null) {
      if (!live()) return;
      if (!vec || Math.hypot(vec.x, vec.y) < 0.12) {
        stickRef = null;
        sendMove(lastMove.dir, 0);
        return;
      }
      // The run is relative to the view at the moment the thumb went down.
      if (stickRef === null) stickRef = -yawOf(look.quaternion);
      const dir = stickRef + Math.atan2(vec.x, vec.y);
      sendMove(dir, Math.min(1, Math.hypot(vec.x, vec.y)));
    },
    /** Pass, shot or lofted ball where the view points; power 0…1 from the hold. */
    kick(type: KickType, power: number) {
      if (!live() || !sim) return false;
      const ty = sim.players[sim.ty]!;
      const has =
        sim.ball.owner === sim.ty ||
        (sim.ball.owner === null && dist(ty.pos, sim.ball.pos) < 1.1 && sim.ball.h < 0.7);
      if (!has) return false;
      const yaw = yawOf(look.quaternion);
      const partner = type === "shot" ? null : aimedPartner();
      queued.push({
        tick: 0,
        kind: "kick",
        type,
        dir: -yaw,
        pitch: pitchOf(look.quaternion),
        power: Math.max(0, Math.min(1, power)),
        ...(partner !== null ? { target: partner } : {}),
      });
      return true;
    },
    press() {
      if (!live()) return false;
      queued.push({ tick: 0, kind: "press" });
      return true;
    },
    tackle() {
      if (!live()) return false;
      queued.push({ tick: 0, kind: "tackle" });
      return true;
    },
    /** The current phone direction becomes the direction towards the rivals' goal. */
    /** First person (eye) or from behind (third person); can change during play. */
    setView(next: F5View) {
      view = next;
    },
    recenterForward() {
      look.recenter(0);
      stickRef = null;
    },
    /** Points the view at a player (browser QA and tests). */
    lookAt(index: number) {
      if (!sim) return;
      const from = sim.players[sim.ty]!.pos,
        to = sim.players[index]!.pos;
      look.recenter(-headingOf({ x: to.x - from.x, y: to.y - from.y }));
    },
    /** Plays recorded frames from above. `you`: the player to mark with a ring. */
    playFrames(next: Frame[], from = 0, speed = 1, you: number | null = null) {
      frames = next;
      youIndex = you;
      youRing.visible = you !== null;
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
    progress() {
      return playEnd > playStart ? (playTime - playStart) / (playEnd - playStart) : 0;
    },
    setPaused(on: boolean) {
      paused = on;
      stepper.reset();
      if (on) {
        stickRef = null;
        if (sim && lastMove.speed > 0) sendMove(lastMove.dir, 0);
      }
    },
    debugState: () => ({
      mode,
      phase: sim?.phase,
      tick: sim?.tick,
      owner: sim?.ball.owner,
      possession: sim?.possession,
      ty: sim ? { ...sim.players[sim.ty]!.pos, heading: sim.players[sim.ty]!.heading } : null,
      move: { ...lastMove },
      viewYaw: yawOf(look.quaternion),
      ratio: resolution.ratio,
      look: look.status,
      inputs: inputs.length,
    }),
    dispose,
  };
}
export type F5Scene = Awaited<ReturnType<typeof createF5Scene>>;
