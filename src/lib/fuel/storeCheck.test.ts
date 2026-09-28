import { describe, expect, it } from "vitest";

import { evaluateStoreProduct } from "./storeCheck";

describe("Store Check", () => {
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
