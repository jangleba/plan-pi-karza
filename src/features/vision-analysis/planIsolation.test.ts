import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Test granicy modułów (PLAN_MODULE_PROTECTED).
 *
 * Egzekwuje twardą zasadę: zmiana w `src/features/vision-analysis` nie może
 * zmieniać importów, danych ani zachowania modułu Plan. Innymi słowy: żaden
 * plik Vision nie importuje generatora treningów, biblioteki ćwiczeń, reguł
 * ani UI Planu.
 *
 * Dozwolony jest wyłącznie odczyt czystych typów/etykiet Planu przez
 * `src/lib/vision/**` — ta ścieżka nie jest objęta tym testem, pilnuje jej
 * `planBoundary.test.ts`.
 */

const ROOT = resolve(__dirname, "..", "..", "..");
const VISION_DIR = resolve(ROOT, "src/features/vision-analysis");

const FORBIDDEN_PLAN_IMPORTS = [
  /lib\/loadwise/,
  /components\/loadwise/,
  /routes\/_tabs\.plan/,
  /routes\/sesja\./,
];

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function importsMatching(file: string, patterns: RegExp[]): string[] {
  const src = readFileSync(file, "utf8");
  const hits: string[] = [];
  const importRe = /(?:import|from)\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(src))) {
    const spec = m[1];
    if (patterns.some((p) => p.test(spec))) hits.push(spec);
  }
  return hits;
}

describe("vision-analysis ↔ Plan isolation (PLAN_MODULE_PROTECTED)", () => {
  it("żaden plik src/features/vision-analysis nie importuje modułu Plan", () => {
    const files = collectFiles(VISION_DIR);
    const offenders: string[] = [];
    for (const f of files) {
      const hits = importsMatching(f, FORBIDDEN_PLAN_IMPORTS);
      if (hits.length) offenders.push(`${f.replace(ROOT, "")}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });
});
