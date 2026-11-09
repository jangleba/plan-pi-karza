import fs from "node:fs";
import crypto from "node:crypto";
import { BufferAttribute } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshoptSimplifier } from "meshoptimizer/meshopt_simplifier.module.js";

// Keep original licensed FBX sources; ship only motion tracks for optional clips.
for (const name of ["idle", "walking", "soccer-pass"]) {
  const source = new URL(`../src/features/football-iq-match/assets/${name}.fbx`, import.meta.url);
  const destination = new URL(
    `../src/features/football-iq-match/assets/${name}.clip.json`,
    import.meta.url,
  );
  const bytes = fs.readFileSync(source);
  const model = new FBXLoader().parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  const clip = model.animations.find((clip) => clip.duration > 0 && clip.tracks.length > 0);
  const hips = model.getObjectByName("mixamorigHips");
  if (!clip || !hips) throw new Error(`Missing animation skeleton: ${name}`);
  const json = clip.toJSON();
  delete json.uuid;
  const data =
    JSON.stringify({
      version: 1,
      sourceSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      hipsBindY: hips.position.y,
      clip: json,
    }) + "\n";
  if (process.argv.includes("--check")) {
    if (!fs.existsSync(destination) || fs.readFileSync(destination, "utf8") !== data)
      throw new Error(`Regenerate ${name}.clip.json with node scripts/prepare-iq-clips.mjs`);
  } else fs.writeFileSync(destination, data);
  console.log(`${name}: ${bytes.length} -> ${Buffer.byteLength(data)} bytes`);
}

// The running model ships as a light GLB: 22 players on a phone do not need ~49k triangles each.
// Positions and skin weights stay exact; the mesh is simplified to ~10% of the triangles,
// UVs are dropped (the kit is coloured per vertex) and normals are recomputed.
const RUNNING_TRIANGLE_RATIO = 0.1;
{
  globalThis.FileReader ??= class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((result) => {
        this.result = result;
        this.onloadend?.();
      });
    }
  };
  await MeshoptSimplifier.ready;
  const source = new URL("../src/features/football-iq-match/assets/running.fbx", import.meta.url);
  const destination = new URL(
    "../src/features/football-iq-match/assets/running.glb",
    import.meta.url,
  );
  const bytes = fs.readFileSync(source);
  const model = new FBXLoader().parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  model.animations = model.animations.filter((clip) => clip.duration > 0 && clip.tracks.length);
  if (model.animations.length !== 1) throw new Error("running.fbx: expected one running clip");
  model.traverse((object) => {
    if (!object.isMesh) return;
    const original = object.geometry;
    original.deleteAttribute("uv");
    original.deleteAttribute("normal");
    const merged = mergeVertices(original, 1e-4);
    const indices = new Uint32Array(merged.index.array);
    const target = Math.floor((indices.length * RUNNING_TRIANGLE_RATIO) / 3) * 3;
    const [simple] = MeshoptSimplifier.simplify(
      indices,
      new Float32Array(merged.attributes.position.array),
      3,
      target,
      0.02,
      [],
    );
    // Drop unused vertices; compactMesh rewrites `simple` to the new numbering.
    const [remap, count] = MeshoptSimplifier.compactMesh(simple);
    const light = merged.clone();
    light.setIndex(null);
    for (const [name, attribute] of Object.entries(merged.attributes)) {
      const size = attribute.itemSize;
      const values = new attribute.array.constructor(count * size);
      for (let v = 0; v < remap.length; v++)
        if (remap[v] !== 0xffffffff)
          for (let k = 0; k < size; k++)
            values[remap[v] * size + k] = attribute.array[v * size + k];
      light.setAttribute(name, new BufferAttribute(values, size, attribute.normalized));
    }
    light.setIndex(new BufferAttribute(simple, 1));
    light.computeVertexNormals();
    object.geometry = light;
  });
  const data = Buffer.from(
    await new GLTFExporter().parseAsync(model, { binary: true, animations: model.animations }),
  );
  if (process.argv.includes("--check")) {
    if (!fs.existsSync(destination) || !fs.readFileSync(destination).equals(data))
      throw new Error("Regenerate running.glb with node scripts/prepare-iq-clips.mjs");
  } else fs.writeFileSync(destination, data);
  console.log(`running: ${bytes.length} -> ${data.length} bytes`);
}
