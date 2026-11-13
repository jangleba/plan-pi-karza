import { describe, expect, it } from "vitest";
import { OWN_EQUIPMENT_OPTIONS } from "./equipmentOptions";
import { resolveEquipmentId } from "./exerciseLibrary";

describe("onboarding equipment checklist", () => {
  it("maps every strength option to an equipment id the exercise library understands", () => {
    for (const label of OWN_EQUIPMENT_OPTIONS.filter((item) => !/bramk/i.test(item)))
      expect(resolveEquipmentId(label), label).toBeDefined();
  });
});
