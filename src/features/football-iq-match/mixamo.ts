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
import { aerialAnimationNames, aerialCalibrations, validateAerialCalibration } from "./aerialClips";
import type { AerialAnimation, AerialCalibrations } from "./aerialClips";

export const PLAYER_HEIGHT = 6.8;
export type AdditionalAnimation = "idle" | "walking" | "soccer-pass" | "receive" | AerialAnimation;
type AdditionalClips = Partial<Record<AdditionalAnimation, AnimationClip>>;
const additionalUrls = import.meta.glob<string>("./assets/{idle,walking,soccer-pass,receive}.fbx", {
  eager: true,
  query: "?url",
  import: "default",
});
const aerialUrls = import.meta.glob<string>("./assets/{long-kick,header}.fbx", {
  eager: true,
  query: "?url",
  import: "default",
});
export type AerialAssetStatus = "missing" | "uncalibrated" | "ready" | "invalid";

// Optional new clips cannot make the installed running/idle/pass set unusable.
// The reader is injected so missing/corrupt/changed exports can be tested without WebGL.
export async function attachAerialClips(
  asset: ReturnType<typeof prepareRunningModel>,
  urls: Partial<Record<AerialAnimation, string>>,
  calibrations: AerialCalibrations,
  read: (url: string) => Promise<{ source: Group; sha256: string }>,
) {
  for (const name of aerialAnimationNames) {
    delete asset.clips[name];
    delete asset.aerial[name];
    const url = urls[name],
      calibration = calibrations[name];
    asset.aerialStatus[name] = !url ? "missing" : !calibration ? "uncalibrated" : "invalid";
    if (!url || !calibration) continue;
    let source: Group | undefined;
    try {
      validateAerialCalibration(name, calibration);
      const loaded = await read(url);
      source = loaded.source;
      const clip = prepareAdditionalClip(source, asset.model, name);
      validateAerialCalibration(name, calibration, {
        sha256: loaded.sha256,
        durationSeconds: clip.duration,
      });
      if (name === "header") {
        const hips = clip.tracks.find((track) => track.name === "mixamorigHips.position")!;
        const interpolant = hips.InterpolantFactoryMethodLinear();
        const height = (frame: number) => Number(interpolant.evaluate(frame / calibration.fps)[1]);
        const floor = Math.max(
          height(calibration.takeoffFrame!),
          height(calibration.landingFrame!),
        );
        if ((height(calibration.contactFrame) - floor) * asset.scale < 0.2)
          throw new Error("Klip nie zawiera wyskoku w zaznaczonym momencie główki.");
      }
      asset.clips[name] = clip;
      // Use the parsed duration for phase sampling (FBX times are float32).
      // The contact remains the exact frame / FPS marker from calibration.
      asset.aerial[name] = { ...structuredClone(calibration), durationSeconds: clip.duration };
      asset.aerialStatus[name] = "ready";
    } catch {
      // Keep the existing clips. Diagnostics are available to developer tooling.
      asset.aerialStatus[name] = "invalid";
    } finally {
      if (source) disposeModel(source);
    }
  }
}

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

/** Every request is bounded; scene cancellation also stops compressed asset downloads. */
export async function readAnimationFile(url: string, signal?: AbortSignal, timeoutMs = 15_000) {
  const controller = new AbortController();
  const abort = () =>
    controller.abort(signal?.reason ?? new DOMException("Anulowano", "AbortError"));
  signal?.throwIfAborted();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(
    () => controller.abort(new Error("Pobieranie animacji trwa za długo.")),
    timeoutMs,
  );
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error("Nie można pobrać animacji.");
    const bytes = await response.arrayBuffer();
    controller.signal.throwIfAborted();
    if (bytes.byteLength === 0 || bytes.byteLength > 32 * 1024 * 1024)
      throw new Error("Nieprawidłowy rozmiar animacji.");
    return bytes;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

/** Optional clips attach after the base model is usable; a bad clip cannot dispose it. */
export async function attachOptionalClips(
  asset: ReturnType<typeof prepareRunningModel>,
  urls: Record<string, string>,
  read: (url: string) => Promise<Group>,
  signal?: AbortSignal,
) {
  await Promise.allSettled(
    Object.entries(urls).map(async ([path, url]) => {
      const name = path.split("/").at(-1)!.replace(".fbx", "") as AdditionalAnimation;
      if (asset.clips[name] || signal?.aborted) return;
      let source: Group | undefined;
      try {
        source = await read(url);
        if (!signal?.aborted) asset.clips[name] = prepareAdditionalClip(source, asset.model, name);
      } catch {
        /* optional network, parser and skeleton errors retain the neutral/base motion */
      } finally {
        if (source) disposeModel(source);
      }
    }),
  );
}
async function loadAsset(signal?: AbortSignal) {
  const bytes = await readAnimationFile(runningUrl, signal);
  signal?.throwIfAborted();
  return prepareRunningModel(new FBXLoader().parse(bytes, ""));
}
function loadOptionalAnimations(
  asset: ReturnType<typeof prepareRunningModel>,
  signal?: AbortSignal,
) {
  const loader = new FBXLoader();
  void attachOptionalClips(
    asset,
    additionalUrls,
    async (url) => loader.parse(await readAnimationFile(url, signal), ""),
    signal,
  );
  const urls = Object.fromEntries(
    Object.entries(aerialUrls).map(([path, url]) => [
      path.split("/").at(-1)!.replace(".fbx", ""),
      url,
    ]),
  );
  if (!Object.keys(urls).length) return;
  void attachAerialClips(asset, urls, aerialCalibrations, async (url) => {
    const bytes = await readAnimationFile(url, signal);
    signal?.throwIfAborted();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    signal?.throwIfAborted();
    return {
      source: loader.parse(bytes, ""),
      sha256: [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(""),
    };
  });
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
  if (name === "header") required.push("mixamorigSpine", "mixamorigHead");
  if (
    !clip ||
    !required.every((bone) => clip.tracks.some((track) => track.name === `${bone}.quaternion`))
  )
    throw new Error(`Animacja ${name} musi pochodzić z tego samego Y Bot w Mixamo.`);
  if (
    (name === "header" || name === "long-kick") &&
    (!clip.tracks.some((track) => track.name === "mixamorigHips.position") ||
      clip.tracks.some(
        (track) =>
          !Array.from(track.times).every(Number.isFinite) ||
          !Array.from(track.values).every(Number.isFinite),
      ))
  )
    throw new Error(`Animacja ${name} zawiera nieprawidłowe ścieżki ruchu.`);
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
      const localGesture = ["soccer-pass", "long-kick", "header"].includes(name);
      track.values[i] = hips.position.x + (localGesture ? track.values[i] - firstX : 0);
      // Use the bind pose, not the first animated frame: Idle bends its knees.
      track.values[i + 1] = hips.position.y + track.values[i + 1] - sourceBindY;
      track.values[i + 2] = hips.position.z + (localGesture ? track.values[i + 2] - firstZ : 0);
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
  return {
    model,
    running,
    idle,
    scale,
    floor,
    clips: {} as AdditionalClips,
    aerial: {} as AerialCalibrations,
    aerialStatus: { "long-kick": "missing", header: "missing" } as Record<
      AerialAnimation,
      AerialAssetStatus
    >,
  };
}

let cachedAsset: Promise<Awaited<ReturnType<typeof loadAsset>>> | null = null;
export async function loadRunningModel(signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!cachedAsset) {
    const pending = loadAsset(signal).catch((error) => {
      if (cachedAsset === pending) cachedAsset = null;
      throw error;
    });
    cachedAsset = pending;
  }
  const asset = await cachedAsset;
  signal?.throwIfAborted();
  loadOptionalAnimations(asset, signal);
  return asset;
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
            : "#44a6d8"
          : joints
            ? "#9fada9"
            : "#ecebe2",
      roughness: 0.88,
      metalness: 0,
    });
  });
  const root = new Group();
  root.add(model);
  const mixer = new AnimationMixer(model);
  let idle = mixer.clipAction(asset.clips.idle ?? asset.idle).play();
  const run = mixer.clipAction(asset.running).play();
  let walk = asset.clips.walking ? mixer.clipAction(asset.clips.walking).play() : null;
  let pass = asset.clips["soccer-pass"]
    ? mixer.clipAction(asset.clips["soccer-pass"]).setLoop(LoopOnce, 1).play()
    : null;
  let receive = asset.clips.receive
    ? mixer.clipAction(asset.clips.receive).setLoop(LoopOnce, 1).play()
    : null;
  const aerial = Object.fromEntries(
    aerialAnimationNames.map((name) => [
      name,
      asset.aerial[name] && asset.clips[name]
        ? mixer.clipAction(asset.clips[name]!).setLoop(LoopOnce, 1).play()
        : null,
    ]),
  );
  let actions = [idle, run, walk, pass, receive, ...Object.values(aerial)].filter(
    (action) => action !== null,
  );
  actions.forEach((action) => {
    action.paused = true;
    action.clampWhenFinished = true;
    action.setEffectiveWeight(0);
  });
  // AnimationMixer can skip writing unchanged tracks while paused. Restore the
  // unmodified pose first so procedural offsets never accumulate on redraw.
  const gestureBones = ["RightUpLeg", "RightLeg", "Spine", "LeftArm"].flatMap((name) => {
    const bone = model.getObjectByName(`mixamorig${name}`);
    return bone ? [{ bone, base: bone.quaternion.clone() }] : [];
  });

  const attached = new Map(Object.entries(asset.clips));
  const pose = (motion: PlayerMotion, idleClock = motion.clock ?? 0) => {
    // Upgrade each actor when a late optional clip arrives without rebuilding the scene.
    for (const [name, clip] of Object.entries(asset.clips)) {
      if (!clip || attached.get(name) === clip) continue;
      attached.set(name, clip);
      const next = mixer.clipAction(clip).play();
      next.paused = true;
      next.clampWhenFinished = true;
      next.setEffectiveWeight(0);
      if (name === "idle") {
        idle.stop();
        idle = next;
      } else if (name === "walking") walk = next;
      else {
        next.setLoop(LoopOnce, 1);
        if (name === "soccer-pass") pass = next;
        else if (name === "receive") receive = next;
        else aerial[name] = next;
      }
      actions = [idle, run, walk, pass, receive, ...Object.values(aerial)].filter(
        (action) => action !== null,
      );
    }
    gestureBones.forEach(({ bone, base }) => bone.quaternion.copy(base));
    const movement = motion.gait === "walk" && walk ? walk : run;
    const gesture = motion.clip
      ? aerial[motion.clip]
      : motion.state === "pass"
        ? pass
        : motion.state === "receive"
          ? receive
          : null;
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
    gestureBones.forEach((entry) => entry.base.copy(entry.bone.quaternion));
    // Small, seek-safe offsets on top of the supplied kick. The contact frame
    // remains untouched; the airborne delivery adds a higher follow-through.
    const phase = motion.phase ?? 0;
    if (
      active === pass &&
      !motion.clip &&
      motion.state === "pass" &&
      motion.delivery &&
      motion.delivery !== "ground"
    ) {
      const follow =
        Math.sin(Math.PI * Math.max(0, Math.min(1, (phase - 14 / 48) / (1 - 14 / 48)))) * blend;
      model.getObjectByName("mixamorigRightUpLeg")?.rotateX(-0.3 * follow);
      model.getObjectByName("mixamorigSpine")?.rotateX(-0.11 * follow);
      model.getObjectByName("mixamorigLeftArm")?.rotateZ(-0.15 * follow);
    }
    if (motion.state === "receive" && motion.control === "aerial") {
      const touch = Math.sin(Math.PI * Math.max(0, Math.min(1, phase))) * (motion.weight ?? 1);
      model.getObjectByName("mixamorigRightUpLeg")?.rotateX(-0.46 * touch);
      model.getObjectByName("mixamorigRightLeg")?.rotateX(0.42 * touch);
      model.getObjectByName("mixamorigSpine")?.rotateX(0.1 * touch);
    }
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
