import * as THREE from "three";
import { HIP_H, SHIN, THIGH, stepGait, type GaitState } from "./gait";

/** Elementy sceny IQ: boisko, bramka z siatką, sylwetki zawodników, piłka. Jednostki: metry. */
export const FIELD = { w: 105, h: 68 };
const PX = 20; // pikseli tekstury na metr

/** Murawa z pasami koszenia i pełnymi liniami boiska. */
export function pitchTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = FIELD.w * PX; c.height = FIELD.h * PX;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 20; i++) {
    g.fillStyle = i % 2 ? "#5fa86b" : "#69b276";
    g.fillRect(i * 5.25 * PX, 0, 5.25 * PX + 1, c.height);
  }
  // delikatne ziarno murawy
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "0,40,0"},0.035)`;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2);
  }
  const m = (v: number) => v * PX;
  g.strokeStyle = "rgba(255,255,255,0.95)"; g.lineWidth = 0.12 * PX; g.lineCap = "round";
  const rect = (x: number, y: number, w: number, h: number) => g.strokeRect(m(x), m(y), m(w), m(h));
  rect(0.06, 0.06, FIELD.w - 0.12, FIELD.h - 0.12);
  g.beginPath(); g.moveTo(m(52.5), 0); g.lineTo(m(52.5), c.height); g.stroke();
  g.beginPath(); g.arc(m(52.5), m(34), m(9.15), 0, Math.PI * 2); g.stroke();
  for (const side of [0, 1]) {
    const x0 = side ? FIELD.w - 16.5 : 0, gx = side ? FIELD.w - 5.5 : 0, spot = side ? FIELD.w - 11 : 11;
    rect(x0, 34 - 20.16, 16.5, 40.32);
    rect(gx, 34 - 9.16, 5.5, 18.32);
    g.fillStyle = "white";
    g.beginPath(); g.arc(m(spot), m(34), m(0.2), 0, Math.PI * 2); g.fill();
    // łuk pola karnego (część koła poza polem)
    const a = Math.acos(5.5 / 9.15);
    g.beginPath();
    if (side) g.arc(m(spot), m(34), m(9.15), Math.PI - a, Math.PI + a);
    else g.arc(m(spot), m(34), m(9.15), -a, a);
    g.stroke();
  }
  g.beginPath(); g.arc(m(52.5), m(34), m(0.2), 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Niebo: jasny błękit przechodzący w biel przy horyzoncie. */
export function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 2; c.height = 256;
  const g = c.getContext("2d")!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, "#4f8fd8"); gr.addColorStop(0.45, "#8fbbea"); gr.addColorStop(0.8, "#cfe3f5"); gr.addColorStop(1, "#e3eef8");
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Kolor mgły dopasowany do horyzontu nieba (żeby dal nie bielała). */
export const FOG_COLOR = 0xcfe0f1;

/** Tłum: ciemne rzędy siedzeń z kolorowymi sylwetkami (kibice w barwach obu drużyn i neutralnych). */
function crowdTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2a3140"; g.fillRect(0, 0, 256, 256);
  const kit = ["#2f6fb3", "#2f6fb3", "#c8443f", "#c8443f", "#f1f3f5", "#e0b23a", "#8a95a5", "#1d1d1f", "#4a9a63"];
  const skin = ["#f0c9a8", "#d9a77c", "#b9835a", "#8a5b3c"];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let row = 0; row < 32; row++) {
    for (let x = 0; x < 256; x += 8) {
      if (rnd() < 0.12) continue; // wolne miejsca
      const cx = x + 4 + (rnd() - 0.5) * 2, cy = row * 8 + 5;
      g.fillStyle = kit[Math.floor(rnd() * kit.length)]!;
      g.fillRect(cx - 3, cy, 6, 4);
      g.fillStyle = skin[Math.floor(rnd() * skin.length)]!;
      g.beginPath(); g.arc(cx, cy - 1.5, 2.1, 0, Math.PI * 2); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Bandy reklamowe: pasy kolorów z napisem. */
function adTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 64;
  const g = c.getContext("2d")!;
  const cells = [["#2f6fb3", "BALLWISE"], ["#f1f3f5", "TRENUJ MĄDRZEJ"], ["#c8443f", "BALLWISE"], ["#1d1d1f", "GRAJ LEPIEJ"]] as const;
  const w = c.width / cells.length;
  cells.forEach(([bg, txt], i) => {
    g.fillStyle = bg; g.fillRect(i * w, 0, w, 64);
    g.fillStyle = bg === "#f1f3f5" ? "#1d1d1f" : "#fff";
    g.font = "700 30px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(txt, i * w + w / 2, 33);
  });
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.repeat.set(2, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Jedna trybuna: pochyły sektor z tłumem, tylna ściana i dach. Front zwrócony w stronę +z (lokalnie), oś długa = x. */
function stand(len: number, depth: number, rise: number, crowd: THREE.Texture, wall: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const hyp = Math.hypot(depth, rise - 0.6);
  const rake = new THREE.BufferGeometry();
  rake.setAttribute("position", new THREE.Float32BufferAttribute([-len / 2, 0.6, 0, len / 2, 0.6, 0, len / 2, rise, -depth, -len / 2, rise, -depth], 3));
  rake.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, len / 9, 0, len / 9, hyp / 9, 0, hyp / 9], 2));
  rake.setIndex([0, 1, 2, 0, 2, 3]);
  rake.computeVertexNormals();
  const tex = crowd.clone(); tex.needsUpdate = true; tex.repeat.set(1, 1);
  g.add(new THREE.Mesh(rake, new THREE.MeshStandardMaterial({ map: tex, roughness: 1, side: THREE.DoubleSide })));
  const back = new THREE.Mesh(new THREE.PlaneGeometry(len, rise + 5), wall);
  back.position.set(0, (rise + 5) / 2, -depth); g.add(back);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 2, 0.5, depth + 4), new THREE.MeshStandardMaterial({ color: 0xe9eef4, roughness: 0.9 }));
  roof.position.set(0, rise + 4.6, -depth / 2 + 1.5); roof.rotation.x = -0.06; g.add(roof);
  const post = new THREE.MeshStandardMaterial({ color: 0xc9d1db, roughness: 0.8 });
  for (let i = 0; i <= 6; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, rise + 4.5, 0.5), post);
    p.position.set(-len / 2 + (len * i) / 6, (rise + 4.5) / 2, -depth + 0.3); g.add(p);
  }
  return g;
}

/** Stadion wokół boiska: bandy reklamowe i cztery trybuny z tłumem. Tanie w rysowaniu (kilkanaście brył, 2 tekstury). */
export function makeStadium(): THREE.Group {
  const root = new THREE.Group();
  const crowd = crowdTexture();
  const wall = new THREE.MeshStandardMaterial({ color: 0x3b4558, roughness: 1, side: THREE.DoubleSide });
  const D = 8.5; // odległość trybun od linii boiska
  const L = FIELD.w, H = FIELD.h;
  const place = (len: number, x: number, z: number, ry: number, depth = 15, rise = 9) => {
    const s = stand(len, depth, rise, crowd, wall);
    s.position.set(x, 0, z); s.rotation.y = ry; root.add(s);
  };
  place(L + 40, L / 2, -D, 0);
  place(L + 40, L / 2, H + D, Math.PI);
  place(H + 24, -D, H / 2, Math.PI / 2, 13, 8);
  place(H + 24, L + D, H / 2, -Math.PI / 2, 13, 8);
  // bandy reklamowe 3 m od linii
  const ad = adTexture();
  const boardMat = new THREE.MeshStandardMaterial({ map: ad, roughness: 0.6 });
  const board = (w: number, x: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, 0.12), boardMat.clone());
    (m.material as THREE.MeshStandardMaterial).map = ad.clone();
    (m.material as THREE.MeshStandardMaterial).map!.repeat.set(w / 30, 1);
    (m.material as THREE.MeshStandardMaterial).map!.needsUpdate = true;
    m.position.set(x, 0.45, z); m.rotation.y = ry; root.add(m);
  };
  board(L + 6, L / 2, -3, 0);
  board(L + 6, L / 2, H + 3, Math.PI);
  board(H + 6, -3, H / 2, Math.PI / 2);
  board(H + 6, L + 3, H / 2, -Math.PI / 2);
  return root;
}

function netTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const g = c.getContext("2d")!;
  g.strokeStyle = "rgba(255,255,255,0.85)"; g.lineWidth = 2;
  g.strokeRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Bramka: słupki, poprzeczka i siatka. x – linia bramkowa, kierunek do tyłu: +1 albo −1. */
export function makeGoal(x: number, back: 1 | -1): THREE.Group {
  const g = new THREE.Group();
  const post = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const r = 0.06, W = 7.32, H = 2.44, D = 2;
  for (const z of [-W / 2, W / 2]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, H, 12), post);
    p.position.set(0, H / 2, z); p.castShadow = true; g.add(p);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, W, 12), post);
  bar.rotation.x = Math.PI / 2; bar.position.set(0, H, 0); bar.castShadow = true; g.add(bar);
  const tex = netTexture();
  const net = (w: number, h: number) => {
    const t = tex.clone(); t.needsUpdate = true; t.repeat.set(w * 4, h * 4);
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  };
  const backNet = new THREE.Mesh(new THREE.PlaneGeometry(W, H), net(W, H));
  backNet.rotation.y = Math.PI / 2; backNet.position.set(back * D, H / 2, 0); g.add(backNet);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(D, W), net(D, W));
  top.rotation.x = -Math.PI / 2; top.position.set((back * D) / 2, H, 0); g.add(top);
  for (const z of [-W / 2, W / 2]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(D, H), net(D, H));
    side.position.set((back * D) / 2, H / 2, z); g.add(side);
  }
  g.position.set(x, 0, 34);
  return g;
}

export interface Figure {
  root: THREE.Group;
  /** Miednica: przesuwa się w pionie zgodnie z ułożeniem nóg. */
  body: THREE.Group;
  /** Tułów, ręce i głowa – pochylają się od bioder w górę (nogi zostają pod ciałem). */
  upper: THREE.Group;
  hips: [THREE.Group, THREE.Group];
  knees: [THREE.Group, THREE.Group];
  ankles: [THREE.Group, THREE.Group];
  gait: GaitState;
  shoulders: [THREE.Group, THREE.Group];
  elbows: [THREE.Group, THREE.Group];
  torso: THREE.Mesh;
  phase: number;
  /** Pozostały czas animacji kopnięcia (s). */
  kick: number;
  stance: "run" | "defend" | "keeper";
}

export interface Kit {
  jersey: number;
  shorts: number;
  socks: number;
  collar?: number;
  number?: number;
  keeper?: boolean;
  gloves?: number;
}

const SKINS = [0xe8bf9a, 0xd9a77c, 0xb57e55, 0x7a5233];
const HAIRS = [0x2b2118, 0x4a3426, 0x151515, 0x8a6a3b];

// geometrie wspólne dla wszystkich zawodników (tworzone raz – mniej pamięci i szybsze rysowanie)
let G: ReturnType<typeof buildGeo> | null = null;
function geo() {
  return (G ??= buildGeo());
}
function buildGeo() {
  // tułów: profil od pasa do ramion, obrócony (lathe)
  const torsoProfile = [
    [0.0, 0.0], [0.165, 0.0], [0.175, 0.08], [0.19, 0.22], [0.215, 0.38], [0.22, 0.47], [0.19, 0.53], [0.09, 0.565], [0.0, 0.57],
  ].map(([r, y]) => new THREE.Vector2(r!, y!));
  const shortsProfile = [[0.0, 0.0], [0.175, 0.0], [0.19, 0.1], [0.185, 0.22], [0.0, 0.24]].map(([r, y]) => new THREE.Vector2(r!, y!));
  const boot = new THREE.BoxGeometry(0.25, 0.075, 0.1, 2, 1, 1);
  boot.translate(0.05, 0, 0);
  return {
    torso: new THREE.LatheGeometry(torsoProfile, 18),
    shorts: new THREE.LatheGeometry(shortsProfile, 16),
    thigh: new THREE.CapsuleGeometry(0.078, 0.3, 4, 10),
    shin: new THREE.CapsuleGeometry(0.06, 0.3, 4, 10),
    boot,
    sole: new THREE.BoxGeometry(0.255, 0.02, 0.105),
    sleeve: new THREE.CapsuleGeometry(0.062, 0.1, 3, 10),
    upperArm: new THREE.CapsuleGeometry(0.047, 0.16, 3, 8),
    forearm: new THREE.CapsuleGeometry(0.042, 0.2, 3, 8),
    hand: new THREE.SphereGeometry(0.048, 10, 8),
    glove: new THREE.SphereGeometry(0.07, 10, 8),
    neck: new THREE.CylinderGeometry(0.05, 0.055, 0.09, 10),
    head: new THREE.SphereGeometry(0.115, 18, 14),
    hair: new THREE.SphereGeometry(0.121, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    ear: new THREE.SphereGeometry(0.025, 8, 6),
    collar: new THREE.TorusGeometry(0.075, 0.016, 6, 16),
    cuff: new THREE.TorusGeometry(0.058, 0.012, 5, 12),
    band: new THREE.TorusGeometry(0.064, 0.014, 5, 12),
    number: new THREE.PlaneGeometry(0.26, 0.26),
  };
}

const MATS = new Map<string, THREE.Material>();
function mat(color: number, rough = 0.78): THREE.Material {
  const k = `${color}-${rough}`;
  let m = MATS.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough }); MATS.set(k, m); }
  return m;
}

function numberTexture(n: number, color: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.font = "bold 92px -apple-system, Helvetica, Arial, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Sylwetka zawodnika z anatomią (uda, łydki, kolana, łokcie) i strojem. Przód = +x. */
export function makePlayer(kit: Kit, variant = 0, stance: Figure["stance"] = "run"): Figure {
  const g = geo();
  const skin = SKINS[variant % SKINS.length]!, hair = HAIRS[(variant * 3 + 1) % HAIRS.length]!;
  const mesh = (geom: THREE.BufferGeometry, m: THREE.Material, shadow = false) => {
    const x = new THREE.Mesh(geom, m);
    x.castShadow = shadow;
    return x;
  };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // nogi: biodro -> udo -> kolano -> łydka (getr) -> but
  const legs = [-0.105, 0.105].map((z) => {
    const hip = new THREE.Group(); hip.position.set(0, HIP_H, z);
    const thigh = mesh(g.thigh, mat(skin), true); thigh.position.y = -THIGH / 2; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -THIGH; hip.add(knee);
    const shin = mesh(g.shin, mat(kit.socks), true); shin.position.y = -SHIN / 2; knee.add(shin);
    // opaska getra pod kolanem
    const band = mesh(g.band, mat(kit.collar ?? 0xffffff)); band.rotation.x = Math.PI / 2; band.position.y = -0.06; knee.add(band);
    // staw skokowy: but leży płasko na murawie, gdy stopa stoi
    const ankle = new THREE.Group(); ankle.position.y = -SHIN; knee.add(ankle);
    const boot = mesh(g.boot, mat(0x1d1d1f, 0.45)); ankle.add(boot);
    const sole = mesh(g.sole, mat(0xf2f2f2, 0.6)); sole.position.set(0.05, -0.0475, 0); ankle.add(sole);
    body.add(hip);
    return { hip, knee, ankle };
  });
  // wszystko powyżej bioder w grupie „upper” obracanej wokół stawu biodrowego
  const upper = new THREE.Group(); upper.position.y = HIP_H; body.add(upper);
  const up = (o: THREE.Object3D) => { o.position.y -= HIP_H; body.remove(o); upper.add(o); };

  const shorts = mesh(g.shorts, mat(kit.shorts), true); shorts.position.y = 0.8; shorts.scale.set(0.82, 1, 1.12); body.add(shorts);
  const torso = mesh(g.torso, mat(kit.jersey), true); torso.position.y = 0.98; torso.scale.set(0.8, 1, 1.22); body.add(torso);
  const collar = mesh(g.collar, mat(kit.collar ?? 0xffffff)); collar.rotation.x = Math.PI / 2; collar.position.y = 1.535; collar.scale.set(1, 1.2, 1); body.add(collar);
  const neck = mesh(g.neck, mat(skin)); neck.position.y = 1.58; body.add(neck);
  const head = mesh(g.head, mat(skin), true); head.position.y = 1.72; head.scale.set(1, 1.08, 0.95); body.add(head);
  const hairM = mesh(g.hair, mat(hair, 0.9)); hairM.position.set(-0.008, 1.735, 0); hairM.rotation.z = 0.25; body.add(hairM);
  for (const z of [-0.112, 0.112]) { const e = mesh(g.ear, mat(skin)); e.position.set(-0.01, 1.71, z); body.add(e); }

  // numer na plecach (kamera jest za zawodnikiem)
  if (kit.number !== undefined) {
    const num = new THREE.Mesh(g.number, new THREE.MeshBasicMaterial({ map: numberTexture(kit.number, "#ffffff"), transparent: true }));
    num.position.set(-0.184, 1.3, 0); num.rotation.y = -Math.PI / 2; body.add(num);
  }

  // ręce: bark -> rękaw + ramię -> łokieć -> przedramię -> dłoń (bramkarz: rękawice)
  const arms = [-0.265, 0.265].map((z) => {
    const sh = new THREE.Group(); sh.position.set(0, 1.47, z); sh.rotation.x = z < 0 ? 0.1 : -0.1;
    const sleeve = mesh(g.sleeve, mat(kit.jersey)); sleeve.position.y = -0.09; sh.add(sleeve);
    if (!kit.keeper) { const cuff = mesh(g.cuff, mat(kit.collar ?? 0xffffff)); cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.17; sh.add(cuff); }
    const upper = mesh(g.upperArm, mat(kit.keeper ? kit.jersey : skin)); upper.position.y = -0.2; sh.add(upper);
    const el = new THREE.Group(); el.position.y = -0.31; sh.add(el);
    const fore = mesh(g.forearm, mat(kit.keeper ? kit.jersey : skin)); fore.position.y = -0.14; el.add(fore);
    const hand = mesh(kit.keeper ? g.glove : g.hand, mat(kit.keeper ? kit.gloves ?? 0xe9eef3 : skin)); hand.position.y = -0.3; el.add(hand);
    body.add(sh);
    return { sh, el };
  });

  for (const o of [...body.children]) if (o !== upper && !legs.some((l) => l.hip === o) && o !== shorts) up(o);

  return {
    root, body, upper, torso,
    hips: [legs[0]!.hip, legs[1]!.hip], knees: [legs[0]!.knee, legs[1]!.knee], ankles: [legs[0]!.ankle, legs[1]!.ankle],
    gait: { v: 0, run: 0, phase: variant * 0.37 },
    shoulders: [arms[0]!.sh, arms[1]!.sh], elbows: [arms[0]!.el, arms[1]!.el],
    phase: variant * 1.7, kick: 0, stance,
  };
}

const CROUCH: Record<Figure["stance"], number> = { run: 0.015, defend: 0.12, keeper: 0.17 };

/**
 * Animacja oparta na gait.ts: faza kroku z przebytej drogi, stopa podporowa przypięta do murawy (IK),
 * miednica z ułożenia nóg, pochylenie tylko tułowia, płynne przejście bieg ↔ postawa.
 */
export function animateFigure(f: Figure, speed: number, dt: number, facing: number) {
  const pose = stepGait(f.gait, Math.min(12, speed), dt, CROUCH[f.stance]);
  const run = f.gait.run;
  for (const j of [0, 1] as const) {
    f.hips[j].rotation.z = pose.legs[j].thigh;
    f.knees[j].rotation.z = pose.legs[j].knee;
    f.ankles[j].rotation.z = pose.legs[j].ankle;
  }
  f.body.position.y = pose.pelvisY - HIP_H;
  const idleLean = f.stance === "defend" ? 0.12 : f.stance === "keeper" ? 0.22 : 0.02;
  f.upper.rotation.z = -(pose.lean + idleLean * (1 - run));
  // ręce: w biegu praca przeciwna do nóg; w postawie bramkarz trzyma ręce przed sobą
  const restArm = f.stance === "keeper" ? 0.9 : 0.1;
  f.shoulders[0].rotation.z = pose.arms[0] + restArm * (1 - run);
  f.shoulders[1].rotation.z = pose.arms[1] + restArm * (1 - run);
  f.elbows[0].rotation.z = f.elbows[1].rotation.z = pose.elbow + (f.stance === "keeper" ? 0.35 : 0) * (1 - run);
  // oddech w miejscu
  f.phase += dt * 1.6;
  f.torso.scale.y = 1 + Math.sin(f.phase) * 0.012 * (1 - run);

  // kopnięcie (podanie / strzał): prawa noga wymach do przodu – do przebudowy w kolejnym kroku
  if (f.kick > 0) {
    f.kick = Math.max(0, f.kick - dt);
    const t = 1 - f.kick / 0.35;
    const swing = Math.sin(Math.min(1, t) * Math.PI);
    f.hips[1].rotation.z = -0.5 + swing * 1.6;
    f.knees[1].rotation.z = -1.1 + swing * 1.05;
    f.shoulders[0].rotation.z = swing * 0.8;
  }

  // płynny obrót w stronę ruchu
  let d = facing - f.root.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  f.root.rotation.y += d * Math.min(1, dt * 9);
}

/** Piłka z klasycznym wzorem łat. */
export function makeBall(): THREE.Mesh {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 256, 128);
  g.fillStyle = "#1d1d1f";
  for (let i = 0; i < 12; i++) {
    const x = (i % 6) * 44 + (i < 6 ? 10 : 32), y = i < 6 ? 34 : 92;
    g.beginPath();
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; g.lineTo(x + Math.cos(a) * 11, y + Math.sin(a) * 11); }
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 }));
  ball.castShadow = true;
  return ball;
}

/** Kąt obrotu (wokół osi Y) dla zwrotu w kierunku (dx, dz) przy przodzie +x. */
export const headingOf = (dx: number, dz: number) => Math.atan2(-dz, dx);
