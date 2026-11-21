import { describe, expect, it } from "vitest";
import { adaptSession } from "./adapt";
import { bodyweightTemplate } from "./bodyweight";
import { TEMPLATES } from "./library";
import { blockHint } from "../SessionBlocks";

describe("bloki sesji", () => {
  it("każdy blok każdego szablonu ma nazwę", () => {
    const all = [...TEMPLATES, bodyweightTemplate("beginner", "volume"), bodyweightTemplate("advanced", "intensity")];
    for (const t of all) for (const b of t.blocks) expect(b.title, `${t.id}`).toBeTruthy();
  });

  it("adaptacja (mniej serii, lżejsze ćwiczenia) zachowuje nazwy bloków", () => {
    const t = TEMPLATES.find((x) => x.id === "strength-intensity")!;
    const heavy = adaptSession(t, { recovery: 1, feeling: 1, less: true }, false);
    expect(heavy.blocks.length).toBeLessThan(t.blocks.length);
    heavy.blocks.forEach((b, i) => expect(b.title).toBe(t.blocks[i]!.title));
  });

  it("podpis bloku: siła na zmianę, sprint po kolei, pojedyncze bez podpisu", () => {
    expect(blockHint(1, "alternate")).toBeNull();
    expect(blockHint(2, "alternate")).toBe("Na zmianę: a → b");
    expect(blockHint(3, "sequence")).toBe("Po kolei: a → b → c");
  });
});
