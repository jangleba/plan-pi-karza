import fs from "node:fs";
import crypto from "node:crypto";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

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
