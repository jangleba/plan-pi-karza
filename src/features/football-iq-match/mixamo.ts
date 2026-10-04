import {
  AnimationClip,
  AnimationMixer,
  Bone,
  Box3,
  Group,
  LoopOnce,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import runningUrl from "./assets/running.fbx?url";
import { RUN_STRIDE_UNITS, WALK_STRIDE_UNITS } from "./playback";
import type { PlayerMotion } from "./playback";
import type { MatchPlayer } from "./types";

export const PLAYER_HEIGHT = 6.8;
export type AdditionalAnimation = "idle" | "walking" | "soccer-pass" | "receive";
type AdditionalClips = Partial<Record<AdditionalAnimation, AnimationClip>>;
const additionalUrls = import.meta.glob<string>("./assets/{idle,walking,soccer-pass,receive}.fbx", {
  eager: true,
  query: "?url",
  import: "default",
});

function restingClip(model: Group) {
  model.updateMatrixWorld(true);
  // A neutral static stance until a dedicated Idle clip is supplied.
  for (const side of ["Left", "Right"]) {
    const arm = model.getObjectByName(`mixamorig${side}Arm`);
    const elbow = model.getObjectByName(`mixamorig${side}ForeArm`);
    if (!arm || !elbow || !arm.parent) continue;
    const direction = elbow
      .getWorldPosition(new Vector3())
      .sub(arm.getWorldPosition(new Vector3()))
      .normalize();
    const desired = new Vector3(side === "Left" ? 0.12 : -0.12, -1, 0.06).normalize();
    const correction = new Quaternion().setFromUnitVectors(direction, desired);
    const world = correction.multiply(arm.getWorldQuaternion(new Quaternion()));
    arm.quaternion.copy(arm.parent.getWorldQuaternion(new Quaternion()).invert().multiply(world));
    model.updateMatrixWorld(true);
  }
  const tracks: (QuaternionKeyframeTrack | VectorKeyframeTrack)[] = [];
  const names = new Set<string>();
  model.traverse((object) => {
    if (!(object instanceof Bone) || names.has(object.name)) return;
    names.add(object.name);
    tracks.push(
      new QuaternionKeyframeTrack(`${object.name}.quaternion`, [0], object.quaternion.toArray()),
    );
    tracks.push(new VectorKeyframeTrack(`${object.name}.position`, [0], object.position.toArray()));
  });
  return new AnimationClip("neutral-stance", 1, tracks);
}

export async function loadRunningModel() {
  const loader = new FBXLoader();
  const asset = prepareRunningModel(await loader.loadAsync(runningUrl));
  try {
    for (const [path, url] of Object.entries(additionalUrls)) {
      const name = path.split("/").at(-1)!.replace(".fbx", "") as AdditionalAnimation;
      const source = await loader.loadAsync(url);
      try {
        asset.clips[name] = prepareAdditionalClip(source, asset.model, name);
      } finally {
        disposeModel(source);
      }
    }
    return asset;
  } catch (error) {
    disposeModel(asset.model);
    throw error;
  }
}

export function prepareAdditionalClip(source: Group, target: Group, name: AdditionalAnimation) {
  const clip = source.animations
    .find((animation) => animation.duration > 0 && animation.tracks.length > 0)
    ?.clone();
  const bones = new Map<string, Bone>();
  target.traverse((object) => {
    if (object instanceof Bone && !bones.has(object.name)) bones.set(object.name, object);
  });
  const required = ["mixamorigHips", "mixamorigLeftUpLeg", "mixamorigRightUpLeg"];
  if (
    !clip ||
    !required.every((bone) => clip.tracks.some((track) => track.name === `${bone}.quaternion`))
  )
    throw new Error(`Animacja ${name} musi pochodzić z tego samego Y Bot w Mixamo.`);
  clip.name = name;
  clip.tracks = clip.tracks.filter((track) => {
    const dot = track.name.lastIndexOf(".");
    return bones.has(track.name.slice(0, dot));
  });
  for (const track of clip.tracks) {
    if (track.name !== "mixamorigHips.position") continue;
    const hips = bones.get("mixamorigHips")!;
    const firstX = track.values[0];
    const firstY = track.values[1];
    const sourceBindY = source.getObjectByName("mixamorigHips")?.position.y ?? firstY;
    const firstZ = track.values[2];
    for (let i = 0; i < track.values.length; i += 3) {
      // Locomotion follows the plan; the kick retains its small local weight transfer.
      track.values[i] = hips.position.x + (name === "soccer-pass" ? track.values[i] - firstX : 0);
      // Use the bind pose, not the first animated frame: Idle bends its knees.
      track.values[i + 1] = hips.position.y + track.values[i + 1] - sourceBindY;
      track.values[i + 2] =
        hips.position.z + (name === "soccer-pass" ? track.values[i + 2] - firstZ : 0);
    }
  }
  return clip;
}

export function prepareRunningModel(model: Group) {
  const source = model.animations.find((clip) => clip.duration > 0 && clip.tracks.length > 0);
  if (
    !source ||
    !source.tracks.some((t) => /LeftUpLeg/.test(t.name)) ||
    !source.tracks.some((t) => /RightUpLeg/.test(t.name))
  ) {
    disposeModel(model);
    throw new Error("Plik nie zawiera pełnej animacji biegu.");
  }
  const running = source.clone();
  running.name = "running";
  // Scene coordinates control translation. Preserve the vertical hip bounce.
  for (const track of running.tracks) {
    if (!/Hips\.position$/.test(track.name)) continue;
    const x = track.values[0];
    const z = track.values[2];
    for (let i = 0; i < track.values.length; i += 3) {
      track.values[i] = x;
      track.values[i + 2] = z;
    }
  }
  const bounds = new Box3().setFromObject(model);
  const scale = PLAYER_HEIGHT / (bounds.max.y - bounds.min.y);
  const floor = bounds.min.y;
  model.traverse((object) => {
    if (object instanceof Mesh) {
      const original = object.geometry;
      object.geometry = mergeVertices(original);
      original.dispose();
    }
  });
  const idle = restingClip(model);
  return { model, running, idle, scale, floor, clips: {} as AdditionalClips };
}

export type RunningModel = Awaited<ReturnType<typeof loadRunningModel>>;

export function makeActor(asset: RunningModel, player: MatchPlayer, idlePhaseOffset = 0) {
  // Object3D.clone alone would share the bones between teammates.
  const model = clone(asset.model) as Group;
  model.scale.setScalar(asset.scale);
  model.position.y = -asset.floor * asset.scale;
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const joints = object.name.includes("Joints");
    object.material = new MeshStandardMaterial({
      color: player.goalkeeper
        ? joints
          ? "#874f1e"
          : "#ee923b"
        : player.team === "home"
          ? joints
            ? "#102d49"
            : "#176399"
          : joints
            ? "#8c969c"
            : "#ecebe2",
      roughness: 0.88,
      metalness: 0,
    });
  });
  const root = new Group();
  root.add(model);
  const mixer = new AnimationMixer(model);
  const idle = mixer.clipAction(asset.clips.idle ?? asset.idle).play();
  const run = mixer.clipAction(asset.running).play();
  const walk = asset.clips.walking ? mixer.clipAction(asset.clips.walking).play() : null;
  const pass = asset.clips["soccer-pass"]
    ? mixer.clipAction(asset.clips["soccer-pass"]).setLoop(LoopOnce, 1).play()
    : null;
  const receive = asset.clips.receive
    ? mixer.clipAction(asset.clips.receive).setLoop(LoopOnce, 1).play()
    : null;
  const actions = [idle, run, walk, pass, receive].filter((action) => action !== null);
  actions.forEach((action) => {
    action.paused = true;
    action.clampWhenFinished = true;
    action.setEffectiveWeight(0);
  });

  const pose = (motion: PlayerMotion, idleClock = motion.clock ?? 0) => {
    const movement = motion.gait === "walk" && walk ? walk : run;
    const gesture = motion.state === "pass" ? pass : motion.state === "receive" ? receive : null;
    const active = motion.moving ? movement : gesture;
    const blend = active
      ? Math.max(
          0,
          Math.min(
            1,
            motion.weight ??
              (motion.moving
                ? Math.min(motion.elapsed / 0.12, (motion.duration - motion.elapsed) / 0.12)
                : 0),
          ),
        )
      : 0;
    actions.forEach((action) => action.setEffectiveWeight(0));
    idle.setEffectiveWeight(1 - blend);
    idle.time = (idleClock + idlePhaseOffset) % idle.getClip().duration;
    if (active) {
      active.enabled = true;
      active.setEffectiveWeight(blend);
      const duration = active.getClip().duration;
      active.time = motion.moving
        ? ((motion.distance / (active === walk ? WALK_STRIDE_UNITS : RUN_STRIDE_UNITS)) *
            duration) %
          duration
        : Math.min(duration - 0.000001, (motion.phase ?? 0) * duration);
    }
    mixer.update(0);
    root.rotation.y = motion.heading;
  };
  const dispose = () => {
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
      if ("skeleton" in object) (object as import("three").SkinnedMesh).skeleton.dispose();
    });
  };
  return { root, pose, dispose };
}

export function disposeModel(model: Group) {
  const geometries = new Set<import("three").BufferGeometry>();
  const materials = new Set<import("three").Material>();
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) =>
      materials.add(m),
    );
    if ("skeleton" in object) (object as import("three").SkinnedMesh).skeleton.dispose();
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
