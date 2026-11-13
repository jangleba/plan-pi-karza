import { describe, expect, it } from "vitest";
import { OWN_EQUIPMENT_OPTIONS } from "./equipmentOptions";
import { resolveEquipmentId } from "./exerciseLibrary";

describe("onboarding equipment checklist", () => {
  it("maps every strength option to an equipment id the exercise library understands", () => {
    for (const label of OWN_EQUIPMENT_OPTIONS.filter(
      (item) => !/bramk/i.test(item) && item !== "Piłka nożna",
    ))
      expect(resolveEquipmentId(label), label).toBeDefined();
  });
  it("lets the existing checklist declare a football independently of strength equipment", () => {
    expect(OWN_EQUIPMENT_OPTIONS.filter((label) => label === "Piłka nożna")).toHaveLength(1);
    expect(OWN_EQUIPMENT_OPTIONS).toContain("Piłka lekarska");
  });
});
