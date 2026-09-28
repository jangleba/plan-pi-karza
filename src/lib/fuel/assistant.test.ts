import { describe, expect, it } from "vitest";

import { parseFuelIngredients, recommendFuelMeals } from "./assistant";

describe("Fuel assistant", () => {
  it("rozpoznaje składniki z naturalnego zdania", () => {
    const parsed = parseFuelIngredients("Mam skyr, banana i płatki owsiane");

    expect(parsed.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(["skyr", "banana", "oats"]),
    );
  });

  it("po wysiłku proponuje szybki posiłek z dostępnych produktów", () => {
    const ingredients = parseFuelIngredients("skyr banan płatki owsiane");
    const [recommendation] = recommendFuelMeals({
      ingredients: ingredients.items,
      moment: "after",
      load: "high",
    });

    expect(recommendation.title).toBeTruthy();
    expect(recommendation.why.toLowerCase()).toMatch(/regener|wysił|uzupeł|sesj/);
    expect(`${recommendation.title} ${recommendation.why}`).not.toMatch(/kcal|kalori/i);
  });
});
