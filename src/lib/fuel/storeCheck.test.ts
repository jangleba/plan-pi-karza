import { describe, expect, it } from "vitest";

import { evaluateStoreProduct } from "./storeCheck";

describe("Store Check", () => {
  it("counts the carbohydrate in a 500 ml isotonic drink rather than treating it as water", () => {
    const result = evaluateStoreProduct({
      product: {
        name: "Napój izotoniczny",
        source: "label",
        nutritionUnit: "ml",
        nutriments: { carbohydrates100g: 6, protein100g: 0, fat100g: 0 },
      },
      moment: "before",
      load: "high",
      portion: 500,
      unit: "ml",
    });
    expect(result.verdict).toBe("good");
    expect(result.reason).not.toContain("Nie zastępuje");
  });
  it("uses the actual fat portion and rejects mismatched nutrition units", () => {
    const product = {
      name: "Masło orzechowe",
      source: "label" as const,
      nutritionUnit: "g" as const,
      nutriments: { carbohydrates100g: 20, protein100g: 20, fat100g: 50 },
    };
    expect(
      evaluateStoreProduct({
        product,
        moment: "before",
        load: "moderate",
        minutesToStart: 60,
        portion: 10,
        unit: "g",
      }).verdict,
    ).not.toBe("swap");
    expect(
      evaluateStoreProduct({
        product,
        moment: "before",
        load: "moderate",
        portion: 100,
        unit: "ml",
      }).verdict,
    ).toBe("unknown");
  });
  it("akceptuje pełniejszą kanapkę po wysiłku", () => {
    expect(
      evaluateStoreProduct({
        product: { name: "wrap z kurczakiem" },
        moment: "after",
        load: "moderate",
      }).verdict,
    ).toBe("good");
  });

  it("do skyru po wysiłku proponuje prosty dodatek", () => {
    const result = evaluateStoreProduct({
      product: { name: "skyr naturalny" },
      moment: "after",
      load: "moderate",
    });

    expect(result.verdict).toBe("add");
    expect(result.addition).toBeTruthy();
  });

  it("przed wysiłkiem odradza ciężką przekąskę i daje zamiennik", () => {
    const result = evaluateStoreProduct({
      product: { name: "chipsy paprykowe" },
      moment: "before",
      load: "high",
    });

    expect(result.verdict).toBe("swap");
    expect(result.replacement).toMatch(/banan|bułka|skyr/i);
  });

  it("nie udaje pewności przy nieznanym produkcie", () => {
    expect(
      evaluateStoreProduct({
        product: { name: "produkt xyz" },
        moment: "ordinary",
        load: "low",
      }).verdict,
    ).toBe("unknown");
  });
});
