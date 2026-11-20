import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CYCLE, NATIVE, clipTime, cycleRate, locomotion } from "./actorMath";

interface ClipJson { name: string; duration: number; tracks: Array<{ name: string; type: string; times: number[]; values: number[] }> }

async function setup() {
  const buf = readFileSync("public/iq/player.glb");
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((res, rej) => new GLTFLoader().parse(ab, "", res as never, rej));
  const wj = JSON.parse(readFileSync("public/iq/walking.json", "utf8")) as ClipJson;
  const t = wj.tracks.find((x) => x.name === "mixamorigHips.position")!; for (let i = 2; i < t.values.length; i += 3) t.values[i] = t.values[2]!;
  const walk = THREE.AnimationClip.parse({ name: wj.name, duration: wj.duration, tracks: wj.tracks, uuid: THREE.MathUtils.generateUUID() } as never);
  return { scene: gltf.scene, run: gltf.animations[0]!, walk };
}

type Setup = Awaited<ReturnType<typeof setup>>;
interface Drive { w: { walk: number; run: number }; tWalk: (k: number) => number; tRun: (k: number) => number; dt: number }

/**
 * Ślizganie stopy w podporze (cm/s): przy zmieszanej pozie palec w kontakcie z murawą (<6 cm) powinien cofać się względem bioder
 * z prędkością biegu; różnica to ślizganie. Próbkujemy dwa pełne cykle, obie stopy.
 */
function slip(a: Setup, v: number, mode: (v: number, k: number, dt: number) => Drive): number {
  const mixer = new THREE.AnimationMixer(a.scene);
  const aw = mixer.clipAction(a.walk), ar = mixer.clipAction(a.run);
  aw.play(); ar.play(); aw.paused = true; ar.paused = true;
  const dt = 1 / 120, N = 480;
  const err: number[] = [];
  for (const side of ["Left", "Right"] as const) {
    let prev: { z: number; low: boolean } | null = null;
    for (let k = 0; k < N; k++) {
      const d = mode(v, k, dt);
      aw.setEffectiveWeight(d.w.walk); ar.setEffectiveWeight(d.w.run);
      aw.time = d.tWalk(k); ar.time = d.tRun(k);
      mixer.update(0); a.scene.updateMatrixWorld(true);
      const toe = a.scene.getObjectByName(`mixamorig${side}ToeBase`)!.getWorldPosition(new THREE.Vector3());
      const hip = a.scene.getObjectByName("mixamorigHips")!.getWorldPosition(new THREE.Vector3());
      const cur = { z: toe.z - hip.z, low: toe.y < 6 };
      if (prev && prev.low && cur.low) err.push(Math.abs((cur.z - prev.z) / dt + v * 100));
      prev = cur;
    }
  }
  mixer.stopAllAction(); mixer.uncacheRoot(a.scene);
  return err.length ? err.reduce((s, x) => s + x, 0) / err.length : 0;
}

/** Stary sposób: niezależne zegary klipów, tempo = v / prędkość natywna w granicach (0,55–1,9 chód, 0,75–1,4 bieg). */
const oldMode = (v: number, k: number, dt: number): Drive => {
  const L = locomotion(v);
  const ws = Math.min(1.9, Math.max(0.55, v / NATIVE.walk)), rs = Math.min(1.4, Math.max(0.75, v / NATIVE.run));
  return { w: { walk: L.walk, run: L.run }, tWalk: (i) => (i * dt * ws) % CYCLE.walk.dur, tRun: (i) => (i * dt * rs) % CYCLE.run.dur, dt };
};
/** Nowy sposób: wspólna faza kroku. */
const newMode = (v: number, _k: number, dt: number): Drive => {
  const L = locomotion(v), f = cycleRate(v, L);
  return { w: { walk: L.walk, run: L.run }, tWalk: (i) => clipTime("walk", i * dt * f), tRun: (i) => clipTime("run", i * dt * f), dt };
};

describe("ślizganie stóp przy mieszaniu chodu i biegu (cm/s w podporze)", () => {
  const speeds = [1.0, 1.75, 2.4, 2.8, 3.2, 3.6, 4.2, 5.63, 6.5];
  it("wspólna faza kroku daje mniejsze ślizganie niż niezależne zegary", async () => {
    const a = await setup();
    const rows = speeds.map((v) => ({ v, old: slip(a, v, oldMode), now: slip(a, v, newMode) }));
    console.log("v | stare | nowe\n" + rows.map((r) => `${r.v.toFixed(2)} | ${r.old.toFixed(0)} | ${r.now.toFixed(0)}`).join("\n"));
    const sum = (k: "old" | "now") => rows.reduce((s, r) => s + r[k], 0);
    expect(sum("now")).toBeLessThan(sum("old"));
    for (const r of rows) expect(r.now, `v=${r.v}`).toBeLessThanOrEqual(r.old * 1.05 + 3);
  }, 120000);

  it("tempo kroku jest ciągłe w prędkości (bez skoków w miejscach przejść)", () => {
    let prev = cycleRate(0.5, locomotion(0.5));
    for (let v = 0.55; v <= 8; v += 0.05) {
      const r = cycleRate(v, locomotion(v));
      expect(Math.abs(r - prev), `v=${v.toFixed(2)}`).toBeLessThan(0.12);
      prev = r;
    }
  });
});
