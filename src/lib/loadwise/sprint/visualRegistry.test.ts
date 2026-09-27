import { describe, expect, it } from "vitest";
import { resolveSprintVisual } from "./visualRegistry";

describe("sprint visual registry", () => {
  it("maps exact approved skip names", () => {
    expect(resolveSprintVisual({ id: "skip-a", title: "Skip A", prescription: "2 × 15 m" })).toBe("/sprint/skips/skip-a.png");
  });

  it("never guesses an unrelated visual", () => {
    expect(resolveSprintVisual({ id: "custom", title: "Inny ruch", prescription: "1 × 10 m" })).toBeNull();
  });
});

