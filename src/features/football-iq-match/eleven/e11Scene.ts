/** Three.js runtime of the 11v11 lesson, played from behind your player (third person).
 *
 * - Logic runs in the fixed 60 Hz simulator (e11Sim); rendering interpolates between the last
 *   two simulated frames, so play is the same at 30, 60 or 120 FPS.
 * - The camera stands behind and above you and mostly faces the rivals' goal (like a game on
 *   television), turning only a little with your run; the joystick is relative to that view.
 * - Team-mates carry a number chip on the screen: a tap passes to him, to his feet or into the
 *   space ahead of him depending on the pass mode. The chips are plain DOM elements moved every
 *   frame here, so React never re-renders at 60 Hz.
 * - With hints the offside line is drawn on the grass and a chip turns red when that player
 *   would be offside now. Without hints you read the line yourself.
 * - Shared world resources, adaptive resolution, pause when hidden, and dispose() releases
 *   every GPU resource.
 */
import {
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { loadRunningModel, makeActor, PLAYER_HEIGHT, type RunningModel } from "../mixamo";
import { RUN_STRIDE_UNITS, WALK_STRIDE_UNITS } from "../animation";
import { angleDiff, clamp, headingOf, lerpAngle } from "../firstPerson/fpMath";
import { AdaptiveResolution, FixedStep, precompileScene } from "../firstPerson/fpScene";
import { buildWorld, toWorld, BALL_R } from "../firstPerson/fpWorld";
import { quantMove } from "../fiveAside/f5Bot";
import {
  createSim,
  DT,
  frameOf,
  isOffside,
  KICK_CLIP_SECONDS,
  offsideLine,
  stepSim,
  type E11Input,
  type Frame,
  type SimState,
} from "./e11Sim";
import {
  E11,
  PLAYER_COUNT,
  PLAYERS_PER_TEAM,
  shirtOf,
  slotIndex,
  type E11Variant,
} from "./e11Variants";

const PLAYER_METRES = 1.85;
const BACK_DISTANCE = 10.5;
const CAM_HEIGHT = 6.2;
const LOOK_AHEAD = 15;
/** The view follows your run but never turns more than this away from the rivals' goal. */
const MAX_YAW = 0.6;
const HOME_KIT = { shirt: "#7cc0ea", shorts: "#1d2f52" };
const AWAY_KIT = { shirt: "#7c2334", shorts: "#4a1420" };

export type E11HudMode = "with" | "attack" | "wait";
export type E11SceneEvent =
  | { type: "ready" }
  | { type: "hud"; mode: E11HudMode }
  | { type: "done"; sim: SimState; inputs: E11Input[] }
  | { type: "hidden" }
  | { type: "visible" }
  | { type: "context-lost" };

type Actor = ReturnType<typeof makeActor> & { holder: Group; shadow: Mesh };

export async function createE11Scene(
  host: HTMLElement,
  onEvent: (e: E11SceneEvent) => void,
  signal?: AbortSignal,
) {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  const maxRatio = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
  const resolution = new AdaptiveResolution(Math.min(0.8, maxRatio), maxRatio);
  renderer.setPixelRatio(resolution.ratio);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.domElement.className = "fp-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.prepend(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color("#a9c6df");
  scene.fog = new Fog("#b7cadb", 90, 300);
  scene.add(new HemisphereLight("#e8f1fb", "#4d6a3a", 1.7));
  const sun = new DirectionalLight("#fff1d6", 2.8);
  sun.position.set(-40, 55, 25);
  scene.add(sun);
  const world = buildWorld({ ...E11 }, { day: true });
  scene.add(world.group);
  const camera = new PerspectiveCamera(60, 1, 0.1, 900);

  // The offside line on the grass (hints only).
  const lineGeo = new PlaneGeometry(E11.halfWidth * 2, 0.5);
  const lineMat = new MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  const lineMesh = new Mesh(lineGeo, lineMat);
  lineMesh.rotation.x = -Math.PI / 2;
  lineMesh.visible = false;
  scene.add(lineMesh);

  let asset: RunningModel | null;
  try {
    asset = await loadRunningModel(signal);
  } catch (error) {
    if (signal?.aborted) {
      dispose();
      throw error;
    }
    asset = null;
  }
  if (signal?.aborted) {
    dispose();
    throw new DOMException("aborted", "AbortError");
  }
  if (!asset) {
    dispose();
    throw new Error("Nie udało się wczytać modeli zawodników.");
  }
  const actors: Actor[] = [];
  for (let i = 0; i < PLAYER_COUNT; i++) {
    const team = i < PLAYERS_PER_TEAM ? "home" : "away";
    const keeper = i % PLAYERS_PER_TEAM === 0;
    const actor = makeActor(
      asset,
      {
        id: `p${i}`,
        team,
        number: shirtOf(i),
        role: keeper ? "gk" : "field",
        x: 0,
        y: 0,
        goalkeeper: keeper,
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

  // --- number chips over your team-mates and the clock
  const layer = document.createElement("div");
  layer.className = "e11-chips";
  host.append(layer);
  const chips: (HTMLButtonElement | null)[] = [];
  const clock = document.createElement("div");
  clock.className = "e11-clock";
  layer.append(clock);

  // --- state of the current run
  let sim: SimState | null = null;
  let inputs: E11Input[] = [];
  let doneSent = false;
  let paused = true;
  let hints = true;
  let throughMode = true;
  let live = false;
  const stepper = new FixedStep(DT);
  const queued: E11Input[] = [];
  let prev: Frame | null = null;
  let cur: Frame | null = null;
  let blend = 0;
  let lastBallRoll = 0;
  let hud: E11HudMode | null = null;
  let lastMove = { dir: 0, speed: 0 };
  let camYaw = 0;
  let camTime = 0;
  let lastClock = -1;
  const tmp = new Vector3();
  const proj = new Vector3();

  function makeChips() {
    for (const c of chips) c?.remove();
    chips.length = 0;
    for (let i = 0; i < PLAYERS_PER_TEAM; i++) {
      if (i === 0) {
        chips.push(null);
        continue;
      }
      const b = document.createElement("button");
      b.type = "button";
      b.className = "e11-chip";
      b.dataset.index = String(i);
      b.setAttribute("aria-label", `Podaj do numeru ${shirtOf(i)}`);
      b.textContent = String(shirtOf(i));
      b.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        api.pass(i);
      });
      layer.append(b);
      chips.push(b);
    }
  }
  makeChips();

  function resize() {
    const w = Math.max(1, host.clientWidth),
      h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w > h ? 58 : 72;
    camera.updateProjectionMatrix();
  }
  resize();
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  observer?.observe(host);
  window.addEventListener("orientationchange", resize);

  function pose(a: Frame, b: Frame, t: number, time: number) {
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
      const walking = speed < 2.2;
      const kicking = n.anim === "kick";
      const clipT = kicking ? p.animT + (n.animT - p.animT) * t : 0;
      actor.pose({
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

  /** Behind and above you, mostly facing the rivals' goal; the run turns it a little. */
  function placeCamera(x: number, y: number, heading: number, time: number) {
    const dt = Math.min(0.1, Math.max(0, time - camTime));
    camTime = time;
    const want = clamp(heading * 0.55, -MAX_YAW, MAX_YAW);
    camYaw += angleDiff(camYaw, want) * (1 - Math.exp(-dt / 0.6));
    const bx = x - Math.sin(camYaw) * BACK_DISTANCE;
    const by = y - Math.cos(camYaw) * BACK_DISTANCE;
    toWorld(bx, by, CAM_HEIGHT, camera.position);
    toWorld(x + Math.sin(camYaw) * LOOK_AHEAD, y + Math.cos(camYaw) * LOOK_AHEAD, 1.1, tmp);
    camera.lookAt(tmp);
  }

  function placeChips() {
    if (!sim || !cur) return;
    const line = offsideLine(sim.players, sim.ball.pos.y);
    const w = host.clientWidth,
      h = host.clientHeight;
    for (let i = 1; i < PLAYERS_PER_TEAM; i++) {
      const chip = chips[i];
      if (!chip) continue;
      const p = sim.players[i]!;
      toWorld(p.pos.x, p.pos.y, 2.25, proj);
      proj.project(camera);
      const visible =
        proj.z < 1 && Math.abs(proj.x) < 1.04 && Math.abs(proj.y) < 1.04 && i !== sim.ty;
      const next = visible
        ? `translate(${((proj.x + 1) / 2) * w}px, ${((1 - proj.y) / 2) * h}px) translate(-50%, -100%)`
        : "";
      if (chip.dataset.t !== next) {
        chip.dataset.t = next;
        chip.style.transform = next;
        chip.style.display = visible ? "" : "none";
      }
      const state = hints ? (isOffside(p, line) ? "off" : "on") : "";
      if (chip.dataset.state !== state) chip.dataset.state = state;
    }
    if (hints) {
      lineMesh.visible = true;
      toWorld(0, line, 0.03, lineMesh.position);
    } else lineMesh.visible = false;
  }

  function updateHud() {
    if (!sim || !live) return;
    const owner = sim.ball.owner;
    const next: E11HudMode =
      sim.phase === "restart" ? "wait" : owner === sim.ty ? "with" : "attack";
    if (next !== hud) {
      hud = next;
      onEvent({ type: "hud", mode: next });
    }
    const seconds = Math.floor(sim.tick * DT);
    if (seconds !== lastClock) {
      lastClock = seconds;
      clock.textContent = `${seconds} s`;
    }
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
    if (sim && live) {
      if (!paused && sim.phase !== "done") {
        blend = stepper.advance(dt, () => {
          const now = queued.splice(0).map((x) => ({ ...x, tick: sim!.tick }));
          inputs.push(...now);
          stepSim(sim!, now);
          prev = cur;
          cur = frameOf(sim!);
          return sim!.phase !== "done";
        });
      }
      if (sim.phase === "done" && !doneSent) {
        doneSent = true;
        onEvent({ type: "done", sim, inputs: [...inputs] });
      }
      const b = cur!,
        a = prev ?? b;
      const t = sim.phase === "done" ? 1 : blend;
      pose(a, b, t, time);
      const p = a.agents[sim.ty]!,
        q = b.agents[sim.ty]!;
      placeCamera(
        p.x + (q.x - p.x) * t,
        p.y + (q.y - p.y) * t,
        lerpAngle(p.heading, q.heading, t),
        time,
      );
      placeChips();
      updateHud();
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
    actors.forEach((a) => a.dispose());
    actors.length = 0;
    world.dispose();
    lineGeo.dispose();
    lineMat.dispose();
    layer.remove();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }

  const canAct = () => !!sim && live && !paused && sim.phase === "play";
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

  const api = {
    /** The starting picture of a variant, from behind your player (before play). */
    preview(variant: E11Variant, showHints = hints) {
      live = false;
      hints = showHints;
      sim = createSim(variant, { record: false });
      cur = frameOf(sim);
      prev = cur;
      pose(cur, cur, 1, 0);
      const ty = cur.agents[sim.ty]!;
      camYaw = 0;
      placeCamera(ty.x, ty.y, 0, 0);
      placeChips();
      renderer.render(scene, camera);
    },
    startLive(variant: E11Variant, showHints: boolean) {
      sim = createSim(variant);
      inputs = [];
      queued.length = 0;
      doneSent = false;
      stepper.reset();
      paused = true;
      live = true;
      hints = showHints;
      cur = frameOf(sim);
      prev = cur;
      blend = 0;
      lastMove = { dir: 0, speed: 0 };
      hud = null;
      lastClock = -1;
      camYaw = 0;
      lastBallRoll = 0;
    },
    /** Joystick vector (x right, y forward, length 0…1) relative to the view. null: thumb lifted. */
    stick(vec: { x: number; y: number } | null) {
      if (!live || !sim) return;
      if (!vec || Math.hypot(vec.x, vec.y) < 0.12) {
        sendMove(lastMove.dir, 0);
        return;
      }
      sendMove(camYaw + Math.atan2(vec.x, vec.y), Math.min(1, Math.hypot(vec.x, vec.y)));
    },
    /** Pass to a team-mate (his number chip). Returns false when you cannot pass now. */
    pass(to: number, through = throughMode) {
      if (!canAct() || !sim || sim.ball.owner !== sim.ty) return false;
      queued.push({ tick: 0, kind: "pass", to, through });
      return true;
    },
    shot() {
      if (!canAct() || !sim || sim.ball.owner !== sim.ty) return false;
      queued.push({ tick: 0, kind: "shot" });
      return true;
    },
    /** true: the ball goes into the space ahead of the team-mate; false: to his feet. */
    setThroughMode(on: boolean) {
      throughMode = on;
    },
    setHints(on: boolean) {
      hints = on;
    },
    setPaused(on: boolean) {
      paused = on;
      stepper.reset();
      if (on && sim && lastMove.speed > 0) sendMove(lastMove.dir, 0);
    },
    debugState: () => ({
      live,
      paused,
      phase: sim?.phase,
      tick: sim?.tick,
      owner: sim?.ball.owner,
      ratio: resolution.ratio,
      camYaw,
      runs: sim?.variant.runs.map((r) => ({ to: slotIndex("home", r.slot), burst: r.burst })) ?? [],
      heading: sim ? headingOf(sim.players[sim.ty]!.vel) : 0,
    }),
    dispose,
  };
  return api;
}
export type E11Scene = Awaited<ReturnType<typeof createE11Scene>>;
