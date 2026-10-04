import assert from "node:assert/strict";
import fs from "node:fs";
import { AnimationMixer, Vector3 } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

const bytes = fs.readFileSync(
  new URL("../src/features/football-iq-match/assets/running.fbx", import.meta.url),
);
const model = new FBXLoader().parse(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  "",
);
const clip = model.animations.find((item) => item.duration > 0 && item.tracks.length);
assert.ok(clip, "Missing running clip");
const left = model.getObjectByName("mixamorigLeftFoot");
const right = model.getObjectByName("mixamorigRightFoot");
assert.ok(left && right, "Both feet must be present");
const mixer = new AnimationMixer(model);
mixer.clipAction(clip).play();
const l = [],
  r = [];
for (let i = 0; i < 40; i++) {
  mixer.setTime((i * clip.duration) / 40);
  model.updateMatrixWorld(true);
  l.push(left.getWorldPosition(new Vector3()).z);
  r.push(right.getWorldPosition(new Vector3()).z);
}
const mean = (values) => values.reduce((sum, n) => sum + n, 0) / values.length;
const lm = mean(l),
  rm = mean(r);
const correlation =
  l.reduce((sum, n, i) => sum + (n - lm) * (r[i] - rm), 0) /
  Math.sqrt(
    l.reduce((sum, n) => sum + (n - lm) ** 2, 0) * r.reduce((sum, n) => sum + (n - rm) ** 2, 0),
  );
assert.ok(correlation < -0.75, `Feet are not alternating: correlation ${correlation}`);
let worstSeam = 0;
for (const track of clip.tracks) {
  const size = track.getValueSize();
  if (track.name.endsWith(".quaternion")) {
    const a = Array.from(track.values.slice(0, size));
    const b = Array.from(track.values.slice(-size));
    const dot = Math.abs(a.reduce((sum, n, i) => sum + n * b[i], 0));
    worstSeam = Math.max(worstSeam, 2 * Math.acos(Math.min(1, dot)));
  }
}
assert.ok(worstSeam < 0.02, `Loop seam is discontinuous: ${worstSeam} rad`);
const copied = clone(model);
assert.notEqual(copied.getObjectByName("mixamorigLeftFoot"), left, "Clones must own their bones");
const passBytes = fs.readFileSync(
  new URL("../src/features/football-iq-match/assets/soccer-pass.fbx", import.meta.url),
);
const passModel = new FBXLoader().parse(
  passBytes.buffer.slice(passBytes.byteOffset, passBytes.byteOffset + passBytes.byteLength),
  "",
);
const passClip = passModel.animations.find((item) => item.duration > 0 && item.tracks.length);
assert.ok(passClip, "Missing Soccer Pass clip");
assert.ok(Math.abs(passClip.duration - 1.6) < 0.00001, "Unexpected Soccer Pass timing");
const passRight = passModel.getObjectByName("mixamorigRightFoot");
const passLeft = passModel.getObjectByName("mixamorigLeftFoot");
assert.ok(passRight && passLeft, "Both pass feet must be present");
const passMixer = new AnimationMixer(passModel);
passMixer.clipAction(passClip).play();
passMixer.setTime(0);
passModel.updateMatrixWorld(true);
const initialRight = passRight.getWorldPosition(new Vector3());
passMixer.setTime(0.6);
passModel.updateMatrixWorld(true);
const raisedRight = passRight.getWorldPosition(new Vector3());
const supportingLeft = passLeft.getWorldPosition(new Vector3());
assert.ok(
  raisedRight.y > supportingLeft.y + 40,
  "Right foot must follow through above the supporting foot",
);
assert.ok(raisedRight.z > initialRight.z + 60, "Right foot must swing forwards");
const idleBytes = fs.readFileSync(
  new URL("../src/features/football-iq-match/assets/idle.fbx", import.meta.url),
);
const idleModel = new FBXLoader().parse(
  idleBytes.buffer.slice(idleBytes.byteOffset, idleBytes.byteOffset + idleBytes.byteLength),
  "",
);
const idleClip = idleModel.animations.find((item) => item.duration > 0 && item.tracks.length);
assert.ok(idleClip, "Missing Idle clip");
const idleMixer = new AnimationMixer(idleModel);
idleMixer.clipAction(idleClip).play();
idleMixer.setTime(0);
idleModel.updateMatrixWorld(true);
const hand = idleModel.getObjectByName("mixamorigRightHand");
assert.ok(hand, "Idle must include the full body");
const handStart = hand.getWorldPosition(new Vector3());
idleMixer.setTime(0.8);
idleModel.updateMatrixWorld(true);
assert.ok(hand.getWorldPosition(new Vector3()).distanceTo(handStart) > 0.5, "Idle is static");
let idleSeam = 0;
for (const track of idleClip.tracks) {
  if (!track.name.endsWith(".quaternion")) continue;
  const a = Array.from(track.values.slice(0, 4));
  const b = Array.from(track.values.slice(-4));
  const dot = Math.abs(a.reduce((sum, n, i) => sum + n * b[i], 0));
  idleSeam = Math.max(idleSeam, 2 * Math.acos(Math.min(1, dot)));
}
assert.ok(idleSeam < 0.02, "Idle loop is discontinuous");
const walkBytes = fs.readFileSync(
  new URL("../src/features/football-iq-match/assets/walking.fbx", import.meta.url),
);
const walkModel = new FBXLoader().parse(
  walkBytes.buffer.slice(walkBytes.byteOffset, walkBytes.byteOffset + walkBytes.byteLength),
  "",
);
const walkClip = walkModel.animations.find((item) => item.duration > 0 && item.tracks.length);
assert.ok(walkClip, "Missing Walking clip");
assert.ok(Math.abs(walkClip.duration - 31 / 30) < 0.00001, "Unexpected Walking timing");
const walkHips = walkClip.tracks.find((track) => track.name === "mixamorigHips.position");
assert.ok(walkHips, "Walking must include hip translation");
const walkForward = walkHips.values.at(-1) - walkHips.values[2];
assert.ok(walkForward > 184 && walkForward < 185, "Walking stride requires recalibration");
let walkSeam = 0;
for (const track of walkClip.tracks) {
  if (!track.name.endsWith(".quaternion")) continue;
  const a = Array.from(track.values.slice(0, 4));
  const b = Array.from(track.values.slice(-4));
  const dot = Math.abs(a.reduce((sum, n, i) => sum + n * b[i], 0));
  walkSeam = Math.max(walkSeam, 2 * Math.acos(Math.min(1, dot)));
}
assert.ok(walkSeam < 0.02, "Walking loop is discontinuous");
console.log(
  JSON.stringify(
    {
      status: "PASS",
      durationSeconds: clip.duration,
      feetCorrelation: correlation,
      worstLoopSeamRadians: worstSeam,
      independentSkeletons: true,
      passDurationSeconds: passClip.duration,
      passingFoot: "right",
      passFollowThroughVerified: true,
      idleDurationSeconds: idleClip.duration,
      idleLoopSeamRadians: idleSeam,
      idleMotionVerified: true,
      walkingDurationSeconds: walkClip.duration,
      walkingLoopSeamRadians: walkSeam,
      walkingSourceTravel: walkForward,
    },
    null,
    2,
  ),
);
