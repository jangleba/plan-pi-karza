import * as THREE from "three";

/**
 * Własne ciało zawodnika generowane w kodzie (bez cudzych plików), oskórowane na szkielet Mixamo z `public/iq/player.glb`.
 * Zastępuje uniwersalny manekin (siatki Beta), który miał „bąble” w biodrach i łokciach oraz nienaturalne kształty.
 * Układ jak w pozie bazowej szkieletu: T-pose, centymetry, przód +Z, lewa strona +X, pion +Y, postać ok. 182 cm.
 *
 * Budowa: „loft” = pierścienie (elipsy) wzdłuż osi, łączone w rurę; wagi kości liczone po położeniu pierścienia, więc przy zgięciu
 * stawów skóra przechodzi płynnie. Strefy stroju (skóra, koszulka, spodenki, getry, buty, rękawice) są atrybutami wierzchołków
 * (te same co w shaderze stroju w actors.ts), granice stref to podwójne pierścienie, więc krawędzie są ostre i równe.
 */
export const PART = { skin: 0, jersey: 1, shorts: 2, socks: 3, boots: 4, gloves: 5 } as const;
type PartId = (typeof PART)[keyof typeof PART];
type W = Array<[string, number]>;

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const X = V3(1, 0, 0), Y = V3(0, 1, 0), Z = V3(0, 0, 1);

/** Interpolacja liniowa po tabeli [argument, wartość...]. */
function prof(table: number[][], t: number, col = 1): number {
  if (t <= table[0]![0]!) return table[0]![col]!;
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1]!, b = table[i]!;
    if (t <= b[0]!) return a[col]! + ((b[col]! - a[col]!) * (t - a[0]!)) / (b[0]! - a[0]! || 1);
  }
  return table[table.length - 1]![col]!;
}

interface Ring { c: THREE.Vector3; a: number; b: number; part: PartId; w: W }

class Builder {
  /** Mnożnik grubości kończyn i tułowia (budowa: smukła / atletyczna / mocna). */
  k = 1;
  pos: number[] = []; si: number[] = []; sw: number[] = []; pa: number[] = []; pb: number[] = []; bind: number[] = []; idx: number[] = [];
  constructor(private boneIndex: (n: string) => number) {}

  private vertex(p: THREE.Vector3, part: PartId, w: W): number {
    const n = this.pos.length / 3;
    this.pos.push(p.x, p.y, p.z);
    const top = [...w].sort((x, y) => y[1] - x[1]).slice(0, 4);
    const sum = top.reduce((s, e) => s + e[1], 0) || 1;
    for (let k = 0; k < 4; k++) { const e = top[k]; this.si.push(e ? this.boneIndex(e[0]) : 0); this.sw.push(e ? e[1] / sum : 0); }
    const A = [0, 0, 0], B = [0, 0, 0];
    (part < 3 ? A : B)[part % 3] = 1;
    this.pa.push(...A); this.pb.push(...B);
    this.bind.push(p.y, 0);
    return n;
  }

  /** Rura przez pierścienie; U i V to osie elipsy (a wzdłuż U, b wzdłuż V). Zamknięte końce opcjonalnie wachlarzem trójkątów. */
  loft(rings: Ring[], U: THREE.Vector3, V: THREE.Vector3, M: number, capStart = false, capEnd = false) {
    const first = this.pos.length / 3;
    const ids: number[][] = rings.map((r) => {
      const row: number[] = [];
      for (let k = 0; k < M; k++) {
        const th = (k / M) * Math.PI * 2;
        row.push(this.vertex(r.c.clone().addScaledVector(U, Math.cos(th) * r.a * this.k).addScaledVector(V, Math.sin(th) * r.b * this.k), r.part, r.w));
      }
      return row;
    });
    const tris: number[] = [];
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < M; k++) {
      const k2 = (k + 1) % M;
      tris.push(ids[i]![k]!, ids[i]![k2]!, ids[i + 1]![k2]!, ids[i]![k]!, ids[i + 1]![k2]!, ids[i + 1]![k]!);
    }
    // kierunek trójkątów: normalna ma patrzeć od osi na zewnątrz (sprawdzamy pierwszy czworokąt z niezerowym polem)
    const P = (i: number) => V3(this.pos[i * 3]!, this.pos[i * 3 + 1]!, this.pos[i * 3 + 2]!);
    let flip = false;
    for (let q = 0; q < tris.length; q += 3) {
      const a = P(tris[q]!), b = P(tris[q + 1]!), c = P(tris[q + 2]!);
      const n = b.clone().sub(a).cross(c.clone().sub(a));
      if (n.lengthSq() < 1e-8) continue;
      const ri = Math.min(rings.length - 1, Math.floor(q / (6 * M)));
      flip = n.dot(a.clone().sub(rings[ri]!.c)) < 0;
      break;
    }
    for (let q = 0; q < tris.length; q += 3) this.idx.push(tris[q]!, flip ? tris[q + 2]! : tris[q + 1]!, flip ? tris[q + 1]! : tris[q + 2]!);
    const cap = (ri: number, out: THREE.Vector3) => {
      const r = rings[ri]!, ctr = this.vertex(r.c, r.part, r.w);
      for (let k = 0; k < M; k++) {
        const a = ids[ri]![k]!, b = ids[ri]![(k + 1) % M]!;
        const n = P(a).sub(P(ctr)).cross(P(b).sub(P(ctr)));
        if (n.dot(out) >= 0) this.idx.push(ctr, a, b); else this.idx.push(ctr, b, a);
      }
    };
    if (capStart) cap(0, rings[0]!.c.clone().sub(rings[1]!.c).normalize());
    if (capEnd) cap(rings.length - 1, rings[rings.length - 1]!.c.clone().sub(rings[rings.length - 2]!.c).normalize());
    return first;
  }

  ellipsoid(c: THREE.Vector3, rx: number, ry: number, rz: number, part: PartId, w: W, steps = 8, M = 12) {
    const rings: Ring[] = [];
    for (let i = 0; i <= steps; i++) {
      const u = -1 + (2 * i) / steps, f = Math.sqrt(Math.max(0, 1 - u * u));
      rings.push({ c: c.clone().add(V3(0, u * ry, 0)), a: Math.max(rx * f, 0.001), b: Math.max(rz * f, 0.001), part, w });
    }
    this.loft(rings, X, Z, M);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(this.sw, 4));
    g.setAttribute("aPartA", new THREE.Float32BufferAttribute(this.pa, 3));
    g.setAttribute("aPartB", new THREE.Float32BufferAttribute(this.pb, 3));
    g.setAttribute("aBind", new THREE.Float32BufferAttribute(this.bind, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

/** Wagi dla punktu między dwiema kośćmi (t = 0 → pierwsza, 1 → druga). */
const mix2 = (a: string, b: string, t: number): W => [[a, 1 - t], [b, t]];

/**
 * Siatka ciała w pozie bazowej szkieletu.
 * @param joint pozycja kości w układzie szablonu (cm) po nazwie bez przedrostka `mixamorig` (np. „LeftUpLeg”)
 * @param boneIndex indeks kości w szkielecie po pełnej nazwie
 * @param keeper bramkarz: długie rękawy (koszulka na przedramionach) i rękawice
 * @param thick grubość kończyn i tułowia (budowa); głowa, dłonie i buty zostają bez zmian
 */
export function buildBody(joint: (name: string) => THREE.Vector3, boneIndex: (fullName: string) => number, keeper: boolean, thick = 1): THREE.BufferGeometry {
  const B = new Builder((n) => boneIndex(`mixamorig${n}`));
  const J = joint;

  // ——— nogi (po stronie lewej i prawej: pozycje biorą się z własnych stawów, więc lustro wynika ze szkieletu) ———
  for (const S of ["Left", "Right"] as const) {
    const H = J(`${S}UpLeg`), K = J(`${S}Leg`), A = J(`${S}Foot`), T = J(`${S}ToeBase`);
    const at = (p: THREE.Vector3, q: THREE.Vector3, t: number) => p.clone().lerp(q, t);

    // udo: u góry spodenki (z lekkim rąbkiem), od ok. 58% długości skóra
    const thighR = (t: number) => prof([[0, 9.4], [0.25, 9.5], [0.6, 8.0], [1, 6.0]], t);
    const thighW = (t: number): W => (t < 0.12 ? [[`${S}UpLeg`, 0.55], ["Hips", 0.45]] : t < 0.78 ? [[`${S}UpLeg`, 1]] : mix2(`${S}UpLeg`, `${S}Leg`, ((t - 0.78) / 0.22) * 0.5));
    const hem = 0.58;
    const thigh: Ring[] = [];
    for (const t of [0, 0.12, 0.3, 0.45, hem]) thigh.push({ c: at(H, K, t), a: thighR(t) + (t === hem ? 2.0 : 1.4), b: (thighR(t) + (t === hem ? 2.0 : 1.4)) * 1.04, part: PART.shorts, w: thighW(t) });
    for (const t of [hem, 0.72, 0.86, 1]) thigh.push({ c: at(H, K, t), a: thighR(t), b: thighR(t) * 1.04, part: PART.skin, w: thighW(t) });
    B.k = thick;
    B.loft(thigh, X, Z, 14, true);

    // goleń: skóra przy kolanie, od ok. 16% długości getry (z lekkim rąbkiem u góry), łydka lekko wypukła
    const shinR = (t: number) => prof([[0, 5.9], [0.15, 6.0], [0.3, 6.4], [0.55, 5.2], [1, 3.9]], t);
    const shinW = (t: number): W => (t < 0.2 ? [[`${S}UpLeg`, 0.45 * (1 - t / 0.2)], [`${S}Leg`, 1 - 0.45 * (1 - t / 0.2)]] : t < 0.85 ? [[`${S}Leg`, 1]] : mix2(`${S}Leg`, `${S}Foot`, ((t - 0.85) / 0.15) * 0.5));
    const sockT = 0.17;
    const shin: Ring[] = [];
    for (const t of [0, 0.1, sockT]) shin.push({ c: at(K, A, t), a: shinR(t), b: shinR(t) * 1.05, part: PART.skin, w: shinW(t) });
    for (const t of [sockT, 0.24, 0.4, 0.6, 0.8, 1]) shin.push({ c: at(K, A, t), a: shinR(t) + (t === sockT ? 0.9 : 0.55), b: (shinR(t) + (t === sockT ? 0.9 : 0.55)) * 1.05, part: PART.socks, w: shinW(t) });
    B.loft(shin, X, Z, 14);
    B.k = 1;

    // but: wzdłuż osi Z od pięty do czubka; wysokość cholewki ok. 10 cm (kostka na 8,7 cm)
    const boot = [[-5.8, 3.9, 3.6], [-3.3, 4.5, 4.9], [2.7, 4.8, 5.3], [10.7, 4.9, 3.9], [16.7, 4.5, 3.0], [22.2, 3.7, 2.3], [24.2, 1.6, 1.2]];
    const bootW = (z: number): W => { const t = Math.min(1, Math.max(0, (z - (T.z - 5)) / 6)); return mix2(`${S}Foot`, `${S}ToeBase`, t); };
    B.loft(boot.map(([dz, a, b]) => ({ c: V3(A.x, b!, A.z + dz!), a: a!, b: b!, part: PART.boots, w: bootW(A.z + dz!) })), X, Y, 14, true, true);
  }

  // ——— tułów: miednica, talia, klatka piersiowa, linia barków zbiegająca do szyi ———
  const spineZ = [[104.3, 1.6], [114.5, 1.7], [124.4, 0.2], [133.6, -1.2], [150.3, -3.2]];
  const zc = (y: number) => prof(spineZ, y) + 0.8;
  const torsoW = (y: number): W => {
    const a = [["Hips", 104.3], ["Spine", 114.5], ["Spine1", 124.4], ["Spine2", 133.6]] as const;
    if (y <= a[0][1]) return [["Hips", 1]];
    if (y >= a[3][1]) return y > 146 ? mix2("Spine2", "Neck", Math.min(1, (y - 146) / 6)) : [["Spine2", 1]];
    for (let i = 1; i < 4; i++) if (y <= a[i]![1]) return mix2(a[i - 1]![0], a[i]![0], (y - a[i - 1]![1]) / (a[i]![1] - a[i - 1]![1]));
    return [["Spine2", 1]];
  };
  const tr = (y: number, a: number, b: number, part: PartId): Ring => ({ c: V3(0, y, zc(y) + (y < 100 ? -0.6 : 0)), a, b, part, w: torsoW(y) });
  const torso: Ring[] = [
    tr(92, 14.6, 10.6, PART.shorts), tr(97, 15.6, 11.8, PART.shorts), tr(102, 15.2, 11.4, PART.shorts), tr(104.5, 15.2, 11.4, PART.shorts),
    tr(104.5, 15.7, 11.8, PART.jersey), tr(110, 13.6, 10.8, PART.jersey), tr(117, 13.0, 10.4, PART.jersey), tr(125, 14.4, 11.4, PART.jersey),
    tr(134, 15.4, 12.2, PART.jersey), tr(142, 15.6, 11.2, PART.jersey), tr(146, 12.4, 9.0, PART.jersey), tr(148.2, 9.2, 7.8, PART.jersey),
    tr(150, 6.6, 6.4, PART.jersey), tr(151.5, 6.1, 5.9, PART.jersey),
  ];
  B.k = thick;
  B.loft(torso, X, Z, 22, true);

  B.k = 1;
  // ——— szyja i głowa ———
  const neckC = (y: number) => V3(0, y, prof([[151.5, -3.2], [163, -1.9]], y));
  const neckW = (y: number): W => (y < 154 ? [["Neck", 1]] : mix2("Neck", "Head", Math.min(1, (y - 154) / 8)));
  B.loft([151.5, 156, 163].map((y) => ({ c: neckC(y), a: 5.6 - (y - 151.5) * 0.02, b: 5.4, part: PART.skin, w: neckW(y) })), X, Z, 14);

  const HEAD: W = [["Head", 1]];
  const headRings: Ring[] = [];
  const hc = V3(0, 171.6, 1.2), hr = { x: 8.5, y: 11.7, z: 9.8 };
  for (let i = 0; i <= 12; i++) {
    const u = -1 + (2 * i) / 12, f = Math.sqrt(Math.max(0, 1 - u * u));
    const jaw = u < 0 ? 0.74 + 0.26 * (u + 1) : 1;
    headRings.push({ c: V3(0, hc.y + u * hr.y, hc.z + (u < 0 ? -u * 0.9 : 0)), a: Math.max(hr.x * f * jaw, 0.001), b: Math.max(hr.z * f, 0.001), part: PART.skin, w: HEAD });
  }
  B.loft(headRings, X, Z, 18);
  for (const s of [1, -1]) {
    B.ellipsoid(V3(s * 8.4, 171.4, 0.4), 1.2, 2.8, 2.0, PART.skin, HEAD, 6, 10); // uszy
    B.ellipsoid(V3(s * 3.3, 173.8, 10.6), 1.0, 0.9, 0.7, PART.boots, HEAD, 4, 8); // oczy
  }
  B.ellipsoid(V3(0, 169.8, 11.1), 1.4, 2.3, 1.8, PART.skin, HEAD, 6, 10); // nos

  // ——— ramiona (oś X) ———
  for (const S of ["Left", "Right"] as const) {
    const sg = S === "Left" ? 1 : -1;
    const sh = J(`${S}Arm`), el = J(`${S}ForeArm`), wr = J(`${S}Hand`), tip = J(`${S}HandMiddle4`);
    const at = (p: THREE.Vector3, q: THREE.Vector3, t: number) => p.clone().lerp(q, t);
    const longSleeve = keeper;

    B.k = thick;
    B.ellipsoid(sh.clone().add(V3(sg * 0.4, -0.2, 0)), 5.5, 5.0, 5.5, PART.jersey, [[`${S}Arm`, 1]], 8, 14); // bark

    const armR = (t: number) => prof([[0, 5.2], [0.3, 4.9], [0.65, 4.4], [1, 3.9]], t);
    const armW = (t: number): W => (t < 0.2 ? [[`${S}Arm`, 0.75 + 1.25 * t], ["Spine2", 0.25 - 1.25 * t]] : t < 0.8 ? [[`${S}Arm`, 1]] : mix2(`${S}Arm`, `${S}ForeArm`, ((t - 0.8) / 0.2) * 0.5));
    const slv = 0.62, up: Ring[] = [];
    for (const t of [0, 0.2, 0.4, slv]) up.push({ c: at(sh, el, t), a: armR(t) + 0.5 + (t === slv ? 0.4 : 0), b: (armR(t) + 0.5 + (t === slv ? 0.4 : 0)) * 0.96, part: PART.jersey, w: armW(t) });
    for (const t of [slv, 0.8, 1]) up.push({ c: at(sh, el, t), a: armR(t), b: armR(t) * 0.96, part: PART.skin, w: armW(t) });
    B.loft(up, Y, Z, 12, true);

    const foreR = (t: number) => prof([[0, 4.1], [0.3, 3.8], [0.7, 3.2], [1, 2.8]], t);
    const foreW = (t: number): W => (t < 0.2 ? mix2(`${S}Arm`, `${S}ForeArm`, 0.5 + 2.5 * t) : t < 0.85 ? [[`${S}ForeArm`, 1]] : mix2(`${S}ForeArm`, `${S}Hand`, ((t - 0.85) / 0.15) * 0.5));
    B.loft([0, 0.3, 0.7, 1].map((t) => ({ c: at(el, wr, t), a: foreR(t) + (longSleeve ? 0.5 : 0), b: (foreR(t) + (longSleeve ? 0.5 : 0)) * 0.96, part: longSleeve ? PART.jersey : PART.skin, w: foreW(t) })), Y, Z, 12);

    B.k = 1;
    // dłoń: płaska „łopatka” (w T-pose dłonie są poziomo, dłoń szeroka w osi Z)
    const hand = [[0, 3.1, 2.4], [0.12, 4.4, 2.1], [0.35, 4.9, 2.1], [0.55, 4.3, 1.8], [0.8, 3.4, 1.5], [0.96, 2.4, 1.1], [1, 0.9, 0.7]];
    const gl = keeper ? 0.45 : 0, hp = keeper ? PART.gloves : PART.skin;
    B.loft(hand.map(([t, a, b]) => ({ c: at(wr, tip, t!), a: a! + gl, b: b! + gl, part: hp as PartId, w: [[`${S}Hand`, 1]] as W })), Z, Y, 10, true, true);
    // kciuk
    const th = wr.clone().add(V3(sg * 5.6, -0.2, 3.9));
    B.loft([0, 1, 2, 3, 4].map((i) => ({ c: th.clone().add(V3(sg * i * 1.5, 0, i * 0.5)), a: 1.5 - i * 0.2 + gl, b: 1.3 - i * 0.15 + gl, part: hp as PartId, w: [[`${S}Hand`, 1]] as W })), Z, Y, 8, true, true);
  }
  return B.geometry();
}
