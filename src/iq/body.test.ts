import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildBody } from "./body";

async function setup() {
  const buf = readFileSync("public/iq/player.glb");
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const gltf = await new Promise<{ scene: THREE.Group }>((res, rej) => new GLTFLoader().parse(ab, "", res as never, rej));
  gltf.scene.updateMatrixWorld(true);
  let skinned: THREE.SkinnedMesh | null = null;
  gltf.scene.traverse((o) => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh && !skinned) skinned = m; });
  const bones = (skinned as unknown as THREE.SkinnedMesh).skeleton.bones;
  const joint = (n: string) => gltf.scene.getObjectByName(`mixamorig${n}`)!.getWorldPosition(new THREE.Vector3());
  const boneIndex = (n: string) => { const i = bones.findIndex((b) => b.name === n); if (i < 0) throw new Error(`brak kości ${n}`); return i; };
  return { joint, boneIndex, nBones: bones.length };
}

describe("własne ciało zawodnika", () => {
  it("siatka jest poprawna: skończone wartości, indeksy kości, wagi sumują się do 1, jedna strefa stroju na wierzchołek", async () => {
    const s = await setup();
    for (const keeper of [false, true]) {
      const g = buildBody(s.joint, s.boneIndex, keeper);
      const pos = g.attributes.position!, si = g.attributes.skinIndex!, sw = g.attributes.skinWeight!, A = g.attributes.aPartA!, B = g.attributes.aPartB!;
      expect(pos.count).toBeGreaterThan(1500);
      expect(g.index!.count / 3, "trójkąty").toBeLessThan(9000);
      for (let i = 0; i < pos.count; i++) {
        expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i)), `poz ${i}`).toBe(true);
        let w = 0; for (let k = 0; k < 4; k++) { w += sw.getComponent(i, k); expect(si.getComponent(i, k)).toBeLessThan(s.nBones); }
        expect(w, `wagi ${i}`).toBeCloseTo(1, 4);
        expect(A.getX(i) + A.getY(i) + A.getZ(i) + B.getX(i) + B.getY(i) + B.getZ(i), `strefa ${i}`).toBe(1);
      }
      for (const v of g.attributes.normal!.array) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("wymiary: ok. 182 cm, stopy na murawie, ramiona rozstawione symetrycznie, głowa nad barkami", async () => {
    const s = await setup();
    const g = buildBody(s.joint, s.boneIndex, false);
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(b.min.y).toBeGreaterThan(-0.5);
    expect(b.min.y).toBeLessThan(0.5);
    expect(b.max.y).toBeGreaterThan(180);
    expect(b.max.y).toBeLessThan(184);
    expect(Math.abs(b.min.x + b.max.x)).toBeLessThan(1.5); // symetria lewo/prawo
    expect(b.max.x).toBeGreaterThan(85); // T-pose: dłonie daleko od tułowia
  });

  it("strefy stroju: spodenki, koszulka, getry i buty występują; bramkarz ma rękawice i koszulkę na przedramionach", async () => {
    const s = await setup();
    const count = (keeper: boolean) => {
      const g = buildBody(s.joint, s.boneIndex, keeper);
      const c = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < g.attributes.position!.count; i++) {
        const a = g.attributes.aPartA!, bb = g.attributes.aPartB!;
        const parts = [a.getX(i), a.getY(i), a.getZ(i), bb.getX(i), bb.getY(i), bb.getZ(i)];
        c[parts.indexOf(1)]!++;
      }
      return c;
    };
    const field = count(false), gk = count(true);
    for (let p = 0; p < 5; p++) expect(field[p], `strefa ${p}`).toBeGreaterThan(30);
    expect(field[5]).toBe(0);
    expect(gk[5]).toBeGreaterThan(30);
    expect(gk[1]!).toBeGreaterThan(field[1]!); // dłuższe rękawy
  });

  it("poprawne zwroty trójkątów: normalne na zewnątrz ciała (średnio od osi pionowej)", async () => {
    const s = await setup();
    const g = buildBody(s.joint, s.boneIndex, false);
    const pos = g.attributes.position!, nor = g.attributes.normal!;
    // dla tułowia (|y| 105–140) normalna ma wskazywać od osi ciała
    let ok = 0, tot = 0;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), x = pos.getX(i), z = pos.getZ(i);
      if (y < 108 || y > 140 || Math.abs(x) > 14 || Math.abs(x) < 6) continue;
      tot++; if (nor.getX(i) * x + nor.getZ(i) * z > 0) ok++;
    }
    expect(tot).toBeGreaterThan(50);
    expect(ok / tot).toBeGreaterThan(0.97);
  });
});
