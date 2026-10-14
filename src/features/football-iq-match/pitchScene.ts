import {
  ArrowHelper,
  BufferGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { loadRunningModel, makeActor } from "./mixamo";
import type { PlaybackFrame } from "./playback";
import { BALL_RADIUS } from "./playback";
import type { MatchPlayer, PlannedAction, Point } from "./types";

const world = (p: Point, height = 0) => new Vector3(p.x - 50, height, p.y - 70);

export async function createPitchScene(
  host: HTMLDivElement,
  players: MatchPlayer[],
  onContextLost: () => void,
) {
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.append(renderer.domElement);
  const scene = new Scene();
  scene.background = new Color("#87ac91");
  const camera = new OrthographicCamera(-50, 50, 70, -70, 0.1, 600);
  const relevant = players.filter((p) => !p.goalkeeper);
  const showGoal = (players.find((p) => p.controlled)?.y ?? Infinity) < 60;
  const defaultBounds = {
    xMin: Math.max(0, Math.min(...relevant.map((p) => p.x)) - 16),
    xMax: Math.min(100, Math.max(...relevant.map((p) => p.x)) + 16),
    yMin: showGoal ? 0 : Math.max(0, Math.min(...relevant.map((p) => p.y)) - 16),
    yMax: Math.min(140, Math.max(...relevant.map((p) => p.y)) + 16),
  };
  const initialCenter = world({
    x: (defaultBounds.xMin + defaultBounds.xMax) / 2,
    y: (defaultBounds.yMin + defaultBounds.yMax) / 2,
  });
  camera.position.copy(initialCenter).add(new Vector3(0, 170, 120));
  camera.lookAt(initialCenter);
  camera.updateMatrixWorld();
  scene.add(new HemisphereLight("#eef6ff", "#536044", 2.5));
  const sun = new DirectionalLight("#fff4df", 2.0);
  sun.position.set(-40, 90, 45);
  scene.add(sun);
  const ownedGeometries = new Set<BufferGeometry>();
  const ownedMaterials = new Set<MeshBasicMaterial | MeshStandardMaterial | LineBasicMaterial>();
  const ground = new Group();
  scene.add(ground);
  function plane(x: number, y: number, w: number, h: number, color: string) {
    const geometry = new PlaneGeometry(w, h);
    const material = new MeshBasicMaterial({ color });
    ownedGeometries.add(geometry);
    ownedMaterials.add(material);
    const mesh = new Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(world({ x, y }, 0));
    ground.add(mesh);
  }
  for (let i = 0; i < 10; i++) plane(50, 7 + i * 14, 100, 14, i % 2 ? "#8eb599" : "#86ad91");
  const paint = new LineBasicMaterial({ color: "#edf5df", transparent: true, opacity: 0.85 });
  ownedMaterials.add(paint);
  function line(points: Point[], height = 0.04) {
    const geometry = new BufferGeometry().setFromPoints(points.map((p) => world(p, height)));
    ownedGeometries.add(geometry);
    ground.add(new Line(geometry, paint));
  }
  function rect(x: number, y: number, w: number, h: number) {
    line([
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
      { x, y },
    ]);
  }
  function arc(x: number, y: number, radius: number, from = 0, to = Math.PI * 2) {
    line(
      Array.from({ length: 65 }, (_, i) => ({
        x: x + Math.cos(from + ((to - from) * i) / 64) * radius,
        y: y + Math.sin(from + ((to - from) * i) / 64) * radius,
      })),
    );
  }
  rect(2.2, 3, 95.6, 134);
  rect(22, 3, 56, 27);
  rect(36, 3, 28, 11);
  rect(22, 110, 56, 27);
  rect(36, 126, 28, 11);
  line([
    { x: 2.2, y: 70 },
    { x: 97.8, y: 70 },
  ]);
  arc(50, 70, 9);
  arc(50, 24, 11, 0.56, Math.PI - 0.56);
  arc(50, 116, 11, Math.PI + 0.56, 2 * Math.PI - 0.56);
  rect(42, 0, 16, 3);
  rect(42, 137, 16, 3);

  const routes = new Group();
  scene.add(routes);
  let routeObjects: ArrowHelper[] = [];
  let previousRoutes: PlannedAction[] | null = null;
  const shadowGeometry = new CircleGeometry(2.0, 20);
  const shadowMaterial = new MeshBasicMaterial({
    color: "#082d27",
    opacity: 0.24,
    transparent: true,
    depthWrite: false,
  });
  const ringGeometry = new RingGeometry(2.5, 3.0, 40);
  const ringMaterial = new MeshBasicMaterial({
    color: "#65c4ff",
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  ownedGeometries.add(shadowGeometry);
  ownedGeometries.add(ringGeometry);
  ownedMaterials.add(shadowMaterial);
  ownedMaterials.add(ringMaterial);
  const ring = new Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);
  const carrierGeometry = new RingGeometry(1.6, 2.1, 32);
  const carrierMaterial = new MeshBasicMaterial({
    color: "#ffdf75",
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  ownedGeometries.add(carrierGeometry);
  ownedMaterials.add(carrierMaterial);
  const carrierRing = new Mesh(carrierGeometry, carrierMaterial);
  carrierRing.rotation.x = -Math.PI / 2;
  scene.add(carrierRing);
  const cue = new Group();
  const cueGeometry = new CircleGeometry(7, 40);
  const cueMaterial = new MeshBasicMaterial({
    color: "#d9f9e9",
    opacity: 0.23,
    transparent: true,
    depthWrite: false,
  });
  const cueRingGeometry = new RingGeometry(6.6, 7.0, 48);
  const cueRingMaterial = new MeshBasicMaterial({
    color: "#f1fff7",
    opacity: 0.9,
    transparent: true,
    depthWrite: false,
  });
  for (const [geometry, material] of [
    [cueGeometry, cueMaterial],
    [cueRingGeometry, cueRingMaterial],
  ] as const) {
    ownedGeometries.add(geometry);
    ownedMaterials.add(material);
    const mesh = new Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    cue.add(mesh);
  }
  cue.visible = false;
  scene.add(cue);
  const ballGeometry = new SphereGeometry(BALL_RADIUS, 12, 8);
  const ballMaterial = new MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 });
  ownedGeometries.add(ballGeometry);
  ownedMaterials.add(ballMaterial);
  const ball = new Mesh(ballGeometry, ballMaterial);
  scene.add(ball);
  const floor = new Plane(new Vector3(0, 1, 0), 0);
  const raycaster = new Raycaster();
  let disposed = false;
  let contextLost = false;
  let idleAnimation: number | null = null;
  const stopIdle = () => {
    if (idleAnimation !== null) cancelAnimationFrame(idleAnimation);
    idleAnimation = null;
  };
  const lost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    stopIdle();
    onContextLost();
  };
  renderer.domElement.addEventListener("webglcontextlost", lost);

  let viewBounds = defaultBounds;
  const resize = () => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    const aspect = width / height;
    let maxX = 0;
    let maxY = 0;
    for (const x of [viewBounds.xMin, viewBounds.xMax])
      for (const y of [viewBounds.yMin, viewBounds.yMax])
        for (const h of [0, 14]) {
          const view = world({ x, y }, h).applyMatrix4(camera.matrixWorldInverse);
          maxX = Math.max(maxX, Math.abs(view.x));
          maxY = Math.max(maxY, Math.abs(view.y));
        }
    const halfHeight = Math.max(maxY, maxX / aspect) * 1.06;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  const clearRoutes = () => {
    routeObjects.forEach((arrow) => arrow.dispose());
    routeObjects = [];
    routes.clear();
  };
  let asset: Awaited<ReturnType<typeof loadRunningModel>>;
  try {
    asset = await loadRunningModel();
  } catch (error) {
    renderer.domElement.removeEventListener("webglcontextlost", lost);
    ownedGeometries.forEach((g) => g.dispose());
    ownedMaterials.forEach((m) => m.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    throw error;
  }
  const actors = new Map(
    players.map((player, index) => {
      const actor = makeActor(
        asset,
        player,
        (index * (asset.clips.idle?.duration ?? 0)) / players.length,
      );
      scene.add(actor.root);
      const shadow = new Mesh(shadowGeometry, shadowMaterial);
      shadow.rotation.x = -Math.PI / 2;
      scene.add(shadow);
      return [player.id, { ...actor, shadow }] as const;
    }),
  );
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let currentFrame: PlaybackFrame | null = null;
  let playing = false;
  let clock = 0;
  let lastClockTime = performance.now();
  let lastIdleTime = 0;
  const canIdle = () =>
    !disposed &&
    !contextLost &&
    !playing &&
    !document.hidden &&
    !reducedMotion.matches &&
    !!asset.clips.idle &&
    !!currentFrame;
  const draw = (time = performance.now()) => {
    if (!currentFrame || disposed || contextLost) return;
    if (!document.hidden && !reducedMotion.matches)
      clock += Math.max(0, time - lastClockTime) / 1000;
    lastClockTime = time;
    const frame = currentFrame;
    actors.forEach((actor, id) => {
      const point = frame.positions.get(id)!;
      actor.root.position.copy(world(point));
      actor.shadow.position.copy(world(point, 0.06));
      actor.pose(frame.motions.get(id)!, clock);
    });
    ball.position.copy(world(frame.ballVisual, frame.ballHeight));
    carrierRing.visible = !frame.ballInFlight;
    const carrierPoint = frame.positions.get(frame.ballCarrierId);
    if (carrierPoint) carrierRing.position.copy(world(carrierPoint, 0.11));
    if (cue.visible)
      cue.scale.setScalar(reducedMotion.matches ? 1 : 1 + Math.sin(clock * 2.2) * 0.045);
    renderer.render(scene, camera);
  };
  const tickIdle = (time: number) => {
    idleAnimation = null;
    if (!canIdle()) return;
    // Breathing does not need the full playback refresh rate.
    const interval = 1000 / 30;
    if (time - lastIdleTime >= interval) {
      lastIdleTime = time - ((time - lastIdleTime) % interval);
      draw(time);
    }
    idleAnimation = requestAnimationFrame(tickIdle);
  };
  const scheduleIdle = () => {
    if (canIdle() && idleAnimation === null) idleAnimation = requestAnimationFrame(tickIdle);
  };
  const refreshIdle = () => {
    stopIdle();
    lastClockTime = performance.now();
    lastIdleTime = lastClockTime;
    scheduleIdle();
  };
  document.addEventListener("visibilitychange", refreshIdle);
  reducedMotion.addEventListener("change", refreshIdle);
  let focused = false;
  let focusActions: PlannedAction[] | null = null;
  const update = (
    frame: PlaybackFrame,
    actions: PlannedAction[],
    selectedId: string | null,
    isPlaying = false,
    focusOnActions = false,
    cameraActions: PlannedAction[] = actions,
    activeActionId?: string,
    teachingPoint?: Point,
  ) => {
    if (disposed || contextLost) return;
    if (focused !== focusOnActions || (focusOnActions && focusActions !== cameraActions)) {
      focused = focusOnActions;
      focusActions = cameraActions;
      if (focused && cameraActions.length) {
        const points = cameraActions.flatMap((action) =>
          action.type === "shot" ? [action.from] : [action.from, action.to],
        );
        const minX = Math.min(...points.map((p) => p.x)),
          maxX = Math.max(...points.map((p) => p.x));
        const minY = Math.min(...points.map((p) => p.y)),
          maxY = Math.max(...points.map((p) => p.y));
        const cx = Math.max(35, Math.min(65, (minX + maxX) / 2));
        const cy = Math.max(31, Math.min(109, (minY + maxY) / 2));
        const hx = Math.max(35, (maxX - minX) / 2 + 10);
        const hy = Math.max(31, (maxY - minY) / 2 + 10);
        viewBounds = {
          xMin: Math.max(0, cx - hx),
          xMax: Math.min(100, cx + hx),
          yMin: Math.max(0, cy - hy),
          yMax: Math.min(140, cy + hy),
        };
      } else viewBounds = defaultBounds;
      const center = world({
        x: (viewBounds.xMin + viewBounds.xMax) / 2,
        y: (viewBounds.yMin + viewBounds.yMax) / 2,
      });
      camera.position.copy(center).add(new Vector3(0, 170, 120));
      camera.lookAt(center);
      camera.updateMatrixWorld();
      resize();
    }
    currentFrame = frame;
    playing = isPlaying;
    if (playing) stopIdle();
    if (previousRoutes !== actions) {
      clearRoutes();
      actions.forEach((action) => {
        if (action.type === "shot") return;
        const delta = world(action.to).sub(world(action.from));
        if (delta.length() < 0.1) return;
        const arrow = new ArrowHelper(
          delta.clone().normalize(),
          world(action.from, 0.12),
          delta.length(),
          action.type === "pass"
            ? "#2c5369"
            : ["cover", "mark", "press"].includes(action.type)
              ? "#376951"
              : "#347eb4",
          2.5,
          1.25,
        );
        arrow.userData.actionId = action.id;
        routes.add(arrow);
        routeObjects.push(arrow);
      });
      previousRoutes = actions;
    }
    routeObjects.forEach((arrow) => {
      const opacity = activeActionId
        ? arrow.userData.actionId === activeActionId
          ? 1
          : 0.24
        : 0.85;
      for (const material of [arrow.line.material, arrow.cone.material].flat()) {
        material.transparent = true;
        material.opacity = opacity;
      }
    });
    cue.visible = !!teachingPoint;
    if (teachingPoint) cue.position.copy(world(teachingPoint, 0.08));
    ring.visible = selectedId !== null;
    if (selectedId && frame.positions.has(selectedId))
      ring.position.copy(world(frame.positions.get(selectedId)!, 0.1));
    draw();
    scheduleIdle();
  };
  const project = (point: Point, height = 0) => {
    const p = world(point, height).project(camera);
    return { x: ((p.x + 1) * host.clientWidth) / 2, y: ((1 - p.y) * host.clientHeight) / 2 };
  };
  const pick = (clientX: number, clientY: number): Point | null => {
    const bounds = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(
      new Vector2(
        ((clientX - bounds.left) / bounds.width) * 2 - 1,
        1 - ((clientY - bounds.top) / bounds.height) * 2,
      ),
      camera,
    );
    const hit = raycaster.ray.intersectPlane(floor, new Vector3());
    if (!hit || hit.x < -48 || hit.x > 48 || hit.z < -67 || hit.z > 67) return null;
    return { x: Math.max(3, Math.min(97, hit.x + 50)), y: Math.max(4, Math.min(136, hit.z + 70)) };
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stopIdle();
    document.removeEventListener("visibilitychange", refreshIdle);
    reducedMotion.removeEventListener("change", refreshIdle);
    renderer.domElement.removeEventListener("webglcontextlost", lost);
    actors.forEach((actor) => actor.dispose());
    // The bounded shared asset stays cached for the next scenario.
    clearRoutes();
    ownedGeometries.forEach((g) => g.dispose());
    ownedMaterials.forEach((m) => m.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
  resize();
  return { update, resize, project, pick, dispose };
}
export type PitchScene = Awaited<ReturnType<typeof createPitchScene>>;
