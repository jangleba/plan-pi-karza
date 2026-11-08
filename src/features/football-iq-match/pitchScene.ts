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
  PerspectiveCamera,
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
import { loadRunningModel, makeActor, PLAYER_HEIGHT } from "./mixamo";
import type { PlaybackFrame } from "./playback";
import { BALL_RADIUS } from "./playback";
import type { MatchPlayer, PlannedAction, Point } from "./types";

const world = (p: Point, height = 0) => new Vector3(p.x - 50, height, p.y - 70);

export async function createPitchScene(
  host: HTMLDivElement,
  players: MatchPlayer[],
  onContextLost: () => void,
  signal?: AbortSignal,
) {
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.dataset.iqPlayerCount = String(players.length);
  host.append(renderer.domElement);
  const scene = new Scene();
  scene.background = new Color("#1b4a40");
  const camera = new OrthographicCamera(-50, 50, 70, -70, 0.1, 600);
  // "2.5D": a TV-like perspective camera from the side that follows the ball.
  const broadcastCamera = new PerspectiveCamera(38, 1, 0.5, 900);
  let view: OrthographicCamera | PerspectiveCamera = camera;
  let broadcast = false;
  let followTarget: Vector3 | null = null;
  let lastFollow = 0;
  let followDistance = 0;
  const relevant = players.filter((p) => !p.goalkeeper || p.controlled);
  const showGoal = (players.find((p) => p.controlled)?.y ?? Infinity) < 60;
  const defaultBounds = {
    xMin: Math.max(0, Math.min(...relevant.map((p) => p.x)) - 16),
    xMax: Math.min(100, Math.max(...relevant.map((p) => p.x)) + 16),
    yMin: showGoal
      ? 0
      : Math.max(0, Math.min(...relevant.map((p) => p.y)) - 16),
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
  const ownedMaterials = new Set<
    MeshBasicMaterial | MeshStandardMaterial | LineBasicMaterial
  >();
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
  for (let i = 0; i < 10; i++)
    plane(50, 7 + i * 14, 100, 14, i % 2 ? "#205347" : "#1c4e43");
  const paint = new LineBasicMaterial({
    color: "#c5dacb",
    transparent: true,
    opacity: 0.6,
  });
  ownedMaterials.add(paint);
  function line(points: Point[], height = 0.04) {
    const geometry = new BufferGeometry().setFromPoints(
      points.map((p) => world(p, height)),
    );
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
  function arc(
    x: number,
    y: number,
    radius: number,
    from = 0,
    to = Math.PI * 2,
  ) {
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
  const ballMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.9,
  });
  ownedGeometries.add(ballGeometry);
  ownedMaterials.add(ballMaterial);
  const ball = new Mesh(ballGeometry, ballMaterial);
  scene.add(ball);
  const ballShadowGeometry = new CircleGeometry(0.9, 16);
  const ballShadowMaterial = new MeshBasicMaterial({
    color: "#061d18",
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  ownedGeometries.add(ballShadowGeometry);
  ownedMaterials.add(ballShadowMaterial);
  const ballShadow = new Mesh(ballShadowGeometry, ballShadowMaterial);
  ballShadow.rotation.x = -Math.PI / 2;
  scene.add(ballShadow);
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
  let figureScale = 1;
  let smallPlayers = false;
  let renderWidth = 1,
    renderHeight = 1;
  const resize = () => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderWidth = width;
    renderHeight = height;
    const aspect = width / height;
    let maxX = 0;
    let maxY = 0;
    for (const x of [viewBounds.xMin, viewBounds.xMax])
      for (const y of [viewBounds.yMin, viewBounds.yMax])
        for (const h of [0, 14]) {
          const view = world({ x, y }, h).applyMatrix4(
            camera.matrixWorldInverse,
          );
          maxX = Math.max(maxX, Math.abs(view.x));
          maxY = Math.max(maxY, Math.abs(view.y));
        }
    const halfHeight = Math.max(maxY, maxX / aspect) * 1.06;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    if (smallPlayers) {
      const floor = world({ x: 50, y: 70 }).project(camera),
        head = world({ x: 50, y: 70 }, PLAYER_HEIGHT).project(camera);
      const base = Math.hypot(
        ((head.x - floor.x) * width) / 2,
        ((head.y - floor.y) * height) / 2,
      );
      figureScale = Math.max(1, Math.min(2.2, 14 / Math.max(0.01, base)));
    }
    broadcastCamera.aspect = aspect;
    broadcastCamera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  const BROADCAST_SCALE = 1;
  // TV side camera: on the touchline, low and close, attack runs left to right.
  const BROADCAST_ELEVATION = (28 * Math.PI) / 180;
  const scaleNow = () => (broadcast ? BROADCAST_SCALE : figureScale);
  /** Frames the ball and your player together, eased while the action runs. */
  const followBall = (frame: PlaybackFrame, moving: boolean) => {
    const ballAt = frame.ballVisual;
    const controlled = players.find((p) => p.controlled);
    const you = (controlled && frame.positions.get(controlled.id)) || ballAt;
    const aim = {
      x: Math.max(12, Math.min(88, ballAt.x * 0.6 + you.x * 0.4)),
      y: Math.max(14, Math.min(126, ballAt.y * 0.6 + you.y * 0.4)),
    };
    // Along the pitch is the screen width, across the pitch is the screen depth.
    const spanAlong = Math.max(
      34,
      Math.min(80, Math.abs(ballAt.y - you.y) + 22),
    );
    const spanAcross = Math.max(
      28,
      Math.min(70, Math.abs(ballAt.x - you.x) + 22),
    );
    const halfV = (broadcastCamera.fov * Math.PI) / 360;
    const halfH = Math.atan(Math.tan(halfV) * broadcastCamera.aspect);
    // Never closer than 55 m: wide, short screens would otherwise put a giant player in front.
    const wanted = Math.max(
      55,
      spanAlong / 2 / Math.tan(halfH),
      (spanAcross * Math.sin(BROADCAST_ELEVATION)) / 2 / Math.tan(halfV),
    );
    // Aim a little toward the camera so players on the near side keep their feet in frame.
    const desired = world({ x: aim.x + 5, y: aim.y });
    const now = performance.now();
    if (!followTarget || !moving) {
      followTarget = desired;
      followDistance = wanted;
    } else {
      const dt = Math.min(0.1, Math.max(0, (now - lastFollow) / 1000));
      const ease = 1 - Math.exp(-dt * 2.2);
      followTarget = followTarget.clone().lerp(desired, ease);
      followDistance += (wanted - followDistance) * ease;
    }
    lastFollow = now;
    const distance = followDistance;
    broadcastCamera.position
      .copy(followTarget)
      .add(
        new Vector3(
          Math.cos(BROADCAST_ELEVATION) * distance,
          Math.sin(BROADCAST_ELEVATION) * distance,
          0,
        ),
      );
    broadcastCamera.lookAt(followTarget);
    broadcastCamera.updateMatrixWorld();
  };
  const clearRoutes = () => {
    routeObjects.forEach((arrow) => arrow.dispose());
    routeObjects = [];
    routes.clear();
  };
  let asset: Awaited<ReturnType<typeof loadRunningModel>>;
  try {
    asset = await loadRunningModel(signal);
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
  let guidanceVisible = true;
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
      actor.root.scale.setScalar(scaleNow());
      actor.shadow.position.copy(world(point, 0.06));
      const motion = frame.motions.get(id)!;
      // Leg stride follows map distance at this display scale; field coordinates stay unchanged.
      actor.pose(
        scaleNow() === 1
          ? motion
          : { ...motion, distance: motion.distance / scaleNow() },
        clock,
      );
    });
    ball.position.copy(world(frame.ballVisual, frame.ballHeight));
    ballShadow.position.copy(world(frame.ballVisual, 0.08));
    ballShadow.scale.setScalar(1 + Math.min(frame.ballHeight, 14) * 0.055);
    ballShadowMaterial.opacity = Math.max(
      0.12,
      0.36 - frame.ballHeight * 0.016,
    );
    carrierRing.visible = guidanceVisible && !frame.ballInFlight;
    const carrierPoint = frame.positions.get(frame.ballCarrierId);
    if (carrierPoint) carrierRing.position.copy(world(carrierPoint, 0.11));
    if (cue.visible)
      cue.scale.setScalar(
        reducedMotion.matches ? 1 : 1 + Math.sin(clock * 2.2) * 0.045,
      );
    renderer.render(scene, view);
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
    if (canIdle() && idleAnimation === null)
      idleAnimation = requestAnimationFrame(tickIdle);
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
  let closeCamera = false;
  let fixedCamera = false;
  let wideCamera = false;
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
    showGuidance = true,
    cameraClose = false,
    fixedView = false,
    landscapeView = false,
    compactPlayers = false,
    broadcastView = false,
  ) => {
    if (disposed || contextLost) return;
    // The side camera suits landscape screens too, like a TV picture.
    const wantBroadcast = broadcastView;
    if (wantBroadcast !== broadcast) {
      broadcast = wantBroadcast;
      view = broadcast ? broadcastCamera : camera;
      followTarget = null;
    }
    if (broadcast) followBall(frame, isPlaying);
    if (
      fixedCamera !== fixedView ||
      wideCamera !== landscapeView ||
      smallPlayers !== compactPlayers ||
      focused !== focusOnActions ||
      closeCamera !== cameraClose ||
      (focusOnActions && focusActions !== cameraActions)
    ) {
      fixedCamera = fixedView;
      wideCamera = landscapeView;
      smallPlayers = compactPlayers;
      figureScale = compactPlayers ? 1.5 : fixedView ? 2 : 1;
      focused = focusOnActions;
      closeCamera = cameraClose;
      focusActions = cameraActions;
      if (fixedView) {
        viewBounds = { xMin: 0, xMax: 100, yMin: 0, yMax: 140 };
      } else if (focused && cameraActions.length) {
        const points = cameraActions.flatMap((action) =>
          action.type === "shot" ? [action.from] : [action.from, action.to],
        );
        const minX = Math.min(...points.map((p) => p.x)),
          maxX = Math.max(...points.map((p) => p.x));
        const minY = Math.min(...points.map((p) => p.y)),
          maxY = Math.max(...points.map((p) => p.y));
        const minWidth = cameraClose ? 18 : 35,
          minHeight = cameraClose ? 18 : 31,
          padding = cameraClose ? 7 : 10;
        const cx = Math.max(
          minWidth,
          Math.min(100 - minWidth, (minX + maxX) / 2),
        );
        const cy = Math.max(
          minHeight,
          Math.min(140 - minHeight, (minY + maxY) / 2),
        );
        const hx = Math.max(minWidth, (maxX - minX) / 2 + padding);
        const hy = Math.max(minHeight, (maxY - minY) / 2 + padding);
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
      camera.position
        .copy(center)
        .add(
          landscapeView
            ? new Vector3(125, 240, 0)
            : cameraClose
              ? new Vector3(0, 105, 145)
              : new Vector3(0, 170, 120),
        );
      camera.lookAt(center);
      camera.updateMatrixWorld();
      resize();
    }
    currentFrame = frame;
    renderer.domElement.dataset.iqActionCount = String(actions.length);
    renderer.domElement.dataset.iqLandscapeView = String(landscapeView);
    renderer.domElement.dataset.iqCameraClose = String(cameraClose);
    renderer.domElement.dataset.iqBroadcast = String(broadcast);
    renderer.domElement.dataset.iqViewBounds = JSON.stringify(viewBounds);
    const groundCorners = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 140 },
      { x: 100, y: 140 },
    ].map((p) => {
      const q = world(p).project(view);
      return {
        x: ((q.x + 1) * renderWidth) / 2,
        y: ((1 - q.y) * renderHeight) / 2,
      };
    });
    renderer.domElement.dataset.iqFieldWidth = String(
      Math.max(...groundCorners.map((p) => p.x)) -
        Math.min(...groundCorners.map((p) => p.x)),
    );
    if (host.closest("[data-iq-qa]")) {
      renderer.domElement.dataset.iqPitchCorners =
        JSON.stringify(groundCorners);
      renderer.domElement.dataset.iqProjectedPlayers = JSON.stringify(
        Object.fromEntries(
          players.map((p) => {
            const q = world(frame.positions.get(p.id)!, 7.5).project(view);
            return [
              p.id,
              {
                x: ((q.x + 1) * renderWidth) / 2,
                y: ((1 - q.y) * renderHeight) / 2,
              },
            ];
          }),
        ),
      );
    }
    const controlled = players.find((p) => p.controlled);
    if (controlled) {
      const position = frame.positions.get(controlled.id)!;
      const floorPoint = world(position).project(view),
        headPoint = world(position, PLAYER_HEIGHT * scaleNow()).project(view);
      renderer.domElement.dataset.iqControlledHeight = String(
        Math.hypot(
          ((headPoint.x - floorPoint.x) * renderWidth) / 2,
          ((headPoint.y - floorPoint.y) * renderHeight) / 2,
        ),
      );
    }
    guidanceVisible = showGuidance;
    playing = isPlaying;
    if (playing) stopIdle();
    if (previousRoutes !== actions) {
      clearRoutes();
      actions.forEach((action) => {
        const delta = world(action.to).sub(world(action.from));
        if (delta.length() < 0.1) return;
        const arrow = new ArrowHelper(
          delta.clone().normalize(),
          world(action.from, 0.12),
          delta.length(),
          action.analysisColor ??
            (action.type === "shot"
              ? "#f3cf73"
              : action.type === "pass"
                ? "#b5deff"
                : ["cover", "mark", "press"].includes(action.type)
                  ? "#376951"
                  : "#347eb4"),
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
      for (const material of [
        arrow.line.material,
        arrow.cone.material,
      ].flat()) {
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
    const p = world(point, height).project(view);
    return {
      x: ((p.x + 1) * renderWidth) / 2,
      y: ((1 - p.y) * renderHeight) / 2,
    };
  };
  const pick = (clientX: number, clientY: number): Point | null => {
    const bounds = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(
      new Vector2(
        ((clientX - bounds.left) / bounds.width) * 2 - 1,
        1 - ((clientY - bounds.top) / bounds.height) * 2,
      ),
      view,
    );
    const hit = raycaster.ray.intersectPlane(floor, new Vector3());
    if (
      !hit ||
      hit.x < (smallPlayers ? -50 : -48) ||
      hit.x > (smallPlayers ? 50 : 48) ||
      hit.z < (smallPlayers ? -72 : -67) ||
      hit.z > (smallPlayers ? 72 : 67)
    )
      return null;
    return smallPlayers
      ? { x: hit.x + 50, y: hit.z + 70 }
      : {
          x: Math.max(3, Math.min(97, hit.x + 50)),
          y: Math.max(4, Math.min(136, hit.z + 70)),
        };
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
  return {
    update,
    resize,
    project,
    pick,
    dispose,
    figureHeight: () => PLAYER_HEIGHT * scaleNow(),
  };
}
export type PitchScene = Awaited<ReturnType<typeof createPitchScene>>;
