#!/usr/bin/env node
// Sprawdza, czy oba lockfile'e zgadzają się z package.json.
//
// package-lock.json używa CI i lokalny `npm ci`. bun.lock utrzymuje Lovable
// (jego podgląd i build instalują zależności przez Bun). Gdy jeden z nich
// zostanie po zmianie package.json, Lovable lub CI zbudują aplikację z innymi
// wersjami bibliotek niż te, które przeszły testy.
//
// Naprawa:
//   npx -y npm@11.9.0 install --package-lock-only --ignore-scripts
//   bun install --lockfile-only
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (file) => readFileSync(path.join(root, file), "utf8");

// bun.lock to JSON z przecinkami na końcu list i obiektów.
const parseBunLock = (text) => JSON.parse(text.replace(/,(\s*[}\]])/g, "$1"));

const pkg = JSON.parse(readText("package.json"));
const npmLock = JSON.parse(readText("package-lock.json"));
const bunLock = parseBunLock(readText("bun.lock"));

const errors = [];
const sections = ["dependencies", "devDependencies"];

const npmRoot = npmLock.packages?.[""] ?? {};
const bunRoot = bunLock.workspaces?.[""] ?? {};

for (const section of sections) {
  const declared = pkg[section] ?? {};
  for (const [name, spec] of Object.entries(declared)) {
    if (npmRoot[section]?.[name] !== spec) {
      errors.push(
        `package-lock.json: ${section}.${name} = ${npmRoot[section]?.[name] ?? "brak"}, package.json = ${spec}`,
      );
    }
    if (bunRoot[section]?.[name] !== spec) {
      errors.push(
        `bun.lock: ${section}.${name} = ${bunRoot[section]?.[name] ?? "brak"}, package.json = ${spec}`,
      );
    }

    // Lokalne pakiety (file:) nie mają wersji z rejestru.
    if (spec.startsWith("file:")) continue;

    const npmVersion = npmLock.packages?.[`node_modules/${name}`]?.version;
    if (npmVersion !== spec) {
      errors.push(
        `package-lock.json: zainstalowane ${name}@${npmVersion ?? "brak"}, package.json = ${spec}`,
      );
    }
    const bunEntry = bunLock.packages?.[name]?.[0];
    const bunVersion =
      typeof bunEntry === "string" ? bunEntry.slice(bunEntry.lastIndexOf("@") + 1) : undefined;
    if (bunVersion !== spec) {
      errors.push(
        `bun.lock: zainstalowane ${name}@${bunVersion ?? "brak"}, package.json = ${spec}`,
      );
    }
  }

  for (const name of Object.keys(npmRoot[section] ?? {})) {
    if (!(name in declared))
      errors.push(`package-lock.json: ${section}.${name} nie ma w package.json`);
  }
  for (const name of Object.keys(bunRoot[section] ?? {})) {
    if (!(name in declared)) errors.push(`bun.lock: ${section}.${name} nie ma w package.json`);
  }
}

for (const [name, spec] of Object.entries(pkg.overrides ?? {})) {
  if (bunLock.overrides?.[name] !== spec) {
    errors.push(
      `bun.lock: overrides.${name} = ${bunLock.overrides?.[name] ?? "brak"}, package.json = ${spec}`,
    );
  }
}

if (errors.length) {
  console.error(
    "Lockfile'e nie zgadzają się z package.json:\n" + errors.map((e) => `- ${e}`).join("\n"),
  );
  console.error(
    "\nNapraw: npx -y npm@11.9.0 install --package-lock-only --ignore-scripts && bun install --lockfile-only",
  );
  process.exit(1);
}

console.log("package-lock.json i bun.lock zgadzają się z package.json.");
