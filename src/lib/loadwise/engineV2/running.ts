import type { RunningRecipe } from "@/lib/running/recipe";
import type { Profile } from "../types";

export function easyRunningRecipe(p: Profile, date: string, seconds: number): RunningRecipe {
  const intensity = {
    zone: "easy" as const,
    rpe: [3, 4] as [number, number],
    label: "Swobodny oddech; rozmawiasz pełnymi zdaniami.",
  };
  return {
    schema: "ballwise-run-recipe-v1",
    id: `v2:easy:${date}`,
    method: "easy_continuous",
    title: "Bieg tlenowy",
    population: p.age < 16 ? "early_youth" : p.age < 18 ? "late_youth" : "adult",
    level: 0,
    paceSource: "effort",
    warmup: {
      seconds: 300,
      label: "Rozgrzewka",
      instruction: "Marsz przechodzący w lekki trucht.",
      intensity,
    },
    blocks: [
      {
        id: "easy",
        label: "Spokojny bieg",
        sets: 1,
        repsPerSet: 1,
        work: { seconds, label: `${seconds / 60} min spokojnie` },
        intensity,
        recovery: { seconds: 0, mode: "walk" },
        setRest: null,
        cue: intensity.label,
      },
    ],
    cooldown: {
      seconds: 300,
      label: "Schłodzenie",
      instruction: "Zwolnij do marszu i uspokój oddech.",
      intensity,
    },
    intensity: "umiarkowana",
    loadLevel: "low",
    evidence: ["foster2001"],
    reasons: [
      "RPE opisuje odczucie wysiłku; nie jest pomiarem MAS.",
      "Czas jest domyślną dawką wprowadzającą produktu, nie indywidualną prognozą adaptacji.",
    ],
  };
}
