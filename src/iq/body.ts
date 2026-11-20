import * as THREE from "three";

/**
 * Własne ciało zawodnika, budowane od zera jako jedna ciągła, rzeźbiona powierzchnia (pole odległości + siatka „surface nets”),
 * oskórowana na szkielet Mixamo z `public/iq/player.glb`. Zastępuje manekina Beta i wcześniejsze „rury”.
 *
 * Budowa: ciało to suma elips i stożków o proporcjach sportowca (klatka, talia, pośladki, czworogłowy, łydki, mięśnie ramion,
 * barki, głowa z żuchwą, nosem i uszami) łączonych gładko, więc nie ma szwów ani przecięć. Strój to „napompowane” warstwy
 * (luźniejsze spodenki i koszulka, getry), a kolor strefy (skóra, koszulka, spodenki, getry, buty, rękawice) wynika z najbliższego elementu.
 * Normalne pochodzą z gradientu pola (idealnie gładkie), a przy zagłębieniach (pachy, krocze, pod brodą) jest wypalone zaciemnienie.
 * Wagi kości: z bliskości elementów, z płynnym przejściem przy stawach.
 *
 * Układ jak w pozie bazowej szkieletu: T-pose, centymetry, przód +Z, lewa strona +X, pion +Y, postać ok. 182 cm.
 */
export const PART = { skin: 0, jersey: 1, shorts: 2, socks: 3, boots: 4, gloves: 5 } as const;
type PartId = (typeof PART)[keyof typeof PART];
type W = Array<[string, number]>;

/** Rozmiar komórki siatki (cm): kompromis szczegółowość / liczba trójkątów (ok. 10 tys. trójkątów na postać). */
const CELL = 2.3;

// ——— pola odległości ———

/** Odległość do stożka z zaokrąglonymi końcami (iq). */
function sdRoundCone(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r1: number, r2: number): number {
  const bax = bx - ax, bay = by - ay, baz = bz - az, l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const y = pax * bax + pay * bay + paz * baz, z = y - l2;
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz, y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

/** Przybliżona odległość do elipsoidy (iq). */
function sdEllipsoid(px: number, py: number, pz: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): number {
  const x = px - cx, y = py - cy, z = pz - cz;
  const k0 = Math.sqrt((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2);
  const k1 = Math.sqrt((x / (rx * rx)) ** 2 + (y / (ry * ry)) ** 2 + (z / (rz * rz)) ** 2);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

const smin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

type Group = 0 | 1 | 2 | 3 | 4 | 5; // 0 tułów, 1 lewe ramię, 2 prawe ramię, 3 lewa noga, 4 prawa noga, 5 głowa
const GROUP_K = [4.2, 2.0, 2.0, 2.0, 2.0, 2.2];
const LIMB_K = 1.6; // gładkość połączenia kończyny z tułowiem (mała: ramię przy ciele nie ma się zrastać z żebrami)

interface Prim {
  group: Group; part: PartId; infl: number;
  dist: (x: number, y: number, z: number) => number;
  /** Oś odniesienia dla parametru t wag (od a do b). */
  ref?: [THREE.Vector3, THREE.Vector3];
  weights: (t: number, y: number, z: number) => W;
  box: [number, number, number, number, number, number];
}

/** Opis ciała jako zbiór elementów; wszystkie wymiary w cm. */
function buildPrims(J: (n: string) => THREE.Vector3, keeper: boolean, th: number): Prim[] {
  const P: Prim[] = [];
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const lerp = (a: THREE.Vector3, b: THREE.Vector3, t: number) => a.clone().lerp(b, t);
  const margin = 7;

  const ell = (group: Group, part: PartId, infl: number, c: THREE.Vector3, r: [number, number, number], weights: Prim["weights"], ref?: [THREE.Vector3, THREE.Vector3]) =>
    P.push({
      group, part, infl, weights, ref, dist: (x, y, z) => sdEllipsoid(x, y, z, c.x, c.y, c.z, r[0], r[1], r[2]),
      box: [c.x - r[0] - infl - margin, c.y - r[1] - infl - margin, c.z - r[2] - infl - margin, c.x + r[0] + infl + margin, c.y + r[1] + infl + margin, c.z + r[2] + infl + margin],
    });
  const cone = (group: Group, part: PartId, infl: number, a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, weights: Prim["weights"]) =>
    P.push({
      group, part, infl, weights, ref: [a, b], dist: (x, y, z) => sdRoundCone(x, y, z, a.x, a.y, a.z, b.x, b.y, b.z, ra, rb),
      box: [Math.min(a.x, b.x) - Math.max(ra, rb) - infl - margin, Math.min(a.y, b.y) - Math.max(ra, rb) - infl - margin, Math.min(a.z, b.z) - Math.max(ra, rb) - infl - margin,
        Math.max(a.x, b.x) + Math.max(ra, rb) + infl + margin, Math.max(a.y, b.y) + Math.max(ra, rb) + infl + margin, Math.max(a.z, b.z) + Math.max(ra, rb) + infl + margin],
    });
  const mix = (a: string, b: string, t: number): W => [[a, 1 - t], [b, t]];

  // ——— tułów: wagi po wysokości (Hips → Spine → Spine1 → Spine2 → Neck) ———
  const torsoW = (_t: number, y: number): W => {
    const a = [["Hips", 104.3], ["Spine", 114.5], ["Spine1", 124.4], ["Spine2", 133.6]] as const;
    if (y <= a[0][1]) return [["Hips", 1]];
    if (y >= a[3][1]) return y > 146 ? mix("Spine2", "Neck", Math.min(1, (y - 146) / 6)) : [["Spine2", 1]];
    for (let i = 1; i < 4; i++) if (y <= a[i]![1]) return mix(a[i - 1]![0], a[i]![0], (y - a[i - 1]![1]) / (a[i]![1] - a[i - 1]![1]));
    return [["Spine2", 1]];
  };
  ell(0, PART.shorts, 1.0, V(0, 99.5, 0.0), [13.2 * th, 10.6, 11.2 * th], torsoW);               // miednica
  ell(0, PART.jersey, 0.6, V(0, 104.4, 0.6), [12.8 * th, 3.0, 11.0 * th], torsoW);              // dół koszulki nad spodenkami
  ell(0, PART.jersey, 0.8, V(0, 113, 1.4), [12.6 * th, 9.8, 11.2 * th], torsoW);                 // talia
  ell(0, PART.jersey, 0.8, V(0, 129.5, 0.8), [15.6 * th, 12.6, 13.6 * th], torsoW);             // klatka piersiowa (szeroka: sylwetka V)
  ell(0, PART.jersey, 0.8, V(0, 142.6, -2.4), [16.6 * th, 6.2, 9.8], torsoW);                   // kapturowy i górna część pleców
  for (const s of [1, -1]) ell(0, PART.jersey, 0.5, V(s * 6.8, 134.0, 3.6), [7.0, 4.2, 3.4], torsoW); // mostek: tylko lekkie zarysowanie mięśni piersiowych
  cone(0, PART.jersey, 0.5, V(0, 148.0, -3.2), V(0, 150.6, -3.0), 7.1, 6.7, () => [["Neck", 1]]); // kołnierz
  cone(0, PART.skin, 0, V(0, 150.0, -3.1), V(0, 160.0, -1.7), 6.4, 5.6, (_t, y) => (y < 154 ? [["Neck", 1]] : mix("Neck", "Head", Math.min(1, (y - 154) / 8)))); // szyja

  // ——— głowa ———
  const H: W = [["Head", 1]];
  const hw = () => H;
  ell(5, PART.skin, 0, V(0, 172.2, 0.8), [9.0, 11.0, 10.0], hw);   // czaszka
  ell(5, PART.skin, 0, V(0, 166.0, 3.4), [7.6, 8.4, 7.4], hw);    // policzki i żuchwa
  ell(5, PART.skin, 0, V(0, 161.0, 4.8), [4.4, 3.4, 4.6], hw);    // broda
  ell(5, PART.skin, 0, V(0, 167.8, 10.8), [1.7, 2.6, 2.0], hw);   // nos
  ell(5, PART.skin, 0, V(0, 174.5, 8.4), [6.0, 1.4, 2.2], hw);    // łuki brwiowe
  for (const s of [1, -1]) ell(5, PART.skin, 0, V(s * 8.1, 171.4, 0.2), [1.1, 2.8, 1.9], hw); // uszy

  // ——— ramiona (oś X) ———
  for (const S of ["Left", "Right"] as const) {
    const sg = S === "Left" ? 1 : -1, g: Group = S === "Left" ? 1 : 2;
    const sh = J(`${S}Arm`), el = J(`${S}ForeArm`), wr = J(`${S}Hand`), tip = J(`${S}HandMiddle4`);
    const upW = (t: number): W => (t < 0.2 ? [[`${S}Arm`, 0.75 + 1.25 * t], ["Spine2", 0.25 - 1.25 * t]] : t < 0.8 ? [[`${S}Arm`, 1]] : mix(`${S}Arm`, `${S}ForeArm`, ((t - 0.8) / 0.2) * 0.5));
    const foW = (t: number): W => (t < 0.2 ? mix(`${S}Arm`, `${S}ForeArm`, 0.5 + 2.5 * t) : t < 0.85 ? [[`${S}ForeArm`, 1]] : mix(`${S}ForeArm`, `${S}Hand`, ((t - 0.85) / 0.15) * 0.5));
    const ARM: [THREE.Vector3, THREE.Vector3] = [sh, el], FORE: [THREE.Vector3, THREE.Vector3] = [el, wr];
    const hand: W = [[`${S}Hand`, 1]];

    ell(g, PART.jersey, 0.8, sh.clone().add(V(sg * 2.6, -0.3, 0.2)), [7.0 * th, 6.5 * th, 6.8 * th], () => [[`${S}Arm`, 1]]); // naramiennik
    const mid = lerp(sh, el, 0.6);
    cone(g, PART.jersey, 0.7, sh, mid, 6.0 * th, 5.2 * th, upW);            // rękaw
    cone(g, PART.skin, 0, mid, el, 5.0 * th, 4.4 * th, upW);
    ell(g, PART.jersey, 0.8, lerp(sh, el, 0.4).add(V(0, 0.4, 1.0)), [8.4, 5.8 * th, 5.9 * th], upW, ARM); // dwugłowy i trójgłowy
    cone(g, keeper ? PART.jersey : PART.skin, keeper ? 0.8 : 0, el, wr, 4.9 * th, 3.2 * th, foW);
    ell(g, keeper ? PART.jersey : PART.skin, keeper ? 0.8 : 0, lerp(el, wr, 0.28), [7.4, 5.0 * th, 4.9 * th], foW, FORE); // mięsień przedramienia
    const hp = keeper ? PART.gloves : PART.skin, hi = keeper ? 0.6 : 0;
    ell(g, hp, hi, lerp(wr, tip, 0.42), [8.2, 2.1, 4.3], () => hand);       // dłoń
    ell(g, hp, hi, lerp(wr, tip, 0.8), [4.6, 1.6, 3.2], () => hand);        // palce
    ell(g, hp, hi, wr.clone().add(V(sg * 5.4, -0.3, 4.0)), [3.5, 1.5, 1.5], () => hand); // kciuk
  }

  // ——— nogi (oś Y) ———
  for (const S of ["Left", "Right"] as const) {
    const sg = S === "Left" ? 1 : -1, g: Group = S === "Left" ? 3 : 4;
    const Hp = J(`${S}UpLeg`), K = J(`${S}Leg`), A = J(`${S}Foot`), T = J(`${S}ToeBase`);
    const THIGH: [THREE.Vector3, THREE.Vector3] = [Hp, K], SHIN: [THREE.Vector3, THREE.Vector3] = [K, A];
    const thW = (t: number): W => (t < 0.12 ? [[`${S}UpLeg`, 0.55], ["Hips", 0.45]] : t < 0.78 ? [[`${S}UpLeg`, 1]] : mix(`${S}UpLeg`, `${S}Leg`, ((t - 0.78) / 0.22) * 0.5));
    const shW = (t: number): W => (t < 0.2 ? [[`${S}UpLeg`, 0.45 * (1 - t / 0.2)], [`${S}Leg`, 1 - 0.45 * (1 - t / 0.2)]] : t < 0.85 ? [[`${S}Leg`, 1]] : mix(`${S}Leg`, `${S}Foot`, ((t - 0.85) / 0.15) * 0.5));
    
    ell(g, PART.shorts, 0.9, Hp.clone().add(V(sg * -1.2, 0.0, -4.6)), [7.2, 7.4, 5.6], () => [[`${S}UpLeg`, 0.4], ["Hips", 0.6]]); // pośladek (delikatny)
    const hem = lerp(Hp, K, 0.5);
    cone(g, PART.shorts, 1.1, Hp, hem, 7.4 * th, 6.6 * th, thW);                                  // nogawka spodenek
    cone(g, PART.skin, 0, hem, K, 6.6 * th, 5.5 * th, thW);                                       // udo pod spodenkami
    ell(g, PART.shorts, 1.1, lerp(Hp, K, 0.3).add(V(0, 0, 2.0)), [8.2 * th, 12.0, 8.0 * th], thW, THIGH); // czworogłowy
    ell(g, PART.shorts, 1.1, lerp(Hp, K, 0.32).add(V(0, 0, -2.6)), [7.6 * th, 11.0, 6.8 * th], thW, THIGH); // dwugłowy uda
    ell(g, PART.skin, 0, K.clone().add(V(0, -0.5, 2.2)), [5.5 * th, 5.4, 5.2 * th], shW, SHIN);           // kolano
    const sockEnd = lerp(K, A, 0.17);
    cone(g, PART.skin, 0, K, sockEnd, 5.3 * th, 5.4 * th, shW);
    cone(g, PART.socks, 0.5, sockEnd, A, 5.5 * th, 3.7 * th, shW);                                  // goleń w getrze
    ell(g, PART.socks, 0.5, lerp(K, A, 0.3).add(V(0, 0, -2.4)), [6.0 * th, 10.5, 6.3 * th], shW, SHIN);   // łydka
    // but: kostka, pięta, śródstopie, palce (waga ToeBase rośnie ku czubkowi)
    const bw = (_t: number, _y: number, z: number): W => mix(`${S}Foot`, `${S}ToeBase`, Math.min(1, Math.max(0, (z - (T.z - 5)) / 6)));
    ell(g, PART.boots, 0, V(A.x, A.y - 2.4, A.z + 0.2), [4.9, 6.2, 5.4], bw);
    ell(g, PART.boots, 0, V(A.x, 4.0, A.z - 3.8), [4.5, 4.3, 3.9], bw);
    ell(g, PART.boots, 0, V(A.x, 3.7, A.z + 7.6), [4.9, 3.9, 9.2], bw);
    ell(g, PART.boots, 0, V(A.x, 2.7, A.z + 19.2), [4.3, 2.7, 7.4], bw);
  }
  return P;
}

/**
 * Siatka ciała w pozie bazowej szkieletu.
 * @param joint pozycja kości w układzie szablonu (cm) po nazwie bez przedrostka `mixamorig` (np. „LeftUpLeg”)
 * @param boneIndex indeks kości w szkielecie po pełnej nazwie
 * @param keeper bramkarz: długie rękawy (koszulka na przedramionach) i rękawice
 * @param thick grubość kończyn i tułowia (budowa); głowa, dłonie i buty zostają bez zmian
 */
export function buildBody(joint: (name: string) => THREE.Vector3, boneIndex: (fullName: string) => number, keeper: boolean, thick = 1): THREE.BufferGeometry {
  const prims = buildPrims(joint, keeper, thick);
  const nGroups = 6;
  const g = new Float64Array(nGroups);

  /** Pole odległości całego ciała (ujemne wewnątrz). */
  const field = (x: number, y: number, z: number): number => {
    g.fill(1e9);
    for (const p of prims) {
      const b = p.box;
      if (x < b[0] || x > b[3] || y < b[1] || y > b[4] || z < b[2] || z > b[5]) continue;
      g[p.group] = smin(g[p.group]!, p.dist(x, y, z) - p.infl, GROUP_K[p.group]!);
    }
    let d = g[0]!;
    d = smin(d, g[5]!, 2.2);
    for (let i = 1; i <= 4; i++) d = i <= 2 ? smin(d, g[i]!, LIMB_K) : smin(d, g[i]!, 2.4);
    return Math.max(d, -y); // płaska podeszwa w y = 0
  };

  // siatka punktów pola
  const x0 = -97, y0 = -2, z0 = -22, x1 = 97, y1 = 186, z1 = 30;
  const nx = Math.ceil((x1 - x0) / CELL) + 1, ny = Math.ceil((y1 - y0) / CELL) + 1, nz = Math.ceil((z1 - z0) / CELL) + 1;
  const data = new Float32Array(nx * ny * nz);
  const id = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) data[id(i, j, k)] = field(x0 + i * CELL, y0 + j * CELL, z0 + k * CELL);

  // „surface nets”: jeden wierzchołek na komórkę przecinającą powierzchnię
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cellV = new Int32Array(cx * cy * cz).fill(-1);
  const verts: number[] = [];
  const cid = (i: number, j: number, k: number) => i + cx * (j + cy * k);
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]] as const;
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]] as const;
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const v = corner.map(([a, b, c]) => data[id(i + a, j + b, k + c)]!);
    const inside = v.filter((x) => x < 0).length;
    if (inside === 0 || inside === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      const va = v[a]!, vb = v[b]!;
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb), ca = corner[a]!, cb = corner[b]!;
      sx += ca[0] + (cb[0] - ca[0]) * t; sy += ca[1] + (cb[1] - ca[1]) * t; sz += ca[2] + (cb[2] - ca[2]) * t; n++;
    }
    cellV[cid(i, j, k)] = verts.length / 3;
    verts.push(x0 + (i + sx / n) * CELL, y0 + (j + sy / n) * CELL, z0 + (k + sz / n) * CELL);
  }

  // ściany: dla każdej krawędzi siatki ze zmianą znaku czworokąt z 4 sąsiednich komórek
  const tris: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) tris.push(a, c, b, a, d, c); else tris.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = data[id(i, j, k)]! < 0;
    if (i < nx - 1 && v0 !== data[id(i + 1, j, k)]! < 0) quad(cellV[cid(i, j - 1, k - 1)]!, cellV[cid(i, j, k - 1)]!, cellV[cid(i, j, k)]!, cellV[cid(i, j - 1, k)]!, v0);
    if (j < ny - 1 && v0 !== data[id(i, j + 1, k)]! < 0) quad(cellV[cid(i - 1, j, k - 1)]!, cellV[cid(i - 1, j, k)]!, cellV[cid(i, j, k)]!, cellV[cid(i, j, k - 1)]!, v0);
    if (k < nz - 1 && v0 !== data[id(i, j, k + 1)]! < 0) quad(cellV[cid(i - 1, j - 1, k)]!, cellV[cid(i, j - 1, k)]!, cellV[cid(i, j, k)]!, cellV[cid(i - 1, j, k)]!, v0);
  }

  // atrybuty wierzchołków: normalne z gradientu pola, strefa stroju, wagi kości, zaciemnienie przy zagłębieniach
  const n = verts.length / 3;
  const pos = new Float32Array(verts), nor = new Float32Array(n * 3), ao = new Float32Array(n);
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), pa = new Float32Array(n * 3), pb = new Float32Array(n * 3), bind = new Float32Array(n * 3);
  const Hj = joint("LeftUpLeg"), Kj = joint("LeftLeg"), Aj = joint("LeftFoot"), Sj = joint("LeftArm"), Ej = joint("LeftForeArm"), Wj = joint("LeftHand");
  const zones = { hemY: Hj.y + (Kj.y - Hj.y) * 0.5, sockY: Kj.y + (Aj.y - Kj.y) * 0.17, sleeveX: Sj.x + (Ej.x - Sj.x) * 0.6, elbowX: Ej.x, wristX: Wj.x };
  const h = 0.5, eye: Array<[number, number, number]> = [[3.4, 173.0, 9.9], [-3.4, 173.0, 9.9]];
  const boneId = (name: string) => boneIndex(`mixamorig${name}`);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3]!, y = pos[v * 3 + 1]!, z = pos[v * 3 + 2]!;
    let gx = field(x + h, y, z) - field(x - h, y, z), gy = field(x, y + h, z) - field(x, y - h, z), gz = field(x, y, z + h) - field(x, y, z - h);
    const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
    nor[v * 3] = gx; nor[v * 3 + 1] = gy; nor[v * 3 + 2] = gz;
    let occ = 0; const hs = [1.6, 3.4, 5.8], ws = [0.5, 0.3, 0.2];
    for (let i = 0; i < 3; i++) occ += ws[i]! * Math.min(1, Math.max(0, (hs[i]! - field(x + gx * hs[i]!, y + gy * hs[i]!, z + gz * hs[i]!)) / hs[i]!));
    ao[v] = 1 - 0.55 * occ;

    // najbliższy element (strefa) i wagi z elementów w pobliżu
    let best = 1e9, bestPart: PartId = PART.skin, bestGroup: Group = 0;
    const ds: number[] = new Array(prims.length);
    for (let i = 0; i < prims.length; i++) {
      const p = prims[i]!, b = p.box;
      if (x < b[0] || x > b[3] || y < b[1] || y > b[4] || z < b[2] || z > b[5]) { ds[i] = 1e9; continue; }
      const d = p.dist(x, y, z) - p.infl;
      ds[i] = d;
      if (d < best) { best = d; bestPart = p.part; bestGroup = p.group; }
    }
    const acc = new Map<string, number>();
    for (let i = 0; i < prims.length; i++) {
      const dd = ds[i]! - best;
      if (dd > 3.2) continue;
      const p = prims[i]!, wgt = Math.exp(-dd / 1.1);
      let t = 0;
      if (p.ref) { const a = p.ref[0], b = p.ref[1], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l2 = dx * dx + dy * dy + dz * dz || 1; t = Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / l2)); }
      for (const [bn, bw] of p.weights(t, y, z)) acc.set(bn, (acc.get(bn) ?? 0) + wgt * bw);
    }
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((s, e) => s + e[1], 0) || 1;
    for (let k = 0; k < 4; k++) { const e = top[k]; si[v * 4 + k] = e ? boneId(e[0]) : 0; sw[v * 4 + k] = e ? e[1] / sum : 0; }
    // oczy: ciemne plamki na twarzy (strefa „rękawice” ma dla zawodników z pola ciemny kolor)
    let part: PartId = bestPart;
    // tryb strefy dla shadera (granice stroju równe w każdym pikselu, a nie postrzępione po trójkątach):
    // 1 = talia (spodenki / koszulka po wysokości), 2 = noga (spodenki / skóra / getry po wysokości), 3 = ramię (rękaw / skóra po osi X)
    let mode = 0;
    if (bestGroup === 0 && y >= 146.5 && (part === PART.jersey || part === PART.skin)) mode = 4; // kołnierz / szyja
    else if ((bestGroup === 0 || ((bestGroup === 3 || bestGroup === 4) && y >= 96)) && (part === PART.jersey || part === PART.shorts) && y < 112) mode = 1; // także górna część pośladków i bioder
    else if ((bestGroup === 3 || bestGroup === 4) && (part === PART.shorts || part === PART.skin || part === PART.socks)) mode = 2;
    else if ((bestGroup === 1 || bestGroup === 2) && (part === PART.jersey || part === PART.skin)) mode = 3;
    bind[v * 3] = y; bind[v * 3 + 1] = mode; bind[v * 3 + 2] = Math.abs(x);
    for (const e of eye) if (Math.hypot(x - e[0], y - e[1], z - e[2]) < 1.15 && z > 8) part = PART.gloves;
    (part < 3 ? pa : pb)[v * 3 + (part % 3)] = 1;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geo.setAttribute("skinIndex", new THREE.BufferAttribute(si, 4));
  geo.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
  geo.setAttribute("aPartA", new THREE.BufferAttribute(pa, 3));
  geo.setAttribute("aPartB", new THREE.BufferAttribute(pb, 3));
  geo.setAttribute("aBind", new THREE.BufferAttribute(bind, 3)); // (wysokość, tryb strefy, |x|) w pozie bazowej
  geo.setAttribute("aAo", new THREE.BufferAttribute(ao, 1));
  // zwrot trójkątów względem normalnych z pola
  const idx = new Uint32Array(tris.length);
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t]!, b = tris[t + 1]!, c = tris[t + 2]!;
    const ux = pos[b * 3]! - pos[a * 3]!, uy = pos[b * 3 + 1]! - pos[a * 3 + 1]!, uz = pos[b * 3 + 2]! - pos[a * 3 + 2]!;
    const vx = pos[c * 3]! - pos[a * 3]!, vy = pos[c * 3 + 1]! - pos[a * 3 + 1]!, vz = pos[c * 3 + 2]! - pos[a * 3 + 2]!;
    const nxv = uy * vz - uz * vy, nyv = uz * vx - ux * vz, nzv = ux * vy - uy * vx;
    const dot = nxv * (nor[a * 3]! + nor[b * 3]! + nor[c * 3]!) + nyv * (nor[a * 3 + 1]! + nor[b * 3 + 1]! + nor[c * 3 + 1]!) + nzv * (nor[a * 3 + 2]! + nor[b * 3 + 2]! + nor[c * 3 + 2]!);
    if (dot >= 0) { idx[t] = a; idx[t + 1] = b; idx[t + 2] = c; } else { idx[t] = a; idx[t + 1] = c; idx[t + 2] = b; }
  }
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}
