import { describe, expect, it } from "vitest";
import { EXERCISES } from "./library";
import { LADDERS, bodyweightTemplate, rung } from "./bodyweight";

describe("siła bez siłowni", () => {
  it("każdy szczebel drabinki istnieje w bibliotece i nie wymaga ciężaru", () => {
    for (const ids of Object.values(LADDERS))
      for (const id of ids) {
        expect(EXERCISES[id], id).toBeDefined();
        expect(EXERCISES[id]!.loaded, id).toBe(false);
      }
  });
  it("szczebel rośnie z poziomem i w fazie intensywnej, maleje w rozładowaniu", () => {
    expect(rung("squat", "beginner", "volume")).toBe("bw-squat");
    expect(rung("squat", "intermediate", "volume")).toBe("bulgarian-split-squat");
    expect(rung("squat", "advanced", "volume")).toBe("assisted-pistol");
    expect(rung("squat", "advanced", "intensity")).toBe("pistol-squat");
    expect(rung("squat", "intermediate", "deload")).toBe("split-squat");
  });
  it("copenhagen i plank boczny mają zapis na stronę", () => {
    const items = bodyweightTemplate("intermediate", "volume").blocks.flatMap((b) => b.items);
    expect(items.find((i) => i.exerciseId === "copenhagen")!.reps).toContain("/ nogę");
    expect(items.find((i) => i.exerciseId === "side-plank")!.reps).toContain("s / stronę");
  });
  it("drabinka nie wychodzi poza zakres", () => {
    expect(rung("pull", "advanced", "intensity")).toBe("archer-row");
    expect(rung("push", "beginner", "deload")).toBe("incline-push-up");
  });
  it("szablon: ćwiczenia jednonóż mają zapis „/ nogę”, brak ćwiczeń z kg", () => {
    const t = bodyweightTemplate("intermediate", "volume");
    const items = t.blocks.flatMap((b) => b.items);
    expect(items.every((i) => EXERCISES[i.exerciseId] && !EXERCISES[i.exerciseId]!.loaded)).toBe(true);
    expect(items.find((i) => i.exerciseId === "bulgarian-split-squat")!.reps).toContain("/ nogę");
  });
});
