import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

describe("izolacja danych: brak bezpośredniego localStorage poza warstwą przestrzeni", () => {
  it("tylko src/lib/store.ts (oraz testy i komentarze) odwołują się do localStorage", () => {
    const offenders = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f) && !f.endsWith("lib/store.ts")).filter((f) => {
      const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      return /\b(localStorage|sessionStorage)\b/.test(code);
    });
    expect(offenders).toEqual([]);
  });
});
