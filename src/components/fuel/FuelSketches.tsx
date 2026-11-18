/** Pastel line sketches for Fuel: one quiet drawing per food, and a glass that fills with water.
 * Decorative only: never the carrier of information (names and amounts stay in the text beside them). */
import type { CSSProperties, ReactNode } from "react";
import { FOOD_BY_ID, type FoodRole } from "@/lib/fuel/catalog";

type Glyph = () => ReactNode;

/** Drawn on a 48 × 48 board, centred at 24 24, inside a 44-unit pastel disc. */
const GLYPHS: Record<string, Glyph> = {
  banana: () => (
    <>
      <path d="M13 17c1 12 8 20 21 19 3 0 5-1 5-3-9 1-17-3-20-14l-1-4z" />
      <path d="M14 15l-1-3M38 33l1 2" />
    </>
  ),
  apple: () => (
    <>
      <path d="M24 17c-5-4-12-1-12 7 0 7 5 13 9 13 2 0 2-1 3-1s1 1 3 1c4 0 9-6 9-13 0-8-7-11-12-7z" />
      <path d="M24 17c0-3 1-5 3-6M24 14c-2-3-5-3-7-2 2 3 5 3 7 2z" />
    </>
  ),
  berries: () => (
    <>
      <path d="M12 19c0-3 4-5 12-5s12 2 12 5c0 9-6 16-12 18-6-2-12-9-12-18z" />
      <path d="M20 12l4 3 4-3M20 22v1M28 22v1M24 27v1M19 29v1M29 29v1" />
    </>
  ),
  bowl: () => (
    <>
      <path d="M10 24h28c0 8-6 14-14 14s-14-6-14-14z" />
      <path d="M17 20c1-2 3-3 4-3M25 19c1-2 3-3 4-3M31 21c1-1 2-2 3-2" strokeDasharray="1 3" />
    </>
  ),
  bread: () => (
    <>
      <path d="M11 21c0-5 6-8 13-8s13 3 13 8c0 2-1 3-2 3v10H13V24c-1 0-2-1-2-3z" />
      <path d="M19 19l2 5M26 18l2 5" />
    </>
  ),
  wrap: () => (
    <>
      <path d="M13 31l17-17c3-3 8 1 5 4L19 34c-2 2-7 0-6-3z" />
      <path d="M19 25l6 6" />
    </>
  ),
  potato: () => (
    <>
      <path d="M12 26c-1-8 6-13 14-12 9 1 11 8 9 14-2 6-10 8-16 6-4-1-6-4-7-8z" />
      <path d="M20 22v1M28 21v1M25 29v1" />
    </>
  ),
  ricecakes: () => (
    <>
      <circle cx="24" cy="24" r="12" />
      <path d="M19 20v1M24 18v1M29 20v1M17 25v1M22 24v1M27 25v1M32 25v1M20 30v1M26 30v1" />
    </>
  ),
  eggs: () => (
    <>
      <path d="M24 12c-6 0-10 8-10 14a10 10 0 0 0 20 0c0-6-4-14-10-14z" />
      <path d="M19 28c0 3 2 5 5 5" />
    </>
  ),
  meat: () => (
    <>
      <path d="M14 14c5-4 13-1 16 5s0 11-5 11c-3 0-4-2-6-4s-4-3-5-6 0-4 0-6z" />
      <path d="M26 30l7 7M30 33l3-3" />
    </>
  ),
  fish: () => (
    <>
      <path d="M10 24c5-7 13-9 20-5l8-5v20l-8-5c-7 4-15 2-20-5z" />
      <circle cx="18" cy="22" r=".8" />
    </>
  ),
  cup: () => (
    <>
      <path d="M14 18h20l-2 18H16z" />
      <path d="M13 18h22M17 13h14v5" />
      <path d="M18 26c4 2 8-2 12 0" />
    </>
  ),
  carton: () => (
    <>
      <path d="M16 18l8-6 8 6v22H16z" />
      <path d="M16 18h16M21 26h6v5h-6z" />
    </>
  ),
  tofu: () => (
    <>
      <path d="M12 21l12-6 12 6v10l-12 6-12-6z" />
      <path d="M12 21l12 6 12-6M24 27v10" />
    </>
  ),
  chickpeas: () => (
    <>
      <circle cx="18" cy="20" r="6" />
      <circle cx="30" cy="22" r="6" />
      <circle cx="23" cy="32" r="6" />
    </>
  ),
  tomato: () => (
    <>
      <circle cx="24" cy="27" r="12" />
      <path d="M17 17l7 3 7-3M24 20v-6" />
    </>
  ),
  cucumber: () => (
    <>
      <rect x="9" y="19" width="30" height="12" rx="6" transform="rotate(-25 24 25)" />
      <path d="M20 24v1M25 22v1M29 20v1" />
    </>
  ),
  lettuce: () => (
    <>
      <path d="M24 38c-9 0-14-6-13-14 3-1 6 0 8 2-1-5 1-10 5-13 4 3 6 8 5 13 2-2 5-3 8-2 1 8-4 14-13 14z" />
      <path d="M24 38V22" />
    </>
  ),
  juice: () => (
    <>
      <path d="M15 15h18l-2 21H17z" />
      <path d="M16 22h16" />
      <circle cx="33" cy="16" r="5" />
      <path d="M31 14l4 4" />
    </>
  ),
  nuts: () => (
    <>
      <path d="M13 25c0-8 6-12 9-9s2 9-2 13-7 3-7-4z" />
      <path d="M26 31c0-7 6-11 9-8s1 9-3 12-6 2-6-4z" />
    </>
  ),
  avocado: () => (
    <>
      <path d="M24 10c-5 0-6 7-9 12s-2 14 9 14 12-9 9-14-4-12-9-12z" />
      <circle cx="24" cy="28" r="4.5" />
    </>
  ),
  jar: () => (
    <>
      <rect x="14" y="20" width="20" height="17" rx="4" />
      <path d="M16 20v-4h16v4M19 27h10" />
    </>
  ),
  honey: () => (
    <>
      <rect x="14" y="21" width="20" height="16" rx="4" />
      <path d="M16 21v-5h16v5M24 21v7a2 2 0 0 1-4 0" />
    </>
  ),
};

const FOOD_GLYPH: Record<string, keyof typeof GLYPHS> = {
  rice: "bowl",
  pasta: "bowl",
  oats: "bowl",
  bread: "bread",
  wrap: "wrap",
  potato: "potato",
  ricecakes: "ricecakes",
  eggs: "eggs",
  chicken: "meat",
  turkey: "meat",
  tuna: "fish",
  skyr: "cup",
  yogurt: "cup",
  cottage: "cup",
  kefir: "carton",
  milk: "carton",
  tofu: "tofu",
  chickpeas: "chickpeas",
  banana: "banana",
  apple: "apple",
  berries: "berries",
  tomato: "tomato",
  cucumber: "cucumber",
  lettuce: "lettuce",
  juice: "juice",
  nuts: "nuts",
  avocado: "avocado",
  honey: "honey",
  jam: "jar",
};
const ROLE_GLYPH: Record<FoodRole, keyof typeof GLYPHS> = {
  carb: "bowl",
  protein: "cup",
  fruit: "apple",
  vegetable: "lettuce",
  fat: "nuts",
  fluid: "juice",
};

/** One pastel drawing of a food. `delay` staggers the pop-in when several are shown together. */
export function FoodSketch({ foodId, index = 0 }: { foodId: string; index?: number }) {
  const role = FOOD_BY_ID[foodId]?.role ?? "carb";
  const Glyph = GLYPHS[FOOD_GLYPH[foodId] ?? ROLE_GLYPH[role]]!;
  return (
    <svg
      className="fuel-sketch"
      data-role={role}
      data-food={foodId}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      style={{ "--i": index } as CSSProperties}
    >
      <circle className="fuel-sketch-disc" cx="24" cy="24" r="22" />
      <g
        className="fuel-sketch-line"
        fill="none"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Glyph />
      </g>
    </svg>
  );
}

/** The meal as a quiet row of overlapping pastel drawings: one per distinct ingredient. */
export function MealSketches({ foodIds }: { foodIds: readonly string[] }) {
  const unique = [...new Set(foodIds)].slice(0, 4);
  if (!unique.length) return null;
  return (
    <div className="fuel-meal-sketches" aria-hidden="true" data-count={unique.length}>
      {unique.map((id, i) => (
        <FoodSketch key={id} foodId={id} index={i} />
      ))}
    </div>
  );
}

/** A glass that fills with the day's water. A drawing, not a goal: the amount is always printed beside it. */
export function WaterGlass({ ml, fullMl = 1500 }: { ml: number; fullMl?: number }) {
  const level = Math.max(0, Math.min(1, ml / fullMl));
  return (
    <svg
      className="fuel-glass"
      viewBox="0 0 32 40"
      width="30"
      height="38"
      aria-hidden="true"
      focusable="false"
      style={{ "--level": level } as CSSProperties}
    >
      <defs>
        <clipPath id="fuel-glass-clip">
          <path d="M5 5h22l-2.4 29a3 3 0 0 1-3 2.7H10.4a3 3 0 0 1-3-2.7z" />
        </clipPath>
      </defs>
      <g clipPath="url(#fuel-glass-clip)">
        <rect className="fuel-glass-water" x="0" y="4" width="32" height="34" />
        <path className="fuel-glass-wave" d="M-8 6q4-3 8 0t8 0 8 0 8 0 8 0v4h-48z" />
      </g>
      <path
        className="fuel-glass-line"
        d="M5 5h22l-2.4 29a3 3 0 0 1-3 2.7H10.4a3 3 0 0 1-3-2.7z"
        fill="none"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
