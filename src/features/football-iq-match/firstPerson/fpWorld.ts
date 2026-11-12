/** Static world for the first-person view, in real metres so the eye-height camera sees
 * correct sizes and perspective: a full 105 × 68 m pitch with 7.32 × 2.44 m goals (3v2) or a
 * small-sided pitch (5v5) passed as `dims`; the ball has a 0.11 m radius.
 * Built once; every geometry, material and texture is tracked and released in dispose(). */
import {
  BackSide,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  type Material,
  type Texture,
  Vector3,
  BoxGeometry,
  CircleGeometry,
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  RingGeometry,
} from "three";
import { PITCH } from "./fpMath";

/** Pitch measurements in metres. `small`: small-sided markings (no 16.5 m box, no arcs). */
export type PitchDims = {
  halfWidth: number;
  halfLength: number;
  goalHalfWidth: number;
  goalHeight: number;
  boxDepth: number;
  boxHalfWidth: number;
  centreRadius?: number;
  small?: boolean;
};

/** Pitch metres (x across, y towards the attacked goal) → three.js world (Y up, attack = −Z). */
export const toWorld = (x: number, y: number, h = 0, out = new Vector3()) => out.set(x, h, -y);
export const BALL_R = 0.11;
const MARGIN = 9;
const PX = 14; // texture pixels per metre

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function noise(seed: number) {
  let n = seed;
  return () => {
    n = (n * 1103515245 + 12345) % 2147483648;
    return n / 2147483648;
  };
}

function pitchTexture(PITCH: PitchDims) {
  const W = Math.round((PITCH.halfWidth * 2 + MARGIN * 2) * PX),
    H = Math.round((PITCH.halfLength * 2 + MARGIN * 2) * PX);
  const canvas = makeCanvas(W, H);
  const g = canvas.getContext("2d")!;
  const px = (x: number) => (x + PITCH.halfWidth + MARGIN) * PX;
  // y grows towards the attacked goal; the texture's top row is the attacked goal end.
  const py = (y: number) => (PITCH.halfLength + MARGIN - y) * PX;
  g.fillStyle = "#3d6f31";
  g.fillRect(0, 0, W, H);
  // Mowing stripes across the pitch (5.25 m on a full pitch, 4 m on a small one).
  const stripe = PITCH.small ? 4 : 5.25;
  const stripes = Math.ceil((PITCH.halfLength * 2 + MARGIN * 2) / stripe) + 1;
  for (let i = -2; i < stripes; i++) {
    const y0 = -PITCH.halfLength + i * stripe;
    g.fillStyle = i % 2 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.05)";
    g.fillRect(0, py(y0 + stripe), W, stripe * PX);
  }
  // Fine grain so the grass does not look flat close to the camera.
  const random = noise(7);
  for (let i = 0; i < (PITCH.small ? Math.round((W * H) / 30) : 60000); i++) {
    const x = random() * W,
      y = random() * H;
    g.fillStyle = random() > 0.5 ? "rgba(20,45,18,0.05)" : "rgba(170,200,130,0.035)";
    g.fillRect(x, y, 1, 1);
  }
  // Markings, 12 cm wide.
  g.strokeStyle = "rgba(246,248,242,0.92)";
  g.lineWidth = 0.12 * PX;
  const rect = (x0: number, y0: number, x1: number, y1: number) =>
    g.strokeRect(px(x0), py(y1), (x1 - x0) * PX, (y1 - y0) * PX);
  rect(-PITCH.halfWidth, -PITCH.halfLength, PITCH.halfWidth, PITCH.halfLength);
  g.beginPath();
  g.moveTo(px(-PITCH.halfWidth), py(0));
  g.lineTo(px(PITCH.halfWidth), py(0));
  g.stroke();
  g.beginPath();
  g.arc(px(0), py(0), (PITCH.centreRadius ?? 9.15) * PX, 0, Math.PI * 2);
  g.stroke();
  for (const end of PITCH.small ? [] : [1, -1]) {
    const line = end * PITCH.halfLength;
    rect(-20.16, end > 0 ? line - 16.5 : line, 20.16, end > 0 ? line : line + 16.5);
    rect(-9.16, end > 0 ? line - 5.5 : line, 9.16, end > 0 ? line : line + 5.5);
    const spot = line - end * 11;
    g.fillStyle = "rgba(246,248,242,0.92)";
    g.beginPath();
    g.arc(px(0), py(spot), 0.12 * PX, 0, Math.PI * 2);
    g.fill();
    // Penalty arc outside the box.
    const a = Math.acos(5.5 / 9.15);
    g.beginPath();
    if (end > 0) g.arc(px(0), py(spot), 9.15 * PX, a, Math.PI - a);
    else g.arc(px(0), py(spot), 9.15 * PX, Math.PI + a, 2 * Math.PI - a);
    g.stroke();
  }
  // Small-sided pitch: one goal area at each end.
  if (PITCH.small)
    for (const end of [1, -1]) {
      const line = end * PITCH.halfLength;
      rect(
        -PITCH.boxHalfWidth,
        end > 0 ? line - PITCH.boxDepth : line,
        PITCH.boxHalfWidth,
        end > 0 ? line : line + PITCH.boxDepth,
      );
    }
  g.fillStyle = "rgba(246,248,242,0.92)";
  g.beginPath();
  g.arc(px(0), py(0), 0.15 * PX, 0, Math.PI * 2);
  g.fill();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function ballTexture() {
  const canvas = makeCanvas(256, 128);
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#f4f4f2";
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = "#1d2227";
  // Panels laid out on the equirectangular map.
  const spots = [
    [32, 64],
    [96, 64],
    [160, 64],
    [224, 64],
    [0, 20],
    [64, 20],
    [128, 20],
    [192, 20],
    [256, 20],
    [0, 108],
    [64, 108],
    [128, 108],
    [192, 108],
    [256, 108],
  ];
  for (const [x, y] of spots) {
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
      const r = y === 64 ? 13 : 10;
      g.lineTo(x! + Math.cos(a) * r * (y === 64 ? 1 : 1.8), y! + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function boardTexture() {
  const canvas = makeCanvas(512, 32);
  const g = canvas.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, "#14304a");
  grad.addColorStop(0.5, "#1c4566");
  grad.addColorStop(1, "#14304a");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 32);
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.font = "600 18px system-ui, sans-serif";
  for (let x = 20; x < 512; x += 170) g.fillText("BALLWISE", x, 23);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** `day`: bright daytime sky with a tree line, floodlight masts and small stands (5v5).
 * Without it the evening look of the 3v2 lesson stays exactly as it was. */
export type WorldOptions = { day?: boolean };

export function buildWorld(PITCH: PitchDims = FULL_PITCH, options: WorldOptions = {}) {
  const group = new Group();
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const keep = <G extends BufferGeometry>(g: G) => (geometries.add(g), g);
  const mat = <M extends Material>(m: M) => (materials.add(m), m);

  // Sky dome: dark evening sky, brighter at the horizon. Not affected by fog.
  const skyGeo = keep(new SphereGeometry(400, 24, 12));
  const colors: number[] = [];
  const pos = skyGeo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, pos.getY(i) / 400);
    if (options.day) {
      // Linear colour values: pale haze at the horizon, clear blue overhead.
      const k = Math.min(1, t * 2.2);
      colors.push(0.62 - 0.5 * k, 0.74 - 0.47 * k, 0.86 - 0.18 * k);
    } else {
      // Linear colour values: deep blue-grey overhead, lighter haze at the horizon.
      colors.push(0.06 - 0.045 * t, 0.085 - 0.06 * t, 0.11 - 0.07 * t);
    }
  }
  skyGeo.setAttribute("color", new Float32BufferAttribute(colors, 3));
  const sky = new Mesh(
    skyGeo,
    mat(new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false })),
  );
  group.add(sky);

  const fieldTex = pitchTexture(PITCH);
  textures.add(fieldTex);
  const fieldW = PITCH.halfWidth * 2 + MARGIN * 2,
    fieldH = PITCH.halfLength * 2 + MARGIN * 2;
  const field = new Mesh(
    keep(new PlaneGeometry(fieldW, fieldH)),
    mat(new MeshStandardMaterial({ map: fieldTex, roughness: 0.95, metalness: 0 })),
  );
  field.rotation.x = -Math.PI / 2;
  group.add(field);
  // Darker surround so the edge of the world is never visible.
  const surround = new Mesh(
    keep(new RingGeometry(Math.hypot(PITCH.halfWidth, PITCH.halfLength) + MARGIN + 2, 380, 32)),
    mat(new MeshBasicMaterial({ color: options.day ? "#4c6b3a" : "#1e3320" })),
  );
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.02;
  group.add(surround);

  // Goals: posts and bar 12 cm wide, white; nets as light lines.
  const postMat = mat(new MeshStandardMaterial({ color: "#f5f6f4", roughness: 0.4 }));
  const postGeo = keep(new CylinderGeometry(0.06, 0.06, PITCH.goalHeight, 12));
  const barGeo = keep(new CylinderGeometry(0.06, 0.06, PITCH.goalHalfWidth * 2 + 0.12, 12));
  const netMat = mat(new LineBasicMaterial({ color: "#e4e8e6", transparent: true, opacity: 0.35 }));
  for (const end of [1, -1]) {
    const goal = new Group();
    const line = end * PITCH.halfLength;
    for (const side of [-1, 1]) {
      const post = new Mesh(postGeo, postMat);
      toWorld(side * (PITCH.goalHalfWidth + 0.06), line, PITCH.goalHeight / 2, post.position);
      goal.add(post);
    }
    const bar = new Mesh(barGeo, postMat);
    bar.rotation.z = Math.PI / 2;
    toWorld(0, line, PITCH.goalHeight, bar.position);
    goal.add(bar);
    const pts: number[] = [];
    const depth = (PITCH.small ? 1.1 : 2.0) * end;
    const push = (a: Vector3, b: Vector3) => pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const w = PITCH.goalHalfWidth;
    for (let x = -w; x <= w + 0.01; x += 0.5) {
      push(toWorld(x, line + depth, 0), toWorld(x, line + depth, PITCH.goalHeight * 0.8));
      push(toWorld(x, line, PITCH.goalHeight), toWorld(x, line + depth, PITCH.goalHeight * 0.8));
    }
    for (let h = 0; h <= PITCH.goalHeight * 0.8 + 0.01; h += 0.5)
      push(toWorld(-w, line + depth, h), toWorld(w, line + depth, h));
    for (const side of [-w, w])
      for (let d = 0; d <= Math.abs(depth) + 0.01; d += 0.5)
        push(
          toWorld(side, line + Math.sign(depth) * d, 0),
          toWorld(
            side,
            line + Math.sign(depth) * d,
            PITCH.goalHeight - (d / Math.abs(depth)) * 0.2 * PITCH.goalHeight,
          ),
        );
    const netGeo = keep(new BufferGeometry());
    netGeo.setAttribute("position", new Float32BufferAttribute(pts, 3));
    goal.add(new LineSegments(netGeo, netMat));
    group.add(goal);
  }

  // LED boards 4 m outside the lines.
  const boardTex = boardTexture();
  textures.add(boardTex);
  const boardMat = mat(new MeshBasicMaterial({ map: boardTex }));
  const gap = PITCH.small ? 2.5 : 4;
  const sideBoard = keep(new BoxGeometry(PITCH.halfLength * 2 - 5, 0.9, 0.15));
  const endBoard = keep(new BoxGeometry(PITCH.halfWidth * 2 - 8, 0.9, 0.15));
  for (const side of [-1, 1]) {
    const b = new Mesh(sideBoard, boardMat);
    b.rotation.y = Math.PI / 2;
    toWorld(side * (PITCH.halfWidth + gap), 0, 0.45, b.position);
    group.add(b);
    const e = new Mesh(endBoard, boardMat);
    toWorld(0, side * (PITCH.halfLength + gap), 0.45, e.position);
    group.add(e);
  }

  if (options.day) addScenery(group, PITCH, keep, mat);

  const ballTex = ballTexture();
  textures.add(ballTex);
  const ball = new Mesh(
    keep(new SphereGeometry(BALL_R, 24, 16)),
    mat(new MeshStandardMaterial({ map: ballTex, roughness: 0.45 })),
  );
  group.add(ball);

  // One shared soft shadow disc for every player and the ball (no shadow maps).
  const shadowGeo = keep(new CircleGeometry(0.45, 20));
  const shadowMat = mat(
    new MeshBasicMaterial({
      color: "#0b1a0c",
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    }),
  );
  const makeShadow = (size = 1) => {
    const m = new Mesh(shadowGeo, shadowMat);
    m.rotation.x = -Math.PI / 2;
    m.scale.setScalar(size);
    m.renderOrder = 1;
    return m;
  };
  const ballShadow = makeShadow(0.3);
  group.add(ballShadow);

  // What the look is aimed at: a thin ring on the grass (any target, never a hint).
  const aimRing = new Mesh(
    keep(new RingGeometry(0.55, 0.68, 32)),
    mat(
      new MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    ),
  );
  aimRing.rotation.x = -Math.PI / 2;
  aimRing.position.y = 0.02;
  aimRing.visible = false;
  group.add(aimRing);

  return {
    group,
    ball,
    ballShadow,
    aimRing,
    makeShadow,
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
export type FpWorld = ReturnType<typeof buildWorld>;

/** Tree line, floodlight masts and two small stands around a small pitch. Trees are one
 * instanced mesh per part, so the whole scenery costs a handful of draw calls. */
function addScenery(
  group: Group,
  PITCH: PitchDims,
  keep: <G extends BufferGeometry>(g: G) => G,
  mat: <M extends Material>(m: M) => M,
) {
  // Deterministic pseudo-random numbers: the same scenery every time.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const crownGeo = keep(new IcosahedronGeometry(1, 1));
  const trunkGeo = keep(new CylinderGeometry(0.18, 0.25, 1, 6));
  const crownMat = mat(
    new MeshStandardMaterial({ color: "#ffffff", roughness: 1, flatShading: true }),
  );
  const trunkMat = mat(new MeshStandardMaterial({ color: "#4a3a2c", roughness: 1 }));
  const rx = PITCH.halfWidth + 30,
    ry = PITCH.halfLength + 34;
  const spots: { x: number; y: number }[] = [];
  for (let a = 0; a < Math.PI * 2; a += 0.045) {
    const r = 1 + rnd() * 0.35;
    spots.push({ x: Math.sin(a) * rx * r * 1.25, y: Math.cos(a) * ry * r * 1.15 });
    if (rnd() > 0.45) spots.push({ x: Math.sin(a) * rx * r * 1.55, y: Math.cos(a) * ry * r * 1.4 });
  }
  const crowns = new InstancedMesh(crownGeo, crownMat, spots.length);
  const trunks = new InstancedMesh(trunkGeo, trunkMat, spots.length);
  const m = new Matrix4(),
    at = new Vector3(),
    tint = new Color();
  const greens = ["#3d6a33", "#4a7a3a", "#36602f", "#557f3f"];
  spots.forEach((s, i) => {
    // Broad leafy crowns, 8–13 m tall trees.
    const h = 4 + rnd() * 3,
      w = 3.2 + rnd() * 2;
    toWorld(s.x, s.y, 3.2 + h * 0.8, at);
    m.makeScale(w, h, w).setPosition(at);
    crowns.setMatrixAt(i, m);
    crowns.setColorAt(i, tint.set(greens[Math.floor(rnd() * greens.length)]!));
    toWorld(s.x, s.y, 2, at);
    m.makeScale(1, 4, 1).setPosition(at);
    trunks.setMatrixAt(i, m);
  });
  group.add(crowns, trunks);

  // Floodlight masts in the four corners, 16 m tall, lamps tilted towards the pitch.
  const mastGeo = keep(new CylinderGeometry(0.16, 0.24, 16, 8));
  const lampGeo = keep(new BoxGeometry(2.4, 1.2, 0.3));
  const mastMat = mat(
    new MeshStandardMaterial({ color: "#9aa3a6", roughness: 0.6, metalness: 0.4 }),
  );
  const lampMat = mat(new MeshStandardMaterial({ color: "#d8dde0", roughness: 0.5 }));
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const x = sx * (PITCH.halfWidth + 7),
        y = sy * (PITCH.halfLength - 2);
      const mast = new Mesh(mastGeo, mastMat);
      toWorld(x, y, 8, mast.position);
      const lamp = new Mesh(lampGeo, lampMat);
      toWorld(x, y, 16.4, lamp.position);
      lamp.rotation.y = Math.atan2(-x, y);
      lamp.rotation.x = -0.35;
      group.add(mast, lamp);
    }

  // Two small covered stands along the long sides: steps, back wall and a light roof.
  const stepGeo = keep(new BoxGeometry(1, 1, 1));
  const standMat = mat(new MeshStandardMaterial({ color: "#7d8a8f", roughness: 0.9 }));
  const seatMat = mat(new MeshStandardMaterial({ color: "#3d6e8c", roughness: 0.8 }));
  const roofMat = mat(new MeshStandardMaterial({ color: "#c9d0d3", roughness: 0.7 }));
  const length = PITCH.halfLength * 1.1;
  for (const side of [-1, 1]) {
    const base = PITCH.halfWidth + 5;
    for (let row = 0; row < 4; row++) {
      const step = new Mesh(stepGeo, row % 2 ? seatMat : standMat);
      step.scale.set(1.0, 0.45 * (row + 1), length);
      toWorld(side * (base + row * 1.0), 0, 0.225 * (row + 1), step.position);
      group.add(step);
    }
    const wall = new Mesh(stepGeo, standMat);
    wall.scale.set(0.3, 4.4, length);
    toWorld(side * (base + 4), 0, 2.2, wall.position);
    const roof = new Mesh(stepGeo, roofMat);
    roof.scale.set(5.2, 0.15, length + 1);
    toWorld(side * (base + 1.6), 0, 4.4, roof.position);
    roof.rotation.z = side * 0.08;
    group.add(wall, roof);
  }
}
const FULL_PITCH: PitchDims = PITCH;
