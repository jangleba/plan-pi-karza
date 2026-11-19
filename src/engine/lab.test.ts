import { describe, expect, it } from "vitest";
import { jumpHeightFromFlightTime, labDue, validateLab, validateSprintSplits } from "./lab";

describe("Lab", () => {
  it("wysokość z czasu lotu: 0,5 s daje ok. 30,7 cm", () => {
    expect(jumpHeightFromFlightTime(0.5)).toBeCloseTo(30.66, 1);
  });
  it("walidacja zakresów", () => {
    expect(validateLab("cmj", 40)).toBeNull();
    expect(validateLab("cmj", 400)).not.toBeNull();
    expect(validateLab("sprint-10", 1.8)).toBeNull();
    expect(validateLab("sprint-10", 18)).not.toBeNull();
  });
  it("splity sprintu rosnące", () => {
    expect(validateSprintSplits(1.8, 3.1, 4.4)).toBeNull();
    expect(validateSprintSplits(1.8, 1.7, 4.4)).not.toBeNull();
    expect(validateSprintSplits(1.8, undefined, 1.5)).not.toBeNull();
  });
  it("przypomnienie po 5 tygodniach", () => {
    expect(labDue(undefined, "2026-11-18")).toBe(true);
    expect(labDue("2026-10-01", "2026-11-18")).toBe(true);
    expect(labDue("2026-11-10", "2026-11-18")).toBe(false);
  });
});

describe("Lab: oszacowanie z nagrania ≠ walidowany pomiar", () => {
  it("testy z nagrania mają jawne ograniczenia, a oznaczenie pochodzenia nie nazywa oszacowania pomiarem", async () => {
    const { LAB_TESTS, METHOD_LABEL, VALIDATION_NOTE } = await import("./lab");
    for (const key of ["cmj", "sprint"] as const) {
      const t = LAB_TESTS.find((x) => x.key === key)!;
      expect(t.limits?.length, key).toBeGreaterThanOrEqual(3);
      expect(t.limits!.join(" ")).toMatch(/oszacowanie/i);
      expect(t.limits!.join(" ")).toMatch(/klatk/i);
    }
    expect(LAB_TESTS.find((x) => x.key === "broad-jump")!.limits).toBeUndefined(); // pomiar taśmą/linijką – wpisywany ręcznie
    expect(METHOD_LABEL.video_estimate).toMatch(/nie jest to walidowany pomiar/);
    expect(METHOD_LABEL.manual_entry).toBe("wpisane ręcznie");
    expect(VALIDATION_NOTE).toMatch(/My Jump 2/);
    expect(VALIDATION_NOTE).toMatch(/nie został u nas zwalidowany/);
  });
});
