import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { PASS, clipTime, cycleRate, locomotion } from "./actorMath";
import { buildBody } from "./body";
import { animateFigure, makePlayer, type Figure, type Kit } from "./scene";

/** Wspólny interfejs: gładko oskórowana postać Mixamo albo (gdy nie wczyta się) sylwetka proceduralna. */
export interface Actor {
  root: THREE.Object3D;
  /** speed – prędkość (m/s), facing – kierunek (rad, obrót wokół Y). */
  update(speed: number, dt: number, facing: number): void;
  /** Start kopnięcia: po `contactIn` s piłka powinna opuścić stopę; `spot` – miejsce piłki w układzie postaci (m). */
  kick(): { contactIn: number; spot: THREE.Vector3 };
  readonly kicking: boolean;
}

export interface ActorAssets {
  scene: THREE.Group;
  clips: { run: THREE.AnimationClip; idle: THREE.AnimationClip; walk: THREE.AnimationClip; pass: THREE.AnimationClip };
}

const base = (p: string) => `${import.meta.env.BASE_URL}iq/${p}`.replace(/\/+/g, "/");

interface ClipJson { name: string; duration: number; tracks: Array<{ name: string; type: string; times: number[]; values: number[] }> }

/** Klip chodu z ruchem do przodu w biodrach – zamieniamy na „w miejscu” (stopa ma się cofać względem bioder). */
function inPlace(c: ClipJson): ClipJson {
  const t = c.tracks.find((x) => x.name === "mixamorigHips.position");
  if (t) for (let i = 2; i < t.values.length; i += 3) t.values[i] = t.values[2]!;
  return c;
}

export async function loadActorAssets(): Promise<ActorAssets> {
  const [gltf, idle, walk, pass] = await Promise.all([
    new GLTFLoader().loadAsync(base("player.glb")),
    fetch(base("idle.json")).then((r) => r.json() as Promise<ClipJson>),
    fetch(base("walking.json")).then((r) => r.json() as Promise<ClipJson>),
    fetch(base("soccer-pass.json")).then((r) => r.json() as Promise<ClipJson>),
  ]);
  const clip = (c: ClipJson) => THREE.AnimationClip.parse({ name: c.name, duration: c.duration, tracks: c.tracks, uuid: THREE.MathUtils.generateUUID(), blendMode: THREE.NormalAnimationBlendMode } as THREE.AnimationClipJSON);
  const run = gltf.animations[0];
  if (!run) throw new Error("Brak klipu biegu w player.glb");
  return { scene: gltf.scene, clips: { run, idle: clip(idle), walk: clip(inPlace(walk)), pass: clip(pass) } };
}

const SKINS = [0xe8bf9a, 0xd9a77c, 0xb57e55, 0x7a5233];
const HAIRS = [0x2b2118, 0x4a3426, 0x151515, 0x8a6a3b];

export interface ActorKit { jersey: number; shorts: number; socks: number; keeper?: boolean; gloves?: number; number?: number; collar?: number }

function numberTexture(n: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.font = "bold 96px -apple-system, Helvetica, Arial, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(String(n), 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material>();

/**
 * Materiał stroju: każdy wierzchołek niesie wagi 6 części (skóra, koszulka, spodenki, getry, buty, rękawice);
 * w shaderze wagi są wyostrzane (potęga), więc granice między częściami są wyraźne mimo długich trójkątów siatki.
 */
function kitMaterial(kit: ActorKit, skin: number, legs: { hem: number; sock: number }): THREE.Material {
  const key = `${kit.jersey}|${kit.shorts}|${kit.socks}|${kit.gloves ?? 0}|${skin}`;
  let m = matCache.get(key);
  if (m) return m;
  const colors = [skin, kit.jersey, kit.shorts, kit.socks, 0x17181a, kit.gloves ?? 0xe9eef3].map((c) => new THREE.Color(c));
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uKit = { value: colors };
    sh.uniforms.uLeg = { value: new THREE.Vector2(legs.hem, legs.sock) };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aPartA;\nattribute vec3 aPartB;\nattribute vec2 aBind;\nvarying vec3 vPartA;\nvarying vec3 vPartB;\nvarying vec2 vBind;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvPartA = aPartA; vPartB = aPartB; vBind = aBind;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uKit[6];\nuniform vec2 uLeg;\nvarying vec3 vPartA;\nvarying vec3 vPartB;\nvarying vec2 vBind;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        vec3 pa = pow(max(vPartA, 0.0), vec3(7.0));
        vec3 pb = pow(max(vPartB, 0.0), vec3(7.0));
        float ps = pa.x + pa.y + pa.z + pb.x + pb.y + pb.z + 1e-6;
        vec3 kitCol = (uKit[0] * pa.x + uKit[1] * pa.y + uKit[2] * pa.z + uKit[3] * pb.x + uKit[4] * pb.y + uKit[5] * pb.z) / ps;
        // nogi: granice spodenki / skóry / getrów po wysokości w pozie bazowej (równa linia zamiast postrzępionej po trójkątach siatki)
        if (vBind.y > 0.5) {
          float onShorts = smoothstep(uLeg.x - 0.6, uLeg.x + 0.6, vBind.x);
          float aboveSock = smoothstep(uLeg.y - 0.6, uLeg.y + 0.6, vBind.x);
          kitCol = mix(uKit[3], mix(uKit[0], uKit[2], onShorts), aboveSock);
        }
        diffuseColor.rgb *= kitCol;`);
  };
  mat.customProgramCacheKey = () => "bw-kit-2";
  matCache.set(key, mat);
  return mat;
}

/** Szablon postaci w stroju: części ciała wg kości, włosy i numer na plecach. Współdzielony przez klony. */
function buildTemplate(assets: ActorAssets, kit: ActorKit, variant: number): THREE.Group {
  const tpl = SkeletonUtils.clone(assets.scene) as THREE.Group;
  tpl.updateMatrixWorld(true);
  const bone = (n: string) => tpl.getObjectByName(n) as THREE.Bone;
  const worldY = (n: string) => bone(n).getWorldPosition(new THREE.Vector3()).y;
  const refs = { hip: worldY("mixamorigLeftUpLeg"), knee: worldY("mixamorigLeftLeg") };
  const skin = SKINS[variant % SKINS.length]!, hair = HAIRS[(variant * 3 + 1) % HAIRS.length]!;
  const mat = kitMaterial(kit, skin, { hem: refs.hip - 0.5 * (refs.hip - refs.knee), sock: refs.knee - 6 });
  // własne ciało zamiast manekina Beta: jedna siatka (wspólna dla wszystkich klonów danego wariantu) na szkielecie Mixamo
  const meshes: THREE.SkinnedMesh[] = [];
  tpl.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
  const main = meshes[0]!;
  const names = main.skeleton.bones.map((b) => b.name);
  const key = kit.keeper ? "keeper" : "field";
  let geo = geoCache.get(key);
  if (!geo) {
    geo = buildBody((n) => bone(`mixamorig${n}`).getWorldPosition(new THREE.Vector3()), (n) => { const i = names.indexOf(n); if (i < 0) throw new Error(`brak kości ${n}`); return i; }, !!kit.keeper);
    geoCache.set(key, geo);
  }
  main.geometry = geo; main.material = mat; main.castShadow = true; main.receiveShadow = false; main.frustumCulled = false;
  for (const m of meshes.slice(1)) m.parent?.remove(m); // dawne „stawy” manekina

  // włosy: kopuła dopasowana do głowy (cm, głowa: środek ok. 171 cm, promienie 7,9 × 11,2 × 9,3)
  const head = bone("mixamorigHead"), headW = head.getWorldPosition(new THREE.Vector3());
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.47), new THREE.MeshStandardMaterial({ color: hair, roughness: 0.9 }));
  cap.scale.set(9.0, 12.3, 10.5);
  cap.position.copy(head.worldToLocal(new THREE.Vector3(headW.x, 171.9, 1.0)));
  cap.rotation.x = -0.22; cap.castShadow = true; head.add(cap);

  // numer na plecach (kamera patrzy zza zawodnika; plecy = −Z modelu)
  if (kit.number !== undefined) {
    const sp = bone("mixamorigSpine2"), spW = sp.getWorldPosition(new THREE.Vector3());
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(17, 17), new THREE.MeshBasicMaterial({ map: numberTexture(kit.number), transparent: true, side: THREE.DoubleSide }));
    plane.position.copy(sp.worldToLocal(new THREE.Vector3(spW.x, spW.y + 1, spW.z - 13.4)));
    const q = sp.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    plane.quaternion.copy(q);
    sp.add(plane);
  }
  return tpl;
}

/** Postać Mixamo: bieg/chód/stanie mieszane wg prędkości; chód i bieg na wspólnej fazie kroku (bez ślizgania stóp). */
export class SkinnedActor implements Actor {
  root = new THREE.Group();
  private model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private a: { idle: THREE.AnimationAction; walk: THREE.AnimationAction; run: THREE.AnimationAction; pass: THREE.AnimationAction };
  private v = 0;
  /** Wspólna faza kroku (cykle) napędzająca klipy chodu i biegu. */
  private phase = 0;
  private kickT = -1;
  private kickBlend = 0;
  private scale: number;
  kicking = false;

  constructor(tpl: THREE.Group, assets: ActorAssets, variant: number) {
    this.scale = 0.01 * (0.97 + 0.03 * (variant % 3));
    this.model = SkeletonUtils.clone(tpl);
    this.model.scale.setScalar(this.scale);
    this.model.rotation.y = Math.PI / 2; // przód modelu (+Z) → +x świata
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    const mk = (c: THREE.AnimationClip) => { const x = this.mixer.clipAction(c); x.play(); x.setEffectiveWeight(0); x.time = ((variant * 0.37) % 1) * c.duration; return x; };
    this.a = { idle: mk(assets.clips.idle), walk: mk(assets.clips.walk), run: mk(assets.clips.run), pass: this.mixer.clipAction(assets.clips.pass) };
    // chód i bieg nie mają własnego zegara: czas klipów wynika ze wspólnej fazy kroku (patrz update)
    this.a.walk.paused = true; this.a.run.paused = true;
    this.phase = (variant * 0.37) % 1;
    this.a.pass.setLoop(THREE.LoopOnce, 1); this.a.pass.clampWhenFinished = true;
  }

  update(speed: number, dt: number, facing: number) {
    // wygładzenie prędkości (ok. 0,12 s), żeby miksowanie klipów nie drgało
    this.v += (speed - this.v) * Math.min(1, dt / 0.12);
    const L = locomotion(this.v);
    const k = 1 - this.kickBlend;
    this.a.idle.setEffectiveWeight(L.idle * k);
    this.a.walk.setEffectiveWeight(L.walk * k);
    this.a.run.setEffectiveWeight(L.run * k);
    // jedna faza kroku dla obu klipów: tempo = prędkość / uśredniona długość kroku (stopa w podporze nie ślizga się także w miksie)
    this.phase = (this.phase + cycleRate(this.v, L) * dt) % 1;
    this.a.walk.time = clipTime("walk", this.phase);
    this.a.run.time = clipTime("run", this.phase);

    if (this.kickT >= 0) {
      this.kickT += dt;
      const dur = PASS.duration / KICK_RATE;
      // płynne wejście w klip (0,12 s) i wyjście (ostatnie 0,25 s)
      this.kickBlend = Math.min(1, this.kickT / 0.12, Math.max(0, (dur - this.kickT) / 0.25));
      this.a.pass.setEffectiveWeight(this.kickBlend);
      if (this.kickT >= dur) { this.kickT = -1; this.kickBlend = 0; this.kicking = false; this.a.pass.stop(); }
    }
    this.mixer.update(dt);

    // obrót w stronę ruchu (podczas kopnięcia szybciej, żeby stanąć do celu przed zamachem)
    let d = facing - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, dt * (this.kicking ? 14 : 9));
  }

  kick() {
    this.kicking = true; this.kickT = 0; this.kickBlend = 0;
    this.a.pass.reset().setEffectiveTimeScale(KICK_RATE).setEffectiveWeight(0).play();
    const m = PASS.spotCm, s = this.scale;
    // model (mx,my,mz) → układ postaci: przód modelu to +x, lewa (+X modelu) to −z
    const spot = new THREE.Vector3(m.z * s, m.y * s, -m.x * s);
    return { contactIn: PASS.contact / KICK_RATE, spot };
  }
}

/** Tempo klipu podania – nieco szybciej, żeby decyzja nie czekała pół sekundy na piłkę. */
export const KICK_RATE = 1.2;

/** Zapas: sylwetka proceduralna (gdy nie wczyta się model). */
export class ProceduralActor implements Actor {
  root: THREE.Object3D;
  private f: Figure;
  kicking = false;
  private t = 0;
  constructor(kit: Kit, variant: number, stance: Figure["stance"]) { this.f = makePlayer(kit, variant, stance); this.root = this.f.root; }
  update(speed: number, dt: number, facing: number) {
    animateFigure(this.f, speed, dt, facing);
    if (this.kicking) { this.t -= dt; if (this.t <= 0) this.kicking = false; }
  }
  kick() { this.f.kick = 0.35; this.kicking = true; this.t = 0.35; return { contactIn: 0.17, spot: new THREE.Vector3(0.45, 0.16, 0) }; }
}

/** Fabryka: jeden szablon w stroju na kombinację (strój, wariant), reszta to klony. */
export class ActorFactory {
  private tpls = new Map<string, THREE.Group>();
  constructor(private assets: ActorAssets | null) {}
  make(kit: ActorKit, variant: number, stance: Figure["stance"] = "run"): Actor {
    if (!this.assets) {
      return new ProceduralActor({ jersey: kit.jersey, shorts: kit.shorts, socks: kit.socks, collar: kit.collar, number: kit.number, keeper: kit.keeper, gloves: kit.gloves }, variant, stance);
    }
    const key = JSON.stringify([kit, variant % 4]);
    let tpl = this.tpls.get(key);
    if (!tpl) { tpl = buildTemplate(this.assets, kit, variant); this.tpls.set(key, tpl); }
    return new SkinnedActor(tpl, this.assets, variant);
  }
}

