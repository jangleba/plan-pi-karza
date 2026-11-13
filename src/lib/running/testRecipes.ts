/**
 * Test-only recipes for the run counter. Captured from the removed running
 * prescription (20 y, intermediate, endurance, preseason, 60 min; and 24 y,
 * advanced, speed, in season) so counter tests keep real, valid recipes.
 */
import type { RunningRecipe } from "./recipe";

export const INTERVAL_RECIPE: RunningRecipe = {
  schema: "ballwise-run-recipe-v1",
  method: "aerobic_intervals",
  title: "Długie interwały tlenowe",
  population: "adult",
  level: 0,
  paceSource: "effort",
  warmup: {
    seconds: 600,
    label: "Rozgrzewka",
    instruction: "Lekki trucht. W ostatnich 2 minutach 3 przebieżki po 15 s.",
    intensity: {
      zone: "easy",
      rpe: [3, 4],
      label: "Spokojnie — rozmawiasz pełnymi zdaniami (RPE 3–4/10)",
    },
  },
  blocks: [
    {
      id: "aerobic_intervals",
      label: "Odcinki",
      sets: 1,
      repsPerSet: 4,
      work: {
        seconds: 180,
        label: "3 min",
      },
      intensity: {
        zone: "vo2",
        rpe: [8, 8],
        label: "Bardzo mocno i równo — tylko pojedyncze słowa (RPE 8/10)",
      },
      recovery: {
        seconds: 180,
        mode: "jog",
      },
      setRest: null,
      cue: "Nie ścigaj pierwszego odcinka. Ostatni ma być równie mocny.",
    },
  ],
  cooldown: {
    seconds: 360,
    label: "Schłodzenie",
    instruction: "Bardzo lekki trucht, na końcu marsz.",
    intensity: {
      zone: "easy",
      rpe: [3, 4],
      label: "Spokojnie — rozmawiasz pełnymi zdaniami (RPE 3–4/10)",
    },
  },
  intensity: "wysoka",
  loadLevel: "high",
  evidence: ["helgerud2001", "mcmillan2005", "buchheit2013a"],
  reasons: [
    "poziom: hard",
    "brak kolizji z klubem, meczem, siłą i sprintem",
    "cel: endurance",
    "okres: preseason",
  ],
  id: "run-aerobic_intervals-9ec7048",
};

export const HIIT_RECIPE: RunningRecipe = {
  schema: "ballwise-run-recipe-v1",
  method: "short_hiit",
  title: "Krótkie interwały 15/15",
  population: "adult",
  level: 3,
  paceSource: "effort",
  warmup: {
    seconds: 600,
    label: "Rozgrzewka",
    instruction: "Lekki trucht. W ostatnich 2 minutach 3 przebieżki po 15 s.",
    intensity: {
      zone: "easy",
      rpe: [3, 4],
      label: "Spokojnie — rozmawiasz pełnymi zdaniami (RPE 3–4/10)",
    },
  },
  blocks: [
    {
      id: "short_hiit",
      label: "Odcinki",
      sets: 3,
      repsPerSet: 12,
      work: {
        seconds: 15,
        label: "15 s",
      },
      intensity: {
        zone: "hiit",
        rpe: [8, 9],
        label: "Mocno i równo, bez sprintu na maksa (RPE 8–9/10)",
      },
      recovery: {
        seconds: 15,
        mode: "passive",
      },
      setRest: {
        seconds: 180,
        mode: "walk",
      },
      cue: "Każde 15 s równo mocno. To nie jest sprint maksymalny.",
    },
  ],
  cooldown: {
    seconds: 360,
    label: "Schłodzenie",
    instruction: "Bardzo lekki trucht, na końcu marsz.",
    intensity: {
      zone: "easy",
      rpe: [3, 4],
      label: "Spokojnie — rozmawiasz pełnymi zdaniami (RPE 3–4/10)",
    },
  },
  intensity: "wysoka",
  loadLevel: "high",
  evidence: ["dupont2004", "buchheit2013a", "engel2018"],
  reasons: [
    "poziom: hard",
    "brak kolizji z klubem, meczem, siłą i sprintem",
    "cel: speed",
    "okres: in_season",
  ],
  id: "run-short_hiit-6c5b8fe8",
};
