// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { FOODS } from "@/lib/fuel/catalog";
import { FoodSketch, MealSketches, WaterGlass } from "./FuelSketches";

function render(ui: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("Fuel sketches", () => {
  it("draws every food of the catalog, hidden from assistive technology", () => {
    for (const food of FOODS) {
      const { container, unmount } = render(<FoodSketch foodId={food.id} />);
      const svg = container.querySelector("svg.fuel-sketch")!;
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.getAttribute("data-role")).toBe(food.role);
      expect(svg.querySelectorAll(".fuel-sketch-line > *").length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("falls back to a role drawing for an unknown food", () => {
    const { container } = render(<FoodSketch foodId="unknown-food" />);
    expect(container.querySelectorAll(".fuel-sketch-line > *").length).toBeGreaterThan(0);
  });

  it("shows each ingredient once, at most four, and nothing for an empty meal", () => {
    const { container } = render(
      <MealSketches foodIds={["skyr", "banana", "banana", "rice", "bread", "honey"]} />,
    );
    expect(container.querySelectorAll(".fuel-sketch")).toHaveLength(4);
    expect(render(<MealSketches foodIds={[]} />).container.firstChild).toBeNull();
  });

  it("keeps the water level between empty and full", () => {
    const level = (ml: number) =>
      render(<WaterGlass ml={ml} />)
        .container.querySelector<SVGElement>("svg")!
        .style.getPropertyValue("--level");
    expect(level(-50)).toBe("0");
    expect(level(750)).toBe("0.5");
    expect(level(9000)).toBe("1");
  });
});
