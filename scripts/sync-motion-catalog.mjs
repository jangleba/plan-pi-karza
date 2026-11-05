import { readFile, writeFile, mkdir } from "node:fs/promises";
import vm from "node:vm";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const tempoBundle = await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: [fileURLToPath(new URL("src/lib/trainingCoach/exerciseTempo.ts", root))],
  bundle: true,
  format: "iife",
  globalName: "BWTempo",
  platform: "browser",
  target: "es2020",
  write: false,
  legalComments: "none",
});
const tempoPath = new URL("public/technique/animations/tempo.js", root),
  tempoSource = tempoBundle.outputFiles[0].text;
if (process.argv.includes("--check")) {
  if (tempoSource !== (await readFile(tempoPath, "utf8")))
    throw new Error("Tempo runtime out of sync");
} else await writeFile(tempoPath, tempoSource);
const path = new URL("public/technique/animations/catalog.json", root);
const old = JSON.parse(await readFile(path, "utf8"));
const library = JSON.parse(
  await readFile(new URL("src/lib/trainingCoach/movement-library.json", root), "utf8"),
);
// The app needs identities only; phase instructions load with the isolated player.
const identitiesPath = new URL("src/lib/trainingCoach/movement-identities.json", root);
const identities =
  JSON.stringify(
    library.records.map(({ id, title }) => ({ id, title })),
    null,
    2,
  ) + "\n";
if (process.argv.includes("--check")) {
  if (identities !== (await readFile(identitiesPath, "utf8")))
    throw new Error("Movement identities out of sync");
} else await writeFile(identitiesPath, identities);
const additions = new Map(library.records.map((record) => [record.id, record]));
const records = [...old.records.filter((record) => !additions.has(record.id)), ...library.records];
const gallery = [...new Set([...old.gallery, ...library.records.map((record) => record.id)])];
const next = { ...old, version: 55, count: gallery.length, records, gallery };
const content = JSON.stringify(next, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (content !== (await readFile(path, "utf8")))
    throw new Error("Motion catalog out of sync. Run node scripts/sync-motion-catalog.mjs");
} else await writeFile(path, content);
console.log(`Motion catalog: ${records.length} records, ${gallery.length} gallery entries`);
const context = vm.createContext({});
for (const script of ["engine", "human", "movements", "spatial"])
  vm.runInContext(
    await readFile(new URL(`public/technique/animations/${script}.js`, root), "utf8"),
    context,
  );
context.BWMotionLibrary.register(records);
const directory = new URL("public/technique/animations/thumbs/", root);
if (!process.argv.includes("--check")) await mkdir(directory, { recursive: true });
for (const name of [
  "walk",
  "ankle",
  "calf",
  "soleus",
  "hamstring",
  "quad",
  "hip",
  "adductor",
  "cat",
  "rotation",
  "squat",
  "march",
  "run",
  "bridge",
]) {
  const scene = context.BWAnim.models[`bwprep:${name}`].sample(0.45);
  const points = [...context.BWDrawHuman.points(scene), ...(scene.framingPoints ?? [])];
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const x = Math.min(...xs) - 12,
    y = Math.min(...ys) - 12,
    w = Math.max(...xs) - x + 12,
    h = Math.max(...ys) - y + 12;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${[x, y, w, h].join(" ")}"><path d="M-300 264H800" fill="none" stroke="#d4dfe7"/>${scene.extras ?? ""}${context.drawBallwiseAthlete(scene)}${scene.frontExtras ?? ""}</svg>\n`;
  const target = new URL(`${name}.svg`, directory);
  if (process.argv.includes("--check")) {
    if (svg !== (await readFile(target, "utf8"))) throw new Error(`Thumbnail drift: ${name}`);
  } else await writeFile(target, svg);
}
for (const [name, id, phase] of [
  ["standing", "bodyweight_squat", 0],
  ["a-position", "a_march", 0.76],
  ["a-contact", "a_skip", 0.04],
  ["b-open", "b_skip", 0.65],
  ["c-fold", "c_skip", 0.6],
  ["straight-leg", "d_skip", 0.66],
  ["squat", "bodyweight_squat", 0.48],
  ["hinge", "romanian_deadlift_db", 0.48],
  ["split", "bodyweight_split_squat", 0.48],
  ["acceleration", "acceleration_mechanics", 0.15],
  ["upright", "max_velocity_high_volume", 0.15],
  ["landing", "snap_down", 0.48],
]) {
  const scene = context.BWAnim.models[id].sample(phase);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 292"><path d="M0 264H360" stroke="#cedbe5" fill="none"/>${context.drawBallwiseAthlete(scene)}</svg>\n`;
  const target = new URL(`public/technique/animations/snapshots/${name}.svg`, root);
  if (process.argv.includes("--check")) {
    if (svg !== (await readFile(target, "utf8"))) throw new Error(`Snapshot drift: ${name}`);
  } else await writeFile(target, svg);
}
