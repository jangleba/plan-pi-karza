import { useEffect, useMemo, useRef, useState } from "react";
// @ts-expect-error Three.js is vendored locally so the GitHub package works without another dependency.
import * as THREE from "./vendor/three.module.min.js";
import { Pitch2DFallback } from "./Pitch2DFallback";
import type { BallState, MatchPlayer, Phase, Point, UserPlan } from "./types";

type DragState =
  | { type: "player"; id: string; start: Point; current: Point }
  | { type: "ball"; start: Point; current: Point }
  | null;

type Props = {
  players: MatchPlayer[];
  ball: BallState;
  plan: UserPlan;
  phase: Phase;
  progress: number;
  playbackProgress: number;
  onPlanChange: (plan: UserPlan) => void;
  onHint: (message: string) => void;
};

const FIELD_WIDTH = 18.5;
const FIELD_LENGTH = 25;

const interpolate = (from: Point, to: Point, t: number): Point => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
});

const toWorld = (point: Point) => ({
  x: ((point.x - 50) / 100) * FIELD_WIDTH,
  z: ((point.y - 75) / 150) * FIELD_LENGTH,
});

const toLogical = (x: number, z: number): Point => ({
  x: Math.max(3, Math.min(97, 50 + (x / FIELD_WIDTH) * 100)),
  y: Math.max(4, Math.min(146, 75 + (z / FIELD_LENGTH) * 150)),
});

const makePitchTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1536;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const stripeHeight = canvas.height / 12;
  for (let index = 0; index < 12; index += 1) {
    context.fillStyle = index % 2 ? "#66ad58" : "#73b962";
    context.fillRect(0, index * stripeHeight, canvas.width, stripeHeight + 1);
  }

  const light = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  light.addColorStop(0, "rgba(255,255,255,.16)");
  light.addColorStop(.48, "rgba(255,255,255,0)");
  light.addColorStop(1, "rgba(22,70,38,.11)");
  context.fillStyle = light;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let offset = 0; offset < image.data.length; offset += 16) {
    const variation = Math.round((Math.random() - .5) * 9);
    image.data[offset] = Math.max(0, Math.min(255, image.data[offset] + variation));
    image.data[offset + 1] = Math.max(0, Math.min(255, image.data[offset + 1] + variation));
    image.data[offset + 2] = Math.max(0, Math.min(255, image.data[offset + 2] + variation));
  }
  context.putImageData(image, 0, 0);

  context.strokeStyle = "rgba(255,255,255,.94)";
  context.lineWidth = 7;
  context.lineJoin = "round";
  context.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
  context.beginPath();
  context.moveTo(18, canvas.height / 2);
  context.lineTo(canvas.width - 18, canvas.height / 2);
  context.stroke();
  context.beginPath();
  context.arc(canvas.width / 2, canvas.height / 2, 132, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = "white";
  context.beginPath();
  context.arc(canvas.width / 2, canvas.height / 2, 7, 0, Math.PI * 2);
  context.fill();

  const boxWidth = 560;
  const boxDepth = 250;
  const goalWidth = 300;
  const goalDepth = 92;
  context.strokeRect((canvas.width - boxWidth) / 2, 18, boxWidth, boxDepth);
  context.strokeRect((canvas.width - goalWidth) / 2, 18, goalWidth, goalDepth);
  context.strokeRect((canvas.width - boxWidth) / 2, canvas.height - 18 - boxDepth, boxWidth, boxDepth);
  context.strokeRect((canvas.width - goalWidth) / 2, canvas.height - 18 - goalDepth, goalWidth, goalDepth);

  return canvas;
};

const makeTextSprite = (text: string, foreground: string, background = "rgba(255,255,255,.96)") => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = background;
  context.beginPath();
  context.roundRect(16, 24, 224, 80, 40);
  context.fill();
  context.strokeStyle = "rgba(90,150,205,.6)";
  context.lineWidth = 5;
  context.stroke();
  context.fillStyle = foreground;
  context.font = "900 52px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 128, 65);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.35, .68, 1);
  return sprite;
};

const setCylinder = (mesh: any, x: number, y: number, z: number, rotationZ: number) => {
  mesh.position.set(x, y, z);
  mesh.rotation.z = rotationZ;
};

const createPlayerModel = (player: MatchPlayer) => {
  const home = player.team === "home";
  const jerseyColor = player.goalkeeper ? 0xf27b2f : home ? 0x0b2b4f : 0xf7fafc;
  const shortsColor = player.goalkeeper ? 0xe76520 : home ? 0xf7fafc : 0x173956;
  const sockColor = player.goalkeeper ? 0xef6c24 : home ? 0x143b68 : 0xf7fafc;
  const ringColor = player.goalkeeper ? 0xf1a15c : home ? 0x77bfff : 0xff8b7a;
  const skin = new THREE.MeshStandardMaterial({ color: 0xb97852, roughness: .78 });
  const jersey = new THREE.MeshStandardMaterial({ color: jerseyColor, roughness: .72 });
  const shorts = new THREE.MeshStandardMaterial({ color: shortsColor, roughness: .76 });
  const socks = new THREE.MeshStandardMaterial({ color: sockColor, roughness: .8 });
  const boots = new THREE.MeshStandardMaterial({ color: 0x17202b, roughness: .55 });

  const root = new THREE.Group();
  root.userData.playerId = player.id;
  root.userData.target = new THREE.Vector3();
  root.userData.targetYaw = home ? Math.PI : 0;

  const ringMaterial = new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: player.controlled ? .95 : .22, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(.47, .64, 40, 1), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = .018;
  root.add(ring);
  root.userData.ring = ring;

  const body = new THREE.Group();
  root.add(body);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(.24, .35, .78, 10), jersey);
  torso.position.y = 1.2;
  body.add(torso);
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(.31, .3, .32, 10), shorts);
  waist.position.y = .69;
  body.add(waist);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.22, 14, 10), skin);
  head.position.y = 1.78;
  body.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.225, 12, 8, 0, Math.PI * 2, 0, Math.PI * .48), new THREE.MeshStandardMaterial({ color: 0x34251f, roughness: .9 }));
  hair.position.y = 1.82;
  body.add(hair);

  const limbGeometry = new THREE.CylinderGeometry(.075, .09, .72, 7);
  const lowerLegGeometry = new THREE.CylinderGeometry(.065, .075, .63, 7);
  const armLeft = new THREE.Mesh(limbGeometry, skin);
  const armRight = new THREE.Mesh(limbGeometry, skin);
  setCylinder(armLeft, -.39, 1.12, 0, -.27);
  setCylinder(armRight, .39, 1.12, 0, .27);
  body.add(armLeft, armRight);

  const legLeft = new THREE.Mesh(lowerLegGeometry, socks);
  const legRight = new THREE.Mesh(lowerLegGeometry, socks);
  setCylinder(legLeft, -.16, .3, 0, -.07);
  setCylinder(legRight, .16, .3, 0, .07);
  body.add(legLeft, legRight);
  const bootLeft = new THREE.Mesh(new THREE.BoxGeometry(.16, .12, .38), boots);
  const bootRight = new THREE.Mesh(new THREE.BoxGeometry(.16, .12, .38), boots);
  bootLeft.position.set(-.18, .055, .08);
  bootRight.position.set(.18, .055, .08);
  body.add(bootLeft, bootRight);

  const number = makeTextSprite(String(player.number), home || player.goalkeeper ? "#ffffff" : "#0b2b4f", "rgba(7,28,50,.01)");
  if (number) {
    number.scale.set(.47, .24, 1);
    number.position.set(0, 1.25, .34);
    body.add(number);
  }
  if (player.controlled) {
    const label = makeTextSprite("TY", "#0c6ed6");
    if (label) {
      label.position.set(0, .38, .82);
      root.add(label);
      root.userData.label = label;
    }
  }

  body.traverse((object: any) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      object.userData.playerId = player.id;
    }
  });
  const hit = new THREE.Mesh(new THREE.CapsuleGeometry(.5, 1.3, 3, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hit.position.y = 1;
  hit.userData.playerId = player.id;
  root.add(hit);
  root.userData.hit = hit;
  root.userData.limbs = { armLeft, armRight, legLeft, legRight };
  return root;
};

export function Pitch(props: Props) {
  const { players, ball, plan, phase, progress, playbackProgress, onPlanChange, onHint } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<any>(null);
  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);
  const [drag, setDrag] = useState<DragState>(null);

  const positions = useMemo(() => {
    const map = new Map<string, Point>();
    players.forEach((player) => {
      const observed = phase === "observe" || phase === "countdown" ? interpolate(player.from ?? player, player, progress) : { x: player.x, y: player.y };
      const run = plan.runs.find((item) => item.playerId === player.id);
      map.set(player.id, phase === "playback" && run ? interpolate(run.from, run.to, playbackProgress) : observed);
    });
    return map;
  }, [players, phase, progress, plan.runs, playbackProgress]);

  const ballPosition = useMemo(() => {
    if (phase === "playback" && plan.pass) return interpolate(plan.pass.from, plan.pass.to, Math.min(1, playbackProgress * 1.25));
    if (drag?.type === "ball") return drag.current;
    if (ball.carrierId) return positions.get(ball.carrierId) ?? ball;
    return ball;
  }, [ball, drag, phase, plan.pass, playbackProgress, positions]);

  const latest = useRef({ ...props, positions, ballPosition, drag });
  useEffect(() => {
    latest.current = { ...props, positions, ballPosition, drag };
  }, [props, positions, ballPosition, drag]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || fallback) return;
    let animation = 0;
    let observer: ResizeObserver | null = null;
    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xeaf3ee);
      scene.fog = new THREE.Fog(0xeaf3ee, 31, 45);
      const camera = new THREE.PerspectiveCamera(42, 1, .1, 100);
      camera.position.set(0, 20.5, 22.5);
      camera.lookAt(0, 0, -1.8);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.className = "bwiq-3d-canvas";
      host.appendChild(renderer.domElement);

      const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
      const quality = memory >= 6 && window.innerWidth > 390 ? 1.75 : 1.25;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality));

      scene.add(new THREE.HemisphereLight(0xf8fdff, 0x315d3d, 2.2));
      const sun = new THREE.DirectionalLight(0xffffff, 2.35);
      sun.position.set(-9, 18, 10);
      sun.castShadow = true;
      sun.shadow.mapSize.set(memory >= 6 ? 1024 : 512, memory >= 6 ? 1024 : 512);
      sun.shadow.camera.left = -14;
      sun.shadow.camera.right = 14;
      sun.shadow.camera.top = 18;
      sun.shadow.camera.bottom = -18;
      sun.shadow.bias = -.0004;
      scene.add(sun);

      const surroundings = new THREE.Mesh(new THREE.PlaneGeometry(42, 48), new THREE.MeshStandardMaterial({ color: 0xdfece5, roughness: 1 }));
      surroundings.rotation.x = -Math.PI / 2;
      surroundings.position.y = -.035;
      surroundings.receiveShadow = true;
      scene.add(surroundings);

      const pitchCanvas = makePitchTexture();
      const pitchTexture = pitchCanvas ? new THREE.CanvasTexture(pitchCanvas) : null;
      if (pitchTexture) {
        pitchTexture.colorSpace = THREE.SRGBColorSpace;
        pitchTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      }
      const field = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_WIDTH, FIELD_LENGTH), new THREE.MeshStandardMaterial({ map: pitchTexture, color: pitchTexture ? 0xffffff : 0x70b75f, roughness: .96 }));
      field.rotation.x = -Math.PI / 2;
      field.receiveShadow = true;
      field.userData.field = true;
      scene.add(field);

      const goalMaterial = new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: .5 });
      const createGoal = (z: number, face: number) => {
        const goal = new THREE.Group();
        const postGeometry = new THREE.CylinderGeometry(.045, .045, 1.05, 8);
        const barGeometry = new THREE.CylinderGeometry(.045, .045, 3.15, 8);
        const left = new THREE.Mesh(postGeometry, goalMaterial);
        const right = new THREE.Mesh(postGeometry, goalMaterial);
        const bar = new THREE.Mesh(barGeometry, goalMaterial);
        left.position.set(-1.55, .53, 0);
        right.position.set(1.55, .53, 0);
        bar.rotation.z = Math.PI / 2;
        bar.position.y = 1.04;
        goal.add(left, right, bar);
        goal.position.z = z + face * .08;
        scene.add(goal);
      };
      createGoal(-FIELD_LENGTH / 2, -1);
      createGoal(FIELD_LENGTH / 2, 1);

      const playerObjects = new Map<string, any>();
      const hitObjects: any[] = [];
      players.forEach((player) => {
        const model = createPlayerModel(player);
        playerObjects.set(player.id, model);
        hitObjects.push(model.userData.hit);
        scene.add(model);
      });

      const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(.19, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .58 }));
      ballMesh.castShadow = true;
      ballMesh.userData.ball = true;
      scene.add(ballMesh);
      hitObjects.push(ballMesh);
      const routes = new THREE.Group();
      scene.add(routes);

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const interactionPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersection = new THREE.Vector3();
      const setPointer = (event: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
      };
      const pointOnField = (event: PointerEvent) => {
        setPointer(event);
        if (!raycaster.ray.intersectPlane(interactionPlane, intersection)) return null;
        return toLogical(intersection.x, intersection.z);
      };

      const onPointerDown = (event: PointerEvent) => {
        if (latest.current.phase !== "plan") return;
        setPointer(event);
        const hit = raycaster.intersectObjects(hitObjects, false)[0]?.object;
        if (!hit) return;
        event.preventDefault();
        renderer.domElement.setPointerCapture(event.pointerId);
        if (hit.userData.ball) {
          const start = latest.current.ballPosition;
          setDrag({ type: "ball", start, current: start });
          latest.current.onHint("Puść na partnerze lub w wolnej przestrzeni");
        } else if (hit.userData.playerId) {
          const player = latest.current.players.find((item) => item.id === hit.userData.playerId);
          if (!player || player.team !== "home") return;
          const alreadyPlanned = latest.current.plan.runs.some((run) => run.playerId === player.id);
          if (latest.current.plan.runs.length >= 3 && !alreadyPlanned) return;
          const start = latest.current.positions.get(player.id) ?? player;
          setDrag({ type: "player", id: player.id, start, current: start });
          latest.current.onHint(player.controlled ? "Przeciągnij TY w wybraną przestrzeń" : "Dodajesz ruch wspierający");
        }
        navigator.vibrate?.(8);
      };
      const onPointerMove = (event: PointerEvent) => {
        const active = latest.current.drag;
        if (!active) return;
        const point = pointOnField(event);
        if (point) setDrag({ ...active, current: point });
      };
      const onPointerUp = () => {
        const active = latest.current.drag;
        if (!active) return;
        if (active.type === "player") {
          const nextRuns = latest.current.plan.runs.filter((run) => run.playerId !== active.id);
          const moved = Math.hypot(active.current.x - active.start.x, active.current.y - active.start.y) > 3;
          latest.current.onPlanChange({ ...latest.current.plan, runs: moved ? [...nextRuns, { playerId: active.id, from: active.start, to: active.current }] : nextRuns });
          latest.current.onHint(moved ? "Ruch zapisany" : "Przeciągnij dalej, aby zapisać ruch");
        } else {
          const receiver = latest.current.players.filter((player) => player.team === "home").find((player) => {
            const position = latest.current.positions.get(player.id) ?? player;
            return Math.hypot(position.x - active.current.x, position.y - active.current.y) < 7;
          });
          const target = receiver ? latest.current.positions.get(receiver.id) ?? receiver : active.current;
          latest.current.onPlanChange({ ...latest.current.plan, pass: { from: active.start, to: target, receiverId: receiver?.id } });
          latest.current.onHint(receiver ? `Podanie do numeru ${receiver.number}` : "Podanie w przestrzeń zapisane");
        }
        navigator.vibrate?.(18);
        setDrag(null);
      };
      renderer.domElement.addEventListener("pointerdown", onPointerDown, { passive: false });
      renderer.domElement.addEventListener("pointermove", onPointerMove, { passive: false });
      renderer.domElement.addEventListener("pointerup", onPointerUp);
      renderer.domElement.addEventListener("pointercancel", onPointerUp);

      const resize = () => {
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();
      runtimeRef.current = { scene, camera, renderer, playerObjects, ballMesh, routes };
      setReady(true);

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const clock = new THREE.Clock();
      const render = () => {
        animation = requestAnimationFrame(render);
        const elapsed = clock.getElapsedTime();
        const running = latest.current.phase === "observe" || latest.current.phase === "playback";
        playerObjects.forEach((model: any) => {
          model.position.lerp(model.userData.target, reducedMotion ? 1 : .16);
          const delta = Math.atan2(Math.sin(model.userData.targetYaw - model.rotation.y), Math.cos(model.userData.targetYaw - model.rotation.y));
          model.rotation.y += delta * .14;
          const swing = running ? Math.sin(elapsed * 9 + model.position.x) * .42 : Math.sin(elapsed * 1.8 + model.position.x) * .025;
          const limbs = model.userData.limbs;
          limbs.armLeft.rotation.x = swing;
          limbs.armRight.rotation.x = -swing;
          limbs.legLeft.rotation.x = -swing * .65;
          limbs.legRight.rotation.x = swing * .65;
        });
        ballMesh.rotation.x += .018;
        ballMesh.rotation.z += .012;
        renderer.render(scene, camera);
      };
      render();

      return () => {
        cancelAnimationFrame(animation);
        observer?.disconnect();
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer.domElement.removeEventListener("pointermove", onPointerMove);
        renderer.domElement.removeEventListener("pointerup", onPointerUp);
        renderer.domElement.removeEventListener("pointercancel", onPointerUp);
        renderer.dispose();
        pitchTexture?.dispose();
        renderer.domElement.remove();
        runtimeRef.current = null;
      };
    } catch (error) {
      console.warn("Football IQ 3D fallback", error);
      setFallback(true);
    }
  }, [fallback, players]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    players.forEach((player) => {
      const model = runtime.playerObjects.get(player.id);
      if (!model) return;
      const logical = drag?.type === "player" && drag.id === player.id ? drag.current : positions.get(player.id) ?? player;
      const world = toWorld(logical);
      model.userData.target.set(world.x, 0, world.z);
      const from = player.from ?? player;
      const dx = logical.x - from.x;
      const dz = logical.y - from.y;
      if (Math.abs(dx) + Math.abs(dz) > .5) model.userData.targetYaw = Math.atan2(dx, dz);
      model.userData.ring.material.opacity = player.controlled || drag?.type === "player" && drag.id === player.id || plan.runs.some((run) => run.playerId === player.id) ? .95 : .13;
    });
    const ballWorld = toWorld(ballPosition);
    runtime.ballMesh.position.set(ballWorld.x, .21, ballWorld.z);
  }, [players, positions, drag, plan.runs, ballPosition]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const routes = runtime.routes;
    while (routes.children.length) {
      const child = routes.children.pop();
      child?.geometry?.dispose?.();
      child?.material?.dispose?.();
    }
    plan.runs.forEach((run, routeIndex) => {
      const from = toWorld(run.from);
      const to = toWorld(run.to);
      const dots = 14;
      for (let index = 1; index <= dots; index += 1) {
        const t = index / dots;
        const dot = new THREE.Mesh(new THREE.SphereGeometry(index === dots ? .12 : .075, 9, 7), new THREE.MeshBasicMaterial({ color: index === dots ? 0x7bc3ff : 0xeaf7ff }));
        dot.position.set(from.x + (to.x - from.x) * t, .075, from.z + (to.z - from.z) * t);
        dot.userData.route = routeIndex;
        routes.add(dot);
      }
    });
    if (plan.pass) {
      const from = toWorld(plan.pass.from);
      const to = toWorld(plan.pass.to);
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(from.x, .09, from.z), new THREE.Vector3(to.x, .09, to.z)]);
      routes.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .92 })));
    }
  }, [plan]);

  if (fallback) return <Pitch2DFallback {...props} />;
  return (
    <div className="bwiq-pitch-shell bwiq-pitch-shell-3d">
      <div ref={hostRef} className="bwiq-3d-host" aria-label="Interaktywne boisko Football IQ 3D" />
      {!ready && <div className="bwiq-3d-loading"><i />ŁADUJĘ BOISKO 3D</div>}
    </div>
  );
}
