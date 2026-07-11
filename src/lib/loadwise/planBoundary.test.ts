import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Test granicy modułów: Plan ↔ Vision.
 *
 * Egzekwuje zasady z PLAN_PROTECTED.md:
 *  - moduł Plan (loadwise + trasy planu + komponenty loadwise) NIE importuje
 *    kodu Vision,
 *  - src/features/vision-analysis NIE sięga do modułu Plan.
 *
 * Dozwolony jest wyłącznie odczyt typów/etykiet Planu przez lib/vision.
 */

const ROOT = resolve(__dirname, "..", "..", "..");

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
    if (st.isDirectory()) {
      out.push(...collectFiles(full));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function importsMatching(file: string, patterns: RegExp[]): string[] {
  const src = readFileSync(file, "utf8");
  const hits: string[] = [];
  const importRe = /import[\s\S]*?from\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(src))) {
    const spec = m[1];
    if (patterns.some((p) => p.test(spec))) hits.push(spec);
  }
  return hits;
}

describe("granica modułu Plan (PLAN_PROTECTED)", () => {
  const planFiles = [
    ...collectFiles(resolve(ROOT, "src/lib/loadwise")),
    ...collectFiles(resolve(ROOT, "src/components/loadwise")),
    resolve(ROOT, "src/routes/_tabs.plan.tsx"),
    resolve(ROOT, "src/routes/sesja.$date.tsx"),
  ];

  it("żaden plik Planu nie importuje kodu Vision", () => {
    const visionPatterns = [/features\/vision-analysis/, /lib\/vision/];
    const offenders: string[] = [];
    for (const f of planFiles) {
      try {
        const hits = importsMatching(f, visionPatterns);
        if (hits.length) offenders.push(`${f.replace(ROOT, "")}: ${hits.join(", ")}`);
      } catch {
        // plik może nie istnieć — pomijamy
      }
    }
    expect(offenders).toEqual([]);
  });

  it("vision-analysis nie sięga do modułu Plan", () => {
    const files = collectFiles(resolve(ROOT, "src/features/vision-analysis"));
    const planPatterns = [/lib\/loadwise/, /components\/loadwise/, /routes\/_tabs\.plan/];
    const offenders: string[] = [];
    for (const f of files) {
      const hits = importsMatching(f, planPatterns);
      if (hits.length) offenders.push(`${f.replace(ROOT, "")}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });
});
