import { describe, it, expect } from "vitest";
import { productRestrictionCheck } from "./allergens";
import { evaluateStoreProduct } from "./storeCheck";

describe("product restrictions across languages and incomplete labels", () => {
  it.each([
    ["en:crustaceans", "krewetki"],
    ["en:molluscs", "małże"],
    ["en:milk", "nabiał"],
    ["en:eggs", "jaja"],
    ["en:peanuts", "orzechy ziemne"],
    ["en:nuts", "migdały"],
    ["en:sesame-seeds", "sezam"],
    ["en:celery", "seler"],
    ["en:mustard", "gorczyca"],
    ["en:soybeans", "soja"],
    ["en:fish", "ryby"],
    ["en:lupin", "łubin"],
    ["en:sulphur-dioxide-and-sulphites", "siarczyny"],
    ["en:wheat", "gluten"],
  ])("detects %s against %s even for an unknown product", (tag, restriction) => {
    expect(
      productRestrictionCheck({
        name: "Mix",
        allergens: [tag],
        restrictions: [restriction],
        diet: "all",
      }),
    ).toBe("conflict");
  });
  it("refuses a confident recommendation with missing composition or an unknown allergen tag", () => {
    for (const product of [
      { name: "Mix" },
      { name: "Mix", ingredientsText: "ryż", allergens: ["en:unmapped"] },
    ]) {
      expect(
        evaluateStoreProduct({
          product: {
            ...product,
            source: "openfoodfacts",
            nutriments: { carbohydrates100g: 40, protein100g: 15 },
          },
          moment: "after",
          load: "moderate",
          restrictions: ["krewetki"],
        }).label,
      ).toBe("Sprawdź skład");
    }
  });
  it("keeps conflict priority above missing nutritional data and supports English animal ingredients", () => {
    expect(
      productRestrictionCheck({
        name: "Chicken Wrap",
        ingredientsText: "wheat, chicken",
        restrictions: [],
        diet: "vegan",
      }),
    ).toBe("conflict");
    expect(
      evaluateStoreProduct({
        product: { name: "Mix", allergens: ["en:crustaceans"] },
        moment: "before",
        load: "low",
        restrictions: ["krewetki"],
      }).label,
    ).toBe("Sprawdź ograniczenia");
  });
});
