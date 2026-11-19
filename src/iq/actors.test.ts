import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { NATIVE, PASS, locomotion, partOf } from "./actorMath";

interface ClipJson { name: string; duration: number; tracks: Array<{ name: string; type: string; times: number[]; values: number[] }> }
const json = (n: string) => JSON.parse(readFileSync(`public/iq/${n}.json`, "utf8")) as ClipJson;

async function setup() {
  const buf = readFileSync("public/iq/player.glb");
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((res, rej) => new GLTFLoader().parse(ab, "", res as never, rej));
  const inPlace = (c: ClipJson) => { const t = c.tracks.find((x) => x.name === "mixamorigHips.position")!; for (let i = 2; i < t.values.length; i += 3) t.values[i] = t.values[2]!; return c; };
  const mk = (c: ClipJson) => THREE.AnimationClip.parse({ name: c.name, duration: c.duration, tracks: c.tracks, uuid: THREE.MathUtils.generateUUID(), blendMode: THREE.NormalAnimationBlendMode } as THREE.AnimationClipJSON);
  return { scene: gltf.scene, run: gltf.animations[0]!, idle: mk(json("idle")), walk: mk(inPlace(json("walking"))), pass: mk(json("soccer-pass")) };
}

/** Prędkość podłoża klipu (cm/s): gdy palce są nisko, stopa cofa się względem bioder. */
function groundSpeed(scene: THREE.Group, clip: THREE.AnimationClip): number {
  const mixer = new THREE.AnimationMixer(scene);
  const act = mixer.clipAction(clip); act.play();
  const N = Math.round(clip.duration * 120);
  const pts: Array<{ t: number; toe: THREE.Vector3; hips: THREE.Vector3 }> = [];
  for (let side of ["Left", "Right"] as const) {
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * clip.duration;
      mixer.setTime(t); scene.updateMatrixWorld(true);
      pts.push({ t, toe: scene.getObjectByName(`mixamorig${side}ToeBase`)!.getWorldPosition(new THREE.Vector3()), hips: scene.getObjectByName("mixamorigHips")!.getWorldPosition(new THREE.Vector3()) });
    }
  }
  const sp: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    if (b.t <= a.t) continue; // granica między nogami
    if (a.toe.y < 6 && b.toe.y < 6) sp.push(-(((b.toe.z - b.hips.z) - (a.toe.z - a.hips.z)) / (b.t - a.t)));
  }
  act.stop(); mixer.uncacheAction(clip);
  sp.sort((x, y) => x - y);
  return sp[Math.floor(sp.length / 2)]!;
}

describe("aktorzy Mixamo – dane", () => {
  it("natywna prędkość biegu i chodu zgadza się ze stałymi w kodzie (±3%)", async () => {
    const a = await setup();
    expect(groundSpeed(a.scene, a.run) / 100).toBeCloseTo(NATIVE.run, 0);
    expect(Math.abs(groundSpeed(a.scene, a.run) / 100 / NATIVE.run - 1)).toBeLessThan(0.03);
    expect(Math.abs(groundSpeed(a.scene, a.walk) / 100 / NATIVE.walk - 1)).toBeLessThan(0.03);
  }, 60000);

  it("stopa w podporze stoi względem murawy po dopasowaniu tempa klipu (v = natywna × tempo)", async () => {
    const a = await setup();
    // dla biegu 6,5 m/s tempo klipu = v / natywna; prędkość podłoża klipu × tempo = v
    const v = 6.5, L = locomotion(v);
    const ground = (groundSpeed(a.scene, a.run) / 100) * L.runScale;
    expect(Math.abs(ground - v) / v).toBeLessThan(0.05);
  }, 60000);

  it("kopnięcie: kontakt prawą stopą w chwili największej prędkości do przodu, palce na wysokości piłki", async () => {
    const a = await setup();
    const mixer = new THREE.AnimationMixer(a.scene); const act = mixer.clipAction(a.pass); act.play();
    let best = { t: 0, v: -1, toe: new THREE.Vector3() }; let prev: THREE.Vector3 | null = null; let pt = 0;
    for (let i = 0; i <= 160; i++) {
      const t = (i / 160) * a.pass.duration; mixer.setTime(t); a.scene.updateMatrixWorld(true);
      const toe = a.scene.getObjectByName("mixamorigRightToeBase")!.getWorldPosition(new THREE.Vector3());
      if (prev) { const v = (toe.z - prev.z) / (t - pt); if (v > best.v) best = { t, v, toe: toe.clone() }; }
      prev = toe.clone(); pt = t;
    }
    expect(Math.abs(best.t - PASS.contact)).toBeLessThan(0.05);
    expect(Math.abs(best.toe.y - PASS.spotCm.y)).toBeLessThan(5);
    expect(Math.abs(best.toe.z - PASS.spotCm.z)).toBeLessThan(8);
    expect(best.v).toBeGreaterThan(700);
  }, 60000);

  it("model ma ok. 1,8 m wysokości i dwie siatki oskórowane tym samym szkieletem", async () => {
    const a = await setup();
    const box = new THREE.Box3().setFromObject(a.scene);
    expect(box.max.y - box.min.y).toBeGreaterThan(175);
    expect(box.max.y - box.min.y).toBeLessThan(186);
    let skinned = 0; a.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned++; });
    expect(skinned).toBe(2);
  }, 60000);
});

describe("mieszanie klipów wg prędkości", () => {
  it("stanie, chód, bieg: wagi sumują się do 1 i zmieniają płynnie", () => {
    let prev = locomotion(0);
    for (let v = 0; v <= 8; v += 0.05) {
      const L = locomotion(v);
      expect(L.idle + L.walk + L.run).toBeCloseTo(1, 6);
      expect(Math.abs(L.run - prev.run) + Math.abs(L.walk - prev.walk)).toBeLessThan(0.25);
      prev = L;
    }
    expect(locomotion(0).idle).toBe(1);
    expect(locomotion(1.5).walk).toBeGreaterThan(0.9);
    expect(locomotion(6).run).toBe(1);
  });
  it("tempo klipów rośnie z prędkością i jest ograniczone", () => {
    expect(locomotion(6.5).runScale).toBeCloseTo(6.5 / NATIVE.run, 5);
    expect(locomotion(0.3).walkScale).toBe(0.55);
    expect(locomotion(10).runScale).toBe(1.4);
  });
});

describe("części stroju", () => {
  const refs = { hip: 97.5, knee: 53.2 };
  it("głowa i dłonie to skóra (bramkarz: rękawice), korpus to koszulka, buty to buty", () => {
    expect(partOf("mixamorigHead", 170, refs)).toBe("skin");
    expect(partOf("mixamorigLeftHand", 144, refs)).toBe("skin");
    expect(partOf("mixamorigLeftHand_1", 144, refs, true)).toBe("gloves");
    expect(partOf("mixamorigSpine1", 125, refs)).toBe("jersey");
    expect(partOf("mixamorigRightFoot", 5, refs)).toBe("boots");
  });
  it("udo: u góry spodenki, niżej skóra; łydka: skóra przy kolanie, niżej getry", () => {
    expect(partOf("mixamorigLeftUpLeg", 92, refs)).toBe("shorts");
    expect(partOf("mixamorigLeftUpLeg", 60, refs)).toBe("skin");
    expect(partOf("mixamorigLeftLeg", 52, refs)).toBe("skin");
    expect(partOf("mixamorigLeftLeg", 30, refs)).toBe("socks");
  });
});
