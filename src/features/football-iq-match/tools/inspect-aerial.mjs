// Read-only inspection. This reports bone positions; it does not choose a
// contact frame, claim a forehead surface position, or enable any animation.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { AnimationMixer, Bone, Box3, LoopOnce, Vector3 } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

const [filename, frameText] = process.argv.slice(2);
if (!filename) {
  console.error(
    "Użycie: node src/features/football-iq-match/tools/inspect-aerial.mjs PLIK.fbx [KLATKA_KONTAKTU]",
  );
  process.exit(1);
}
const readModel = (file) => {
  const bytes = fs.readFileSync(file);
  return {
    bytes,
    model: new FBXLoader().parse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    ),
  };
};
const { bytes, model: source } = readModel(filename);
const { model: target } = readModel(new URL("../assets/running.fbx", import.meta.url));
const clip = source.animations.find((c) => c.duration > 0 && c.tracks.length > 0)?.clone();
if (!clip) throw new Error("Brak animacji w FBX.");
const bones = new Map();
target.traverse((o) => {
  if (o instanceof Bone && !bones.has(o.name)) bones.set(o.name, o);
});
const required = ["Hips", "Head", "Spine", "LeftUpLeg", "RightUpLeg"].map((n) => `mixamorig${n}`);
if (!required.every((name) => clip.tracks.some((track) => track.name === `${name}.quaternion`)))
  throw new Error("Sprawdź eksport z tego samego Y Bot.");
clip.tracks = clip.tracks.filter((track) =>
  bones.has(track.name.slice(0, track.name.lastIndexOf("."))),
);
const hips = clip.tracks.find((track) => track.name === "mixamorigHips.position");
if (!hips) throw new Error("Brak ścieżki pozycji bioder.");
const bind = bones.get("mixamorigHips").position;
const firstX = hips.values[0],
  firstY = hips.values[1],
  firstZ = hips.values[2];
const sourceBindY = source.getObjectByName("mixamorigHips")?.position.y ?? firstY;
for (let i = 0; i < hips.values.length; i += 3) {
  hips.values[i] = bind.x + hips.values[i] - firstX;
  hips.values[i + 1] = bind.y + hips.values[i + 1] - sourceBindY;
  hips.values[i + 2] = bind.z + hips.values[i + 2] - firstZ;
}
const bounds = new Box3().setFromObject(target),
  scale = 6.8 / (bounds.max.y - bounds.min.y);
target.scale.setScalar(scale);
target.position.y = -bounds.min.y * scale;
const mixer = new AnimationMixer(target),
  action = mixer.clipAction(clip).setLoop(LoopOnce, 1).play();
action.paused = true;
action.clampWhenFinished = true;
const count = Math.floor(clip.duration * 30 + 1e-4);
const selected = frameText === undefined ? undefined : Number(frameText);
if (selected !== undefined && (!Number.isInteger(selected) || selected < 0 || selected > count))
  throw new Error(`Klatka musi mieścić się w 0–${count}.`);
const samples = [];
for (let frame = 0; frame <= count; frame++) {
  action.time = Math.min(clip.duration - 1e-6, frame / 30);
  mixer.update(0);
  target.updateMatrixWorld(true);
  const sample = { frame, seconds: frame / 30 };
  for (const name of ["Hips", "Head", "RightToeBase", "LeftToeBase"]) {
    const bone = bones.get(`mixamorig${name}`);
    if (!bone) continue;
    const p = bone.getWorldPosition(new Vector3());
    sample[name] = { lateral: p.x, height: p.y, forward: p.z };
  }
  samples.push(sample);
}
console.log(
  JSON.stringify(
    {
      file: filename,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      durationSeconds: clip.duration,
      samplingFps: 30,
      trackCount: clip.tracks.length,
      note: "Pozycja kości Head nie wyznacza powierzchni czoła. Kontakt środka piłki wymaga kontroli wizualnej; skrypt nie aktywuje klipu.",
      selected: selected === undefined ? null : samples[selected],
      samples,
    },
    null,
    2,
  ),
);
mixer.stopAllAction();
mixer.uncacheRoot(target);
