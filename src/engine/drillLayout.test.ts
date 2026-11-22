import { describe, expect, it } from "vitest";
import { ALL_DRILLS } from "./technique";
import { mirrorDrill, withVariant } from "./drill";
import { audit } from "./drillLayout";

const cases = ALL_DRILLS.flatMap((d) => (["A", "B"] as const).flatMap((v) => (d.variants?.some((x) => x.id === v) || v === "A") ? [[`${d.id} ${v}`, withVariant(d, v)], [`${d.id} ${v} lustro`, mirrorDrill(withVariant(d, v))]] as const : []));

describe("układ rysunku: nic się nie nakłada", () => {
  it("wszystkie ćwiczenia, warianty i lustra", () => {
    const bad = cases.map(([n, d]) => [n, [...new Set(audit(d))]] as const).filter(([, i]) => i.length);
    if (bad.length) console.log(bad.length, "z", cases.length, "\n" + bad.map(([n, i]) => `${n}: ${i.join("; ")}`).join("\n"));
    expect(bad.length).toBe(0);
  });
});
