/** The TV side view's pitch: mown grass with painted markings in one texture,
 * 3D goals with nets, corner flags, advertising boards and a stand.
 * Everything is static and built once, so it costs nothing per frame.
 *
 * Pitch coordinates: x 0–100 across, y 0–140 between the goal lines' outer
 * edge; markings run from x 2.2 to 97.8 and y 3 to 137 (see pitchScene.ts).
 */
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  type Vector3,
} from "three";
import type { Point } from "./types";

type World = (p: Point, height?: number) => Vector3;

/** Grass around the markings, so the camera never sees the edge of the world. */
const MARGIN = 14;
const PX_PER_UNIT = 12;
const GOAL_DEPTH = 2.6;
const POST = 0.22;

/** Deterministic pseudo-random noise, so the grass looks the same on every load. */
function noise(seed: number) {
  let n = seed;
  return () => {
    n = (n * 1103515245 + 12345) % 2147483648;
    return n / 2147483648;
  };
}

function grassTexture(): CanvasTexture {
  const width = (100 + MARGIN * 2) * PX_PER_UNIT,
    height = (140 + MARGIN * 2) * PX_PER_UNIT;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d")!;
  const px = (u: number) => (u + MARGIN) * PX_PER_UNIT;
  // Base and mowing stripes across the pitch (perpendicular to the touchlines).
  g.fillStyle = "#3a7f37";
  g.fillRect(0, 0, width, height);
  const stripe = 140 / 14;
  for (let i = -2; i < 16; i++) {
    g.fillStyle = i % 2 ? "#3f8a3b" : "#479442";
    g.fillRect(0, px(i * stripe), width, stripe * PX_PER_UNIT + 1);
  }
  // Fine grain: thousands of short blades in lighter and darker tones.
  const random = noise(7);
  for (let i = 0; i < 26000; i++) {
    const x = random() * width,
      y = random() * height,
      light = random() > 0.5;
    g.fillStyle = light ? "rgba(255,255,230,0.05)" : "rgba(0,30,0,0.07)";
    g.fillRect(x, y, 1.5, 3 + random() * 3);
  }
  // Worn areas in front of both goals and in the centre circle.
  for (const [x, y, r] of [
    [50, 6, 7],
    [50, 134, 7],
    [50, 70, 6],
  ]) {
    const glow = g.createRadialGradient(px(x), px(y), 0, px(x), px(y), r * PX_PER_UNIT);
    glow.addColorStop(0, "rgba(120,110,60,0.22)");
    glow.addColorStop(1, "rgba(120,110,60,0)");
    g.fillStyle = glow;
    g.fillRect(px(x - r), px(y - r), r * 2 * PX_PER_UNIT, r * 2 * PX_PER_UNIT);
  }
  // Darker run-off outside the touchlines.
  g.fillStyle = "rgba(0,25,0,0.22)";
  g.fillRect(0, 0, width, px(3));
  g.fillRect(0, px(137), width, height - px(137));
  g.fillRect(0, 0, px(2.2), height);
  g.fillRect(px(97.8), 0, width - px(97.8), height);
  // Painted markings: 12 cm lines at this scale read as ~0.3 units.
  g.strokeStyle = "rgba(250,252,246,0.92)";
  g.lineWidth = 0.3 * PX_PER_UNIT;
  g.lineJoin = "miter";
  const rect = (x: number, y: number, w: number, h: number) =>
    g.strokeRect(px(x), px(y), w * PX_PER_UNIT, h * PX_PER_UNIT);
  rect(2.2, 3, 95.6, 134);
  rect(22, 3, 56, 27);
  rect(36, 3, 28, 11);
  rect(22, 110, 56, 27);
  rect(36, 126, 28, 11);
  g.beginPath();
  g.moveTo(px(2.2), px(70));
  g.lineTo(px(97.8), px(70));
  g.stroke();
  const arc = (x: number, y: number, r: number, from = 0, to = Math.PI * 2) => {
    g.beginPath();
    g.arc(px(x), px(y), r * PX_PER_UNIT, from, to);
    g.stroke();
  };
  arc(50, 70, 9);
  arc(50, 24, 11, 0.56, Math.PI - 0.56);
  arc(50, 116, 11, Math.PI + 0.56, 2 * Math.PI - 0.56);
  for (const [x, y, from] of [
    [2.2, 3, 0],
    [97.8, 3, Math.PI / 2],
    [97.8, 137, Math.PI],
    [2.2, 137, (3 * Math.PI) / 2],
  ])
    arc(x, y, 1.4, from, from + Math.PI / 2);
  g.fillStyle = g.strokeStyle;
  for (const [x, y] of [
    [50, 70],
    [50, 19],
    [50, 121],
  ]) {
    g.beginPath();
    g.arc(px(x), px(y), 0.35 * PX_PER_UNIT, 0, Math.PI * 2);
    g.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Spectators as small coloured dots on dark seats. */
function crowdTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#26303a";
  g.fillRect(0, 0, 512, 64);
  const random = noise(11);
  const shirts = ["#d9dde2", "#c8202f", "#113a63", "#f2b705", "#e9e4d8", "#2c6e49", "#8a8f96"];
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = shirts[Math.floor(random() * shirts.length)];
    g.fillRect(random() * 512, random() * 64, 2, 3);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

function boardTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 32;
  const g = canvas.getContext("2d")!;
  const panels = ["#113a63", "#f4f4f0", "#c8202f", "#0f5132", "#f2b705", "#1b1f24"];
  const words = ["BALLWISE", "IQ", "FOOTBALL", "PLAN", "TRENING", "TAKTYKA"];
  for (let i = 0; i < 8; i++) {
    const color = panels[i % panels.length];
    g.fillStyle = color;
    g.fillRect(i * 128, 0, 128, 32);
    g.fillStyle = ["#f4f4f0", "#f2b705"].includes(color) ? "#1b1f24" : "#f4f4f0";
    g.font = "bold 18px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(words[i % words.length], i * 128 + 64, 17);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  return texture;
}

/** Net as line segments: back, roof and both sides, on a 1-unit mesh. */
function netGeometry(world: World, goalY: number, height: number) {
  const back = goalY < 70 ? goalY - GOAL_DEPTH : goalY + GOAL_DEPTH;
  const points: number[] = [];
  const push = (a: Vector3, b: Vector3) => points.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const at = (x: number, y: number, h: number) => world({ x, y }, h);
  // The roof slopes down to 70% of the bar height at the back.
  const backHeight = height * 0.7;
  for (let x = 42; x <= 58.001; x += 1) {
    push(at(x, back, 0), at(x, back, backHeight));
    push(at(x, back, backHeight), at(x, goalY, height));
  }
  for (let h = 0; h <= backHeight + 0.001; h += 1) push(at(42, back, h), at(58, back, h));
  for (let t = 0; t <= 1.001; t += 0.25) {
    const y = goalY + (back - goalY) * t;
    const h = height + (backHeight - height) * t;
    push(at(42, y, h), at(58, y, h));
  }
  for (const x of [42, 58]) {
    for (let t = 0; t <= 1.001; t += 0.25) {
      const y = goalY + (back - goalY) * t;
      push(at(x, y, 0), at(x, y, height + (backHeight - height) * t));
    }
    for (let h = 0; h <= height; h += 1) {
      const t = h <= backHeight ? 1 : (height - h) / (height - backHeight);
      push(at(x, goalY, h), at(x, goalY + (back - goalY) * t, h));
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
  return geometry;
}

export function buildStadium(world: World, goalHeight: number) {
  const group = new Group();
  const geometries: BufferGeometry[] = [];
  const materials: (MeshBasicMaterial | MeshStandardMaterial | LineBasicMaterial)[] = [];
  const textures: Texture[] = [];
  const own = <T extends BufferGeometry>(g: T) => (geometries.push(g), g);

  // Grass with all markings painted in.
  const grass = grassTexture();
  textures.push(grass);
  const grassMaterial = new MeshBasicMaterial({ map: grass });
  materials.push(grassMaterial);
  const field = new Mesh(own(new PlaneGeometry(100 + MARGIN * 2, 140 + MARGIN * 2)), grassMaterial);
  field.rotation.x = -Math.PI / 2;
  field.position.copy(world({ x: 50, y: 70 }, 0.01));
  group.add(field);

  // Goals: round posts and bar, white net.
  const frame = new MeshStandardMaterial({ color: "#f7f8f6", roughness: 0.35, metalness: 0.1 });
  const netMaterial = new LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.45 });
  materials.push(frame, netMaterial);
  const post = own(new CylinderGeometry(POST, POST, goalHeight, 12));
  const bar = own(new CylinderGeometry(POST, POST, 16 + POST * 2, 12));
  for (const goalY of [3, 137]) {
    for (const x of [42, 58]) {
      const mesh = new Mesh(post, frame);
      mesh.position.copy(world({ x, y: goalY }, goalHeight / 2));
      group.add(mesh);
    }
    const crossbar = new Mesh(bar, frame);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.copy(world({ x: 50, y: goalY }, goalHeight));
    group.add(crossbar);
    group.add(new LineSegments(own(netGeometry(world, goalY, goalHeight)), netMaterial));
  }

  // Corner flags.
  const pole = own(new CylinderGeometry(0.08, 0.08, 2.6, 6));
  const flag = own(new PlaneGeometry(1, 0.7));
  const poleMaterial = new MeshStandardMaterial({ color: "#f2f2ee" });
  const flagMaterial = new MeshBasicMaterial({ color: "#f2b705", side: DoubleSide });
  materials.push(poleMaterial, flagMaterial);
  for (const [x, y] of [
    [2.2, 3],
    [97.8, 3],
    [2.2, 137],
    [97.8, 137],
  ]) {
    const p = new Mesh(pole, poleMaterial);
    p.position.copy(world({ x, y }, 1.3));
    group.add(p);
    const f = new Mesh(flag, flagMaterial);
    f.position.copy(world({ x, y: y + (y < 70 ? 0.5 : -0.5) }, 2.25));
    f.rotation.y = Math.PI / 2;
    group.add(f);
  }

  // Advertising boards along both touchlines and behind both goals.
  const boards = boardTexture();
  textures.push(boards);
  const boardMaterial = new MeshBasicMaterial({ map: boards });
  materials.push(boardMaterial);
  const boardHeight = 1.3;
  const addBoard = (center: Point, length: number, along: "x" | "y") => {
    const texture = boards.clone();
    texture.needsUpdate = true;
    texture.repeat.set(length / 24, 1);
    textures.push(texture);
    const material = new MeshBasicMaterial({ map: texture });
    materials.push(material);
    const mesh = new Mesh(
      own(
        along === "y"
          ? new BoxGeometry(0.2, boardHeight, length)
          : new BoxGeometry(length, boardHeight, 0.2),
      ),
      material,
    );
    mesh.position.copy(world(center, boardHeight / 2));
    group.add(mesh);
  };
  // Only the far touchline: a board on the camera side would hide the players.
  addBoard({ x: -4, y: 70 }, 150, "y");
  addBoard({ x: 50, y: -5 }, 70, "x");
  addBoard({ x: 50, y: 145 }, 70, "x");

  // A low stand behind the far touchline, in steps, so the horizon is not empty.
  const standMaterial = new MeshStandardMaterial({ color: "#3b4651", roughness: 0.9 });
  const crowd = crowdTexture();
  crowd.repeat.set(8, 1);
  textures.push(crowd);
  const seatMaterial = new MeshBasicMaterial({ map: crowd });
  materials.push(standMaterial, seatMaterial);
  for (let row = 0; row < 6; row++) {
    const height = (row + 1) * 1.6;
    const step = new Mesh(own(new BoxGeometry(3, height, 190)), seatMaterial);
    step.position.copy(world({ x: -9 - row * 3, y: 70 }, height / 2));
    group.add(step);
  }
  for (const side of [-1, 1]) {
    const end = new Mesh(own(new BoxGeometry(150, 6, 3)), standMaterial);
    end.position.copy(world({ x: 50, y: side < 0 ? -12 : 152 }, 3));
    group.add(end);
  }

  const dispose = () => {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  };
  return { group, dispose };
}
