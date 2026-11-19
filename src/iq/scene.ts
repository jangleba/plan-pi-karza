import * as THREE from "three";

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
  gr.addColorStop(0, "#cfe3f7"); gr.addColorStop(0.7, "#eef5fc"); gr.addColorStop(1, "#f7f9fb");
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
  legs: [THREE.Group, THREE.Group];
  arms: [THREE.Group, THREE.Group];
  phase: number;
}

/** Sylwetka zawodnika: nogi, spodenki, koszulka, ręce, głowa. Przód = +x. */
export function makePlayer(jersey: number, shorts = 0xffffff, skin = 0xd9a77c): Figure {
  const std = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 });
  const root = new THREE.Group();
  const limb = (len: number, r: number, color: number, y: number, z: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, y, z);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), std(color));
    m.position.y = -len / 2 - r; m.castShadow = true;
    pivot.add(m);
    root.add(pivot);
    return pivot;
  };
  const legs: [THREE.Group, THREE.Group] = [limb(0.62, 0.1, skin, 0.86, -0.12), limb(0.62, 0.1, skin, 0.86, 0.12)];
  const shortsM = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.25, 0.3, 14), std(shorts));
  shortsM.position.y = 0.88; shortsM.castShadow = true; root.add(shortsM);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.42, 4, 14), std(jersey));
  torso.position.y = 1.28; torso.scale.set(0.85, 1, 1.1); torso.castShadow = true; root.add(torso);
  const arms: [THREE.Group, THREE.Group] = [limb(0.46, 0.065, jersey, 1.5, -0.32), limb(0.46, 0.065, jersey, 1.5, 0.32)];
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), std(skin));
  head.position.y = 1.8; head.castShadow = true; root.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x2b2118));
  hair.position.y = 1.81; root.add(hair);
  return { root, legs, arms, phase: Math.random() * 6 };
}

/** Animacja biegu: wymach nóg i rąk proporcjonalny do prędkości. */
export function animateFigure(f: Figure, speed: number, dt: number, facing: number) {
  const k = Math.min(1, speed / 6);
  f.phase += dt * (4 + speed * 1.6);
  const s = Math.sin(f.phase) * 0.75 * k;
  f.legs[0].rotation.z = s; f.legs[1].rotation.z = -s;
  f.arms[0].rotation.z = -s * 0.8; f.arms[1].rotation.z = s * 0.8;
  f.root.position.y = Math.abs(Math.sin(f.phase)) * 0.05 * k;
  // płynny obrót w stronę ruchu
  let d = facing - f.root.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  f.root.rotation.y += d * Math.min(1, dt * 10);
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
