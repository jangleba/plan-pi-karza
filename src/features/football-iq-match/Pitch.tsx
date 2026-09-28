/* eslint-disable @typescript-eslint/no-explicit-any -- Three.js is vendored as a minified module without bundled TypeScript declarations. */
import { useEffect, useRef, useState } from "react";
// @ts-expect-error Three.js is vendored locally so the GitHub package works without another dependency.
import * as THREE from "./vendor/three.module.min.js";
import playerAwayUrl from "./assets/player-away.png";
import playerGoalkeeperUrl from "./assets/player-goalkeeper.png";
import playerHomeUrl from "./assets/player-home.png";
import { analyzePassLane } from "./engine";
import { Pitch2DFallback } from "./Pitch2DFallback";
import type {
  ActionMode,
  BallState,
  MatchPlayer,
  Phase,
  PlannedAction,
  PlannedMove,
  Point,
  UserPlan,
} from "./types";

type Props = {
  players: MatchPlayer[];
  ball: BallState;
  plan: UserPlan;
  phase: Phase;
  phaseStartedAt: number;
  durationMs: number;
  mode: ActionMode;
  playbackDurationMs: number;
  onPlanChange: (plan: UserPlan) => void;
  onHint: (message: string) => void;
};

type FrameBall = Point & { carrierId?: string };

type DragState =
  | { pointerId: number; type: "run"; playerId: string; start: Point; current: Point }
  | { pointerId: number; type: "pass"; passerId?: string; start: Point; current: Point }
  | {
      pointerId: number;
      type: "group";
      playerId: string;
      start: Point;
      current: Point;
      moves: PlannedMove[];
    };

type LatestProps = Props & { actions: PlannedAction[]; plannedPlayerIds: Set<string> };

type Runtime = {
  scene: any;
  camera: any;
  renderer: any;
  playerObjects: Map<string, any>;
  hitObjects: any[];
  ballMesh: any;
  ballHit: any;
  ballShadow: any;
  routes: any;
  draftLine: any;
  drag: DragState | null;
  logicalPositions: Map<string, Point>;
  logicalBall: FrameBall;
  worldPerPixel: number;
  routeLabels: any[];
  disposed: boolean;
};

const FIELD_WIDTH = 20.4;
const FIELD_LENGTH = 31.5;
const PLAYER_HEIGHT_PX = 26;
const MAX_ACTIONS = 8;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const smooth = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

const interpolate = (from: Point, to: Point, t: number): Point => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
});

const toWorld = (point: Point) => ({
  x: ((point.x - 50) / 100) * FIELD_WIDTH,
  z: ((point.y - 75) / 150) * FIELD_LENGTH,
});

const toLogical = (x: number, z: number): Point => ({
  x: clamp(50 + (x / FIELD_WIDTH) * 100, 2, 98),
  y: clamp(75 + (z / FIELD_LENGTH) * 150, 2, 148),
});

const elapsedFrom = (startedAt: number) => {
  const now = startedAt > 100_000_000_000 ? Date.now() : performance.now();
  return Math.max(0, now - startedAt);
};

const actionWeight = (action: PlannedAction) => {
  if (action.type === "pass") {
    return Math.max(0.32, Math.hypot(action.to.x - action.from.x, action.to.y - action.from.y) / 52);
  }
  const longestMove = action.moves.reduce(
    (maximum, move) => Math.max(maximum, Math.hypot(move.to.x - move.from.x, move.to.y - move.from.y)),
    0,
  );
  return Math.max(0.52, longestMove / 22);
};

const actionActors = (action: PlannedAction) => {
  const actors = new Set<string>();
  if (action.type === "pass") {
    actors.add("ball");
    if (action.passerId) actors.add(`player:${action.passerId}`);
    if (action.receiverId) actors.add(`player:${action.receiverId}`);
  } else {
    action.moves.forEach((move) => actors.add(`player:${move.playerId}`));
  }
  return actors;
};

const actionSchedule = (actions: PlannedAction[]) => {
  const weights = actions.map(actionWeight);
  const actors = actions.map(actionActors);
  const starts: number[] = [];
  actions.forEach((_, index) => {
    if (index === 0) {
      starts.push(0);
      return;
    }
    let start = starts[index - 1] + weights[index - 1] * 0.78;
    for (let prior = 0; prior < index; prior += 1) {
      const dependent = [...actors[index]].some((actor) => actors[prior].has(actor));
      if (dependent) start = Math.max(start, starts[prior] + weights[prior]);
    }
    starts.push(start);
  });
  const total = Math.max(0.001, (starts.at(-1) ?? 0) + (weights.at(-1) ?? 0));
  return { starts, weights, total };
};

const actionProgress = (globalProgress: number, index: number, actions: PlannedAction[]) => {
  if (!actions.length || globalProgress <= 0) return 0;
  if (globalProgress >= 1) return 1;
  const { starts, weights, total } = actionSchedule(actions);
  const start = starts[index] / total;
  const duration = weights[index] / total;
  return smooth((globalProgress - start) / Math.max(0.001, duration));
};

const makeActionId = (type: ActionMode) =>
  `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const getLine = (role: string) => {
  const normalized = role.toUpperCase();
  if (normalized === "BR") return "goalkeeper";
  if (["LO", "PO", "ŚO", "SO"].includes(normalized)) return "defence";
  if (["DP", "ŚP", "SP", "ŚPO", "SPO"].includes(normalized)) return "midfield";
  return "attack";
};

const createPositionMap = (players: MatchPlayer[], phase: Phase, observationProgress: number) => {
  const positions = new Map<string, Point>();
  players.forEach((player) => {
    const from = player.from ?? player;
    let point: Point = { x: player.x, y: player.y };
    if (phase === "countdown") point = { x: from.x, y: from.y };
    else if (phase === "observe") point = interpolate(from, player, observationProgress);
    positions.set(player.id, point);
  });
  return positions;
};

const applyActions = (
  positions: Map<string, Point>,
  initialBall: BallState,
  actions: PlannedAction[],
  globalProgress: number,
  players: MatchPlayer[],
  resolveConsequences: boolean,
) => {
  const ball: FrameBall = { x: initialBall.x, y: initialBall.y, carrierId: initialBall.carrierId };
  const initialCarrier = ball.carrierId ? positions.get(ball.carrierId) : undefined;
  if (initialCarrier) Object.assign(ball, initialCarrier);
  const schedule = actionSchedule(actions);
  let timelineProgress = globalProgress;

  actions.forEach((action, actionIndex) => {
    const progress = actionProgress(timelineProgress, actionIndex, actions);
    if (progress <= 0) return;
    if (action.type === "pass") {
      const passerId = action.passerId ?? ball.carrierId;
      const passerTeam = players.find((player) => player.id === passerId)?.team ?? "home";
      const defenders = players
        .filter((player) => player.team !== passerTeam)
        .map((player) => ({ ...player, ...(positions.get(player.id) ?? player) }));
      const lane = analyzePassLane(action, defenders);
      const intercepted = resolveConsequences && lane.clearance < 3.4;
      const target = intercepted ? lane.point : action.to;
      Object.assign(ball, interpolate(action.from, target, progress));
      ball.carrierId = progress >= 1 ? (intercepted ? lane.interceptorId : action.receiverId) : undefined;
      if (intercepted && progress >= 1) {
        const interceptionEnd = (schedule.starts[actionIndex] + schedule.weights[actionIndex]) / schedule.total;
        timelineProgress = Math.min(timelineProgress, interceptionEnd);
      }
      return;
    }
    action.moves.forEach((move) => {
      const point = interpolate(move.from, move.to, progress);
      positions.set(move.playerId, point);
      if (ball.carrierId === move.playerId) Object.assign(ball, point);
    });
  });

  const finalCarrier = ball.carrierId ? positions.get(ball.carrierId) : undefined;
  if (finalCarrier) Object.assign(ball, finalCarrier);
  return ball;
};

const makePitchTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1582;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const stripeHeight = canvas.height / 14;
  for (let index = 0; index < 14; index += 1) {
    context.fillStyle = index % 2 === 0 ? "#67aa62" : "#72b56b";
    context.fillRect(0, index * stripeHeight, canvas.width, stripeHeight + 1);
  }
  const daylight = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  daylight.addColorStop(0, "rgba(255,255,238,.18)");
  daylight.addColorStop(0.5, "rgba(255,255,255,.03)");
  daylight.addColorStop(1, "rgba(37,101,54,.10)");
  context.fillStyle = daylight;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = "rgba(255,255,255,.93)";
  context.fillStyle = "rgba(255,255,255,.93)";
  context.lineWidth = 5;
  context.lineJoin = "round";
  const inset = 18;
  context.strokeRect(inset, inset, canvas.width - inset * 2, canvas.height - inset * 2);
  context.beginPath();
  context.moveTo(inset, canvas.height / 2);
  context.lineTo(canvas.width - inset, canvas.height / 2);
  context.stroke();
  context.beginPath();
  context.arc(canvas.width / 2, canvas.height / 2, 139, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(canvas.width / 2, canvas.height / 2, 6, 0, Math.PI * 2);
  context.fill();

  const penaltyWidth = 596;
  const penaltyDepth = 250;
  const goalBoxWidth = 288;
  const goalBoxDepth = 88;
  const penaltyX = (canvas.width - penaltyWidth) / 2;
  const goalBoxX = (canvas.width - goalBoxWidth) / 2;
  context.strokeRect(penaltyX, inset, penaltyWidth, penaltyDepth);
  context.strokeRect(goalBoxX, inset, goalBoxWidth, goalBoxDepth);
  context.strokeRect(penaltyX, canvas.height - inset - penaltyDepth, penaltyWidth, penaltyDepth);
  context.strokeRect(goalBoxX, canvas.height - inset - goalBoxDepth, goalBoxWidth, goalBoxDepth);
  context.beginPath();
  context.arc(canvas.width / 2, 183, 6, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(canvas.width / 2, canvas.height - 183, 6, 0, Math.PI * 2);
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const makeBlobTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(64, 32, 2, 64, 32, 61);
  gradient.addColorStop(0, "rgba(7,24,34,.32)");
  gradient.addColorStop(0.48, "rgba(7,24,34,.16)");
  gradient.addColorStop(1, "rgba(7,24,34,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 64);
  return new THREE.CanvasTexture(canvas);
};

const makeOrderSprite = (order: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.shadowColor = "rgba(4,27,51,.24)";
  context.shadowBlur = 10;
  context.fillStyle = "#0a3158";
  context.beginPath();
  context.arc(48, 48, 31, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = "rgba(255,255,255,.94)";
  context.lineWidth = 5;
  context.stroke();
  context.fillStyle = "#fff";
  context.font = "800 41px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(order), 48, 50);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }));
  sprite.renderOrder = 12;
  return sprite;
};

const makeControlledLabel = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 72;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "rgba(220,242,255,.97)";
  context.beginPath();
  context.roundRect(8, 8, 144, 56, 28);
  context.fill();
  context.strokeStyle = "rgba(65,166,238,.9)";
  context.lineWidth = 4;
  context.stroke();
  context.fillStyle = "#0a4e86";
  context.font = "900 34px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("TY", 80, 38);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }));
  label.renderOrder = 14;
  return label;
};

const disposeGroup = (group: any) => {
  while (group.children.length) {
    const child = group.children.pop();
    child?.traverse?.((object: any) => {
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material: any) => {
        material?.map?.dispose?.();
        material?.dispose?.();
      });
    });
  }
};

const addArrowHead = (group: any, from: { x: number; z: number }, to: { x: number; z: number }, color: number) => {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.12) return;
  const direction = new THREE.Vector3(dx / length, 0, dz / length);
  const origin = new THREE.Vector3(to.x - direction.x * 0.34, 0.07, to.z - direction.z * 0.34);
  group.add(new THREE.ArrowHelper(direction, origin, 0.34, color, 0.24, 0.16));
};

const addRouteLabel = (runtime: Runtime, group: any, order: number, point: Point) => {
  const marker = makeOrderSprite(order);
  if (!marker) return;
  const world = toWorld(point);
  marker.position.set(world.x, 0.16, world.z);
  const size = runtime.worldPerPixel * 19;
  marker.scale.set(size, size, 1);
  runtime.routeLabels.push(marker);
  group.add(marker);
};

const rebuildRoutes = (runtime: Runtime, plan: UserPlan) => {
  disposeGroup(runtime.routes);
  runtime.routeLabels = [];
  [...plan.actions].sort((a, b) => a.order - b.order).forEach((action) => {
    if (action.type === "pass") {
      const from = toWorld(action.from);
      const to = toWorld(action.to);
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(from.x, 0.09, from.z),
        new THREE.Vector3((from.x + to.x) / 2, 0.22, (from.z + to.z) / 2),
        new THREE.Vector3(to.x, 0.09, to.z),
      );
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)),
        new THREE.LineBasicMaterial({ color: 0xf7fcff, transparent: true, opacity: 0.96, depthWrite: false }),
      );
      line.renderOrder = 7;
      runtime.routes.add(line);
      addArrowHead(runtime.routes, from, to, 0xf7fcff);
      addRouteLabel(runtime, runtime.routes, action.order, interpolate(action.from, action.to, 0.17));
      return;
    }
    action.moves.forEach((move, moveIndex) => {
      const from = toWorld(move.from);
      const to = toWorld(move.to);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(from.x, 0.075, from.z),
          new THREE.Vector3(to.x, 0.075, to.z),
        ]),
        new THREE.LineDashedMaterial({
          color: action.type === "group" ? 0xb9dcf5 : 0x79c3ff,
          dashSize: 0.28,
          gapSize: 0.15,
          transparent: true,
          opacity: moveIndex === 0 ? 0.96 : 0.72,
          depthWrite: false,
        }),
      );
      line.computeLineDistances();
      line.renderOrder = 6;
      runtime.routes.add(line);
      addArrowHead(runtime.routes, from, to, action.type === "group" ? 0xb9dcf5 : 0x79c3ff);
      if (moveIndex === 0) addRouteLabel(runtime, runtime.routes, action.order, interpolate(move.from, move.to, 0.17));
    });
  });
};

const setDraftLine = (runtime: Runtime, from: Point, to: Point, visible: boolean) => {
  runtime.draftLine.visible = visible;
  if (!visible) return;
  const start = toWorld(from);
  const end = toWorld(to);
  const position = runtime.draftLine.geometry.getAttribute("position");
  position.setXYZ(0, start.x, 0.11, start.z);
  position.setXYZ(1, end.x, 0.11, end.z);
  position.needsUpdate = true;
  runtime.draftLine.computeLineDistances();
};

const applySimpleReactions = (
  players: MatchPlayer[],
  positions: Map<string, Point>,
  ball: FrameBall,
  plannedPlayerIds: Set<string>,
  strength: number,
  defaultPossession: "home" | "away",
) => {
  if (strength <= 0) return;
  const possession = players.find((player) => player.id === ball.carrierId)?.team ?? defaultPossession;
  players.forEach((player) => {
    if (player.goalkeeper) return;
    const point = positions.get(player.id);
    if (!point) return;
    if (player.team === "home" && plannedPlayerIds.has(player.id)) return;
    if (player.team !== possession) {
      const roleScale = getLine(player.role) === "defence" ? 0.72 : 1;
      point.x = clamp(point.x + clamp((ball.x - point.x) * 0.15, -6, 6) * strength * roleScale, 3, 97);
      point.y = clamp(point.y + clamp((ball.y - point.y) * 0.055, -3.2, 3.2) * strength, 3, 147);
    } else if (player.id !== ball.carrierId) {
      const side = point.x === ball.x ? (player.number % 2 ? -1 : 1) : Math.sign(point.x - ball.x);
      const attackDirection = player.team === "home" ? -1 : 1;
      point.x = clamp(point.x + side * 1.2 * strength, 3, 97);
      point.y = clamp(point.y + attackDirection * 0.85 * strength, 3, 147);
    }
  });
};

const getPreviewState = (latest: LatestProps) => {
  const positions = createPositionMap(latest.players, "plan", 1);
  const ball = applyActions(positions, latest.ball, latest.actions, 1, latest.players, false);
  return { positions, ball };
};

export function Pitch(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);
  const [, setFallbackFrame] = useState(0);
  const actions = [...props.plan.actions].sort((a, b) => a.order - b.order);
  const plannedPlayerIds = new Set<string>();
  actions.forEach((action) => {
    if (action.type !== "pass") action.moves.forEach((move) => plannedPlayerIds.add(move.playerId));
  });
  const latestRef = useRef<LatestProps>({ ...props, actions, plannedPlayerIds });
  latestRef.current = { ...props, actions, plannedPlayerIds };
  const rosterKey = props.players
    .map((player) => `${player.id}:${player.team}:${player.goalkeeper ? 1 : 0}:${player.controlled ? 1 : 0}`)
    .join("|");

  useEffect(() => {
    const host = hostRef.current;
    if (!host || fallback) return;
    let animationFrame = 0;
    let observer: ResizeObserver | null = null;
    let runtime: Runtime | null = null;
    let contextLostHandler: ((event: Event) => void) | null = null;
    setReady(false);

    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xe8f1ec);
      const camera = new THREE.OrthographicCamera(-11, 11, 18, -18, 0.1, 100);
      camera.position.set(0, 35.5, 11.1);
      camera.lookAt(0, 0, 0);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.04;
      renderer.shadowMap.enabled = false;
      renderer.domElement.className = "bwiq-3d-canvas";
      renderer.domElement.style.touchAction = "none";
      host.appendChild(renderer.domElement);
      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, memory >= 6 ? 1.65 : 1.25));
      scene.add(new THREE.HemisphereLight(0xffffff, 0x4b7658, 2.45));
      const sun = new THREE.DirectionalLight(0xfffdf2, 1.25);
      sun.position.set(-8, 20, 8);
      scene.add(sun);

      const surroundings = new THREE.Mesh(
        new THREE.PlaneGeometry(36, 47),
        new THREE.MeshBasicMaterial({ color: 0xdce9e2 }),
      );
      surroundings.rotation.x = -Math.PI / 2;
      surroundings.position.y = -0.03;
      scene.add(surroundings);
      const pitchTexture = makePitchTexture();
      if (pitchTexture) pitchTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const field = new THREE.Mesh(
        new THREE.PlaneGeometry(FIELD_WIDTH, FIELD_LENGTH),
        new THREE.MeshBasicMaterial({ map: pitchTexture, color: pitchTexture ? 0xffffff : 0x6cad64 }),
      );
      field.rotation.x = -Math.PI / 2;
      scene.add(field);

      const blobTexture = makeBlobTexture();
      const blobMaterial = new THREE.MeshBasicMaterial({
        map: blobTexture,
        transparent: true,
        depthWrite: false,
        opacity: 0.82,
        toneMapped: false,
      });
      const shadowGeometry = new THREE.PlaneGeometry(1, 1);
      const ringGeometry = new THREE.RingGeometry(0.72, 1, 48);
      const hitGeometry = new THREE.CircleGeometry(1, 24);
      const invisibleMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      let textureFailed = false;
      let loadedTextures = 0;
      const onTextureLoad = () => {
        loadedTextures += 1;
        if (loadedTextures === 3 && runtime && !runtime.disposed) setReady(true);
      };
      const onTextureError = () => {
        if (!textureFailed) {
          textureFailed = true;
          setFallback(true);
        }
      };
      const loader = new THREE.TextureLoader();
      const homeTexture = loader.load(playerHomeUrl, onTextureLoad, undefined, onTextureError);
      const awayTexture = loader.load(playerAwayUrl, onTextureLoad, undefined, onTextureError);
      const goalkeeperTexture = loader.load(playerGoalkeeperUrl, onTextureLoad, undefined, onTextureError);
      [homeTexture, awayTexture, goalkeeperTexture].forEach((texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
      });

      const playerObjects = new Map<string, any>();
      const hitObjects: any[] = [];
      props.players.forEach((player) => {
        const root = new THREE.Group();
        root.userData.playerId = player.id;
        root.userData.logical = { x: player.x, y: player.y };
        const shadow = new THREE.Mesh(shadowGeometry, blobMaterial);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(0.12, 0.018, 0.12);
        shadow.renderOrder = 1;
        root.add(shadow);
        const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({
          color: player.controlled ? 0x56b9ff : 0x92cef6,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.025;
        ring.renderOrder = 2;
        root.add(ring);
        const texture = player.goalkeeper ? goalkeeperTexture : player.team === "home" ? homeTexture : awayTexture;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          alphaTest: 0.025,
          depthWrite: false,
          toneMapped: false,
        }));
        sprite.center.set(0.5, 0.055);
        sprite.position.y = 0.055;
        sprite.renderOrder = 5;
        root.add(sprite);
        const controlledLabel = player.controlled ? makeControlledLabel() : null;
        if (controlledLabel) root.add(controlledLabel);
        const hit = new THREE.Mesh(hitGeometry, invisibleMaterial);
        hit.rotation.x = -Math.PI / 2;
        hit.position.y = 0.12;
        hit.userData.playerId = player.id;
        root.add(hit);
        hitObjects.push(hit);
        Object.assign(root.userData, { sprite, shadow, ring, hit, controlledLabel });
        const world = toWorld(player);
        root.position.set(world.x, 0, world.z);
        playerObjects.set(player.id, root);
        scene.add(root);
      });

      const ballShadow = new THREE.Mesh(shadowGeometry, blobMaterial);
      ballShadow.rotation.x = -Math.PI / 2;
      ballShadow.position.y = 0.022;
      scene.add(ballShadow);
      const ballMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }),
      );
      ballMesh.position.y = 0.14;
      scene.add(ballMesh);
      const ballHit = new THREE.Mesh(hitGeometry, invisibleMaterial);
      ballHit.rotation.x = -Math.PI / 2;
      ballHit.position.y = 0.13;
      ballHit.userData.ball = true;
      scene.add(ballHit);
      hitObjects.push(ballHit);
      const routes = new THREE.Group();
      scene.add(routes);
      const draftGeometry = new THREE.BufferGeometry();
      draftGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      const draftLine = new THREE.Line(draftGeometry, new THREE.LineDashedMaterial({
        color: 0xffffff,
        dashSize: 0.24,
        gapSize: 0.13,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }));
      draftLine.visible = false;
      draftLine.renderOrder = 11;
      scene.add(draftLine);

      runtime = {
        scene,
        camera,
        renderer,
        playerObjects,
        hitObjects,
        ballMesh,
        ballHit,
        ballShadow,
        routes,
        draftLine,
        drag: null,
        logicalPositions: new Map(),
        logicalBall: { x: props.ball.x, y: props.ball.y, carrierId: props.ball.carrierId },
        worldPerPixel: 0.055,
        routeLabels: [],
        disposed: false,
      };
      runtimeRef.current = runtime;
      if (loadedTextures === 3) setReady(true);

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const interactionPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersection = new THREE.Vector3();
      const setPointer = (event: PointerEvent) => {
        if (!runtime) return;
        const rect = runtime.renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, runtime.camera);
      };
      const pointOnField = (event: PointerEvent) => {
        setPointer(event);
        if (!raycaster.ray.intersectPlane(interactionPlane, intersection)) return null;
        return toLogical(intersection.x, intersection.z);
      };

      const onPointerDown = (event: PointerEvent) => {
        if (!runtime || latestRef.current.phase !== "plan" || runtime.drag) return;
        setPointer(event);
        const intersections = raycaster.intersectObjects(runtime.hitObjects, false);
        const latest = latestRef.current;
        const preview = getPreviewState(latest);
        let hit: any;
        if (latest.mode === "pass") {
          const carrier = latest.players.find((player) => player.id === preview.ball.carrierId);
          if (carrier && carrier.team !== "home") {
            latest.onHint("Rywal ma piłkę — użyj Ruchu albo Grupy, żeby zaplanować pressing i zabezpieczenie");
            navigator.vibrate?.(22);
            return;
          }
          hit = intersections.find((item: any) =>
            item.object.userData.ball || item.object.userData.playerId === preview.ball.carrierId,
          )?.object;
          if (!hit) {
            latest.onHint("Złap piłkę albo zawodnika, który ją prowadzi");
            return;
          }
        } else {
          hit = intersections.find((item: any) => {
            const id = item.object.userData.playerId;
            return id && latest.players.find((player) => player.id === id)?.team === "home";
          })?.object;
          if (!hit) return;
        }
        if (latest.plan.actions.length >= MAX_ACTIONS) {
          latest.onHint("Plan jest już pełny — cofnij jeden krok albo go odtwórz");
          return;
        }

        event.preventDefault();
        runtime.renderer.domElement.setPointerCapture(event.pointerId);
        if (latest.mode === "pass") {
          const start = { x: preview.ball.x, y: preview.ball.y };
          runtime.drag = {
            pointerId: event.pointerId,
            type: "pass",
            passerId: preview.ball.carrierId,
            start,
            current: start,
          };
          latest.onHint("Przeciągnij piłkę do partnera albo w wolną przestrzeń");
        } else {
          const playerId = hit.userData.playerId as string;
          const player = latest.players.find((item) => item.id === playerId);
          if (!player) return;
          const start = preview.positions.get(playerId) ?? { x: player.x, y: player.y };
          if (latest.mode === "group") {
            const line = getLine(player.role);
            const linePlayers = latest.players.filter(
              (item) => item.team === "home" && !item.goalkeeper && getLine(item.role) === line,
            );
            const moves = linePlayers.map((item) => {
              const from = preview.positions.get(item.id) ?? { x: item.x, y: item.y };
              return { playerId: item.id, from: { ...from }, to: { ...from } };
            });
            runtime.drag = {
              pointerId: event.pointerId,
              type: "group",
              playerId,
              start: { ...start },
              current: { ...start },
              moves,
            };
            latest.onHint(`Przesuwasz całą linię: ${line === "defence" ? "obrona" : line === "midfield" ? "pomoc" : "atak"}`);
          } else {
            runtime.drag = {
              pointerId: event.pointerId,
              type: "run",
              playerId,
              start: { ...start },
              current: { ...start },
            };
            latest.onHint(player.controlled ? "Wyznacz swój bieg" : `Wyznacz ruch zawodnika nr ${player.number}`);
          }
        }
        if (runtime.drag) setDraftLine(runtime, runtime.drag.start, runtime.drag.current, true);
        navigator.vibrate?.(8);
      };

      const onPointerMove = (event: PointerEvent) => {
        if (!runtime?.drag || runtime.drag.pointerId !== event.pointerId) return;
        const point = pointOnField(event);
        if (!point) return;
        runtime.drag.current = point;
        setDraftLine(runtime, runtime.drag.start, runtime.drag.current, true);
        event.preventDefault();
      };

      const finishDrag = (event: PointerEvent, commit: boolean) => {
        if (!runtime?.drag || runtime.drag.pointerId !== event.pointerId) return;
        const drag = runtime.drag;
        runtime.drag = null;
        setDraftLine(runtime, drag.start, drag.current, false);
        if (!commit) return;
        const distance = Math.hypot(drag.current.x - drag.start.x, drag.current.y - drag.start.y);
        const latest = latestRef.current;
        if (distance < 2.2) {
          latest.onHint("Przeciągnij dalej, żeby zapisać decyzję");
          return;
        }

        const order = latest.plan.actions.reduce((maximum, action) => Math.max(maximum, action.order), 0) + 1;
        let action: PlannedAction;
        if (drag.type === "pass") {
          const preview = getPreviewState(latest);
          let receiver: MatchPlayer | undefined;
          let receiverDistance = 7;
          latest.players.forEach((player) => {
            if (player.team !== "home") return;
            const point = preview.positions.get(player.id) ?? player;
            const distanceToPlayer = Math.hypot(point.x - drag.current.x, point.y - drag.current.y);
            if (distanceToPlayer < receiverDistance) {
              receiver = player;
              receiverDistance = distanceToPlayer;
            }
          });
          const target = receiver ? preview.positions.get(receiver.id) ?? receiver : drag.current;
          action = {
            id: makeActionId("pass"),
            type: "pass",
            order,
            from: drag.start,
            to: { x: target.x, y: target.y },
            passerId: drag.passerId,
            receiverId: receiver?.id,
          };
          latest.onHint(receiver
            ? `Podanie do zawodnika nr ${receiver.number} zapisane jako krok ${order}`
            : `Podanie w przestrzeń zapisane jako krok ${order}`);
        } else if (drag.type === "group") {
          const dx = drag.current.x - drag.start.x;
          const dy = drag.current.y - drag.start.y;
          action = {
            id: makeActionId("group"),
            type: "group",
            order,
            moves: drag.moves.map((move) => ({
              playerId: move.playerId,
              from: move.from,
              to: { x: clamp(move.from.x + dx, 3, 97), y: clamp(move.from.y + dy, 3, 147) },
            })),
          };
          latest.onHint(`Przesunięcie linii zapisane jako krok ${order}`);
        } else {
          action = {
            id: makeActionId("run"),
            type: "run",
            order,
            moves: [{ playerId: drag.playerId, from: drag.start, to: drag.current }],
          };
          latest.onHint(`Bieg zapisany jako krok ${order}`);
        }
        latest.onPlanChange({ ...latest.plan, actions: [...latest.plan.actions, action] });
        navigator.vibrate?.(16);
      };

      const onPointerUp = (event: PointerEvent) => finishDrag(event, true);
      const onPointerCancel = (event: PointerEvent) => finishDrag(event, false);
      renderer.domElement.addEventListener("pointerdown", onPointerDown, { passive: false });
      renderer.domElement.addEventListener("pointermove", onPointerMove, { passive: false });
      renderer.domElement.addEventListener("pointerup", onPointerUp);
      renderer.domElement.addEventListener("pointercancel", onPointerCancel);

      const resize = () => {
        if (!runtime) return;
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        renderer.setSize(width, height, false);
        const aspect = width / height;
        const elevation = Math.atan2(camera.position.y, camera.position.z);
        const projectedLength = FIELD_LENGTH * Math.sin(elevation) + 1.2;
        const visibleHeight = Math.max(projectedLength, (FIELD_WIDTH / 0.96) / Math.max(0.25, aspect));
        const visibleWidth = visibleHeight * aspect;
        camera.left = -visibleWidth / 2;
        camera.right = visibleWidth / 2;
        camera.top = visibleHeight / 2;
        camera.bottom = -visibleHeight / 2;
        camera.updateProjectionMatrix();
        runtime.worldPerPixel = visibleHeight / height;
        runtime.playerObjects.forEach((model) => {
          const spriteHeight = runtime!.worldPerPixel * PLAYER_HEIGHT_PX;
          model.userData.sprite.scale.set(spriteHeight * (256 / 360), spriteHeight, 1);
          model.userData.shadow.scale.set(spriteHeight * 0.7, spriteHeight * 0.29, 1);
          const ringSize = runtime!.worldPerPixel * 18;
          model.userData.ring.scale.set(ringSize, ringSize, 1);
          const hitRadius = runtime!.worldPerPixel * 24;
          model.userData.hit.scale.set(hitRadius, hitRadius, 1);
          if (model.userData.controlledLabel) {
            model.userData.controlledLabel.position.set(0, spriteHeight * 1.02, 0);
            model.userData.controlledLabel.scale.set(
              runtime!.worldPerPixel * 31,
              runtime!.worldPerPixel * 14,
              1,
            );
          }
        });
        const ballScale = clamp((runtime.worldPerPixel * 7) / 0.24, 0.78, 1.45);
        runtime.ballMesh.scale.setScalar(ballScale);
        runtime.ballShadow.scale.set(runtime.worldPerPixel * 8, runtime.worldPerPixel * 4, 1);
        const ballHitRadius = runtime.worldPerPixel * 23;
        runtime.ballHit.scale.set(ballHitRadius, ballHitRadius, 1);
        runtime.routeLabels.forEach((label) => {
          const size = runtime!.worldPerPixel * 19;
          label.scale.set(size, size, 1);
        });
      };

      observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();
      rebuildRoutes(runtime, latestRef.current.plan);

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let previousFrame = performance.now();
      let previousRender = 0;
      const render = (timestamp: number) => {
        if (!runtime || runtime.disposed) return;
        animationFrame = requestAnimationFrame(render);
        if (document.hidden) return;
        const latest = latestRef.current;
        const continuouslyAnimated = latest.phase === "observe" || latest.phase === "playback" || Boolean(runtime.drag);
        if (!continuouslyAnimated && timestamp - previousRender < 140) return;
        previousRender = timestamp;
        const deltaSeconds = clamp((timestamp - previousFrame) / 1000, 0, 0.05);
        previousFrame = timestamp;
        const elapsed = elapsedFrom(latest.phaseStartedAt);
        const observationProgress = latest.phase === "observe"
          ? smooth(elapsed / Math.max(1, latest.durationMs))
          : 1;
        const positions = createPositionMap(latest.players, latest.phase, observationProgress);
        let playback = 0;
        if (latest.phase === "playback") playback = clamp(elapsed / Math.max(1, latest.playbackDurationMs), 0, 1);
        else if (["plan", "intent", "feedback", "compare"].includes(latest.phase)) playback = 1;
        const resolveConsequences = ["playback", "feedback", "compare"].includes(latest.phase);
        const logicalBall = applyActions(
          positions,
          latest.ball,
          latest.actions,
          playback,
          latest.players,
          resolveConsequences,
        );
        if (["playback", "feedback", "compare"].includes(latest.phase)) {
          const initialPossession = latest.players.find((player) => player.id === latest.ball.carrierId)?.team ?? "home";
          applySimpleReactions(
            latest.players,
            positions,
            logicalBall,
            latest.plannedPlayerIds,
            smooth((playback - 0.08) / 0.78),
            initialPossession,
          );
        }

        const drag = runtime.drag;
        if (latest.phase === "plan" && drag) {
          if (drag.type === "run") positions.set(drag.playerId, drag.current);
          else if (drag.type === "group") {
            const dx = drag.current.x - drag.start.x;
            const dy = drag.current.y - drag.start.y;
            drag.moves.forEach((move) => positions.set(move.playerId, {
              x: clamp(move.from.x + dx, 3, 97),
              y: clamp(move.from.y + dy, 3, 147),
            }));
          } else {
            logicalBall.x = drag.current.x;
            logicalBall.y = drag.current.y;
            logicalBall.carrierId = undefined;
          }
        }

        runtime.logicalPositions = positions;
        runtime.logicalBall = logicalBall;
        runtime.routes.visible = ["plan", "intent", "playback", "feedback", "compare"].includes(latest.phase);
        const damping = reducedMotion ? 1 : 1 - Math.exp(-20 * deltaSeconds);
        latest.players.forEach((player) => {
          const model = runtime!.playerObjects.get(player.id);
          const logical = positions.get(player.id) ?? player;
          if (!model) return;
          const world = toWorld(logical);
          const previousX = model.position.x;
          model.position.x += (world.x - model.position.x) * damping;
          model.position.z += (world.z - model.position.z) * damping;
          const movedX = model.position.x - previousX;
          if (Math.abs(movedX) > 0.001) {
            const magnitude = Math.abs(model.userData.sprite.scale.x);
            model.userData.sprite.scale.x = movedX < 0 ? -magnitude : magnitude;
          }
          const planned = latest.plannedPlayerIds.has(player.id);
          const selected = drag?.type !== "pass" && drag?.playerId === player.id;
          const showRing = Boolean(player.controlled || planned || selected);
          model.userData.ring.visible = showRing;
          model.userData.ring.material.opacity = showRing ? (player.controlled ? 0.94 : 0.72) : 0;
        });

        const ballWorld = toWorld(logicalBall);
        runtime.ballMesh.position.x += (ballWorld.x - runtime.ballMesh.position.x) * damping;
        runtime.ballMesh.position.z += (ballWorld.z - runtime.ballMesh.position.z) * damping;
        runtime.ballMesh.rotation.x += deltaSeconds * 4.2;
        runtime.ballMesh.rotation.z += deltaSeconds * 3.1;
        runtime.ballHit.position.x = runtime.ballMesh.position.x;
        runtime.ballHit.position.z = runtime.ballMesh.position.z;
        runtime.ballShadow.position.x = runtime.ballMesh.position.x + 0.04;
        runtime.ballShadow.position.z = runtime.ballMesh.position.z + 0.04;
        runtime.renderer.render(runtime.scene, runtime.camera);
      };
      animationFrame = requestAnimationFrame(render);

      contextLostHandler = (event: Event) => {
        event.preventDefault();
        setFallback(true);
      };
      renderer.domElement.addEventListener("webglcontextlost", contextLostHandler, false);

      return () => {
        if (!runtime) return;
        runtime.disposed = true;
        cancelAnimationFrame(animationFrame);
        observer?.disconnect();
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer.domElement.removeEventListener("pointermove", onPointerMove);
        renderer.domElement.removeEventListener("pointerup", onPointerUp);
        renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
        if (contextLostHandler) renderer.domElement.removeEventListener("webglcontextlost", contextLostHandler);
        disposeGroup(routes);
        draftGeometry.dispose();
        draftLine.material.dispose();
        playerObjects.forEach((model) => {
          model.userData.ring.material.dispose();
          model.userData.sprite.material.dispose();
          model.userData.controlledLabel?.material?.map?.dispose?.();
          model.userData.controlledLabel?.material?.dispose?.();
        });
        homeTexture.dispose();
        awayTexture.dispose();
        goalkeeperTexture.dispose();
        pitchTexture?.dispose();
        blobTexture?.dispose();
        shadowGeometry.dispose();
        ringGeometry.dispose();
        hitGeometry.dispose();
        blobMaterial.dispose();
        invisibleMaterial.dispose();
        field.geometry.dispose();
        field.material.dispose();
        surroundings.geometry.dispose();
        surroundings.material.dispose();
        ballMesh.geometry.dispose();
        ballMesh.material.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        runtimeRef.current = null;
      };
    } catch (error) {
      console.warn("Football IQ: uruchamiam renderer awaryjny", error);
      runtimeRef.current = null;
      setFallback(true);
      return undefined;
    }
  }, [fallback, rosterKey, props.ball.carrierId, props.ball.x, props.ball.y, props.players]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime) rebuildRoutes(runtime, props.plan);
  }, [props.plan]);

  useEffect(() => {
    if (!fallback || (props.phase !== "observe" && props.phase !== "playback")) return;
    let frame = 0;
    let lastUpdate = 0;
    const tick = (timestamp: number) => {
      if (timestamp - lastUpdate >= 32) {
        lastUpdate = timestamp;
        setFallbackFrame((value) => (value + 1) % 10_000);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [fallback, props.phase, props.phaseStartedAt]);

  if (fallback) {
    return (
      <Pitch2DFallback
        players={props.players}
        ball={props.ball}
        plan={props.plan}
        phase={props.phase}
        mode={props.mode}
        progress={props.phase === "observe"
          ? clamp(elapsedFrom(props.phaseStartedAt) / Math.max(1, props.durationMs), 0, 1)
          : props.phase === "countdown" ? 0 : 1}
        playbackProgress={props.phase === "playback"
          ? clamp(elapsedFrom(props.phaseStartedAt) / Math.max(1, props.playbackDurationMs), 0, 1)
          : props.phase === "feedback" || props.phase === "compare" ? 1 : 0}
        onPlanChange={props.onPlanChange}
        onHint={props.onHint}
      />
    );
  }
  return (
    <div className="bwiq-pitch-shell bwiq-pitch-shell-3d">
      <div
        ref={hostRef}
        className="bwiq-3d-host"
        aria-label="Interaktywne, pełnowymiarowe boisko Football IQ"
      />
      {!ready && <div className="bwiq-3d-loading"><i />ŁADUJĘ BOISKO</div>}
    </div>
  );
}
