import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

// Loadwise weekly minimum requirements. Pure logic mirroring the engine's
// weekly-requirement rules, no private data or env access.

const GOALS = ["speed", "strength", "endurance", "power", "general", "matchready", "return"] as const;

export default defineTool({
  name: "weekly_plan_shape",
  title: "Kształt tygodnia treningowego",
  description:
    "Wylicza minimalne wymagania tygodniowe Loadwise (siła, szybkość, wydolność, piłka, prehab) na podstawie celu, liczby treningów klubowych i obecności meczu. Zawsze wymaga min. 1 wydolności.",
  inputSchema: {
    goal: z.enum(GOALS).describe("Główny cel zawodnika."),
    clubTrainingDays: z.number().describe("Liczba treningów klubowych w tygodniu."),
    hasMatch: z.boolean().describe("Czy w tygodniu jest mecz."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ goal, clubTrainingDays, hasMatch }) => {
    const club = Math.max(0, Math.round(clubTrainingDays));
    const req = { speed: 1, strength: 1, endurance: 1, ball: 1, prehab: 2 };

    if (goal === "speed") req.speed = 2;
    if (goal === "strength") req.strength = 2;
    if (goal === "endurance") req.endurance = 2;
    if (goal === "return") {
      req.speed = 0;
      req.strength = 1;
      req.endurance = 1;
      req.prehab = 3;
    }

    // Ciężki tydzień klubowy: klub jest głównym obciążeniem.
    if (club >= 4) {
      req.strength = Math.min(req.strength, 1);
      req.endurance = 1; // twarda zasada: zawsze min. 1 wydolności
      req.speed = Math.min(req.speed, 1);
    } else if (club >= 3) {
      req.strength = Math.min(req.strength, goal === "strength" ? 2 : 1);
    }

    // Endurance ZAWSZE minimum 1, niezależnie od celu/klubu.
    req.endurance = Math.max(1, req.endurance);

    const note = hasMatch
      ? "Tydzień meczowy: taper w ostatnich 48h, unikaj twardej kondycji MD-2/MD-1."
      : "Tydzień bez meczu: 2–3 dni rozwojowe, nie łącz twardego sprintu z ciężkimi nogami.";

    const text = [
      `Minimalne wymagania tygodnia (cel: ${goal}, klub: ${club}, mecz: ${hasMatch ? "tak" : "nie"}):`,
      `- Szybkość: ${req.speed}`,
      `- Siła: ${req.strength}`,
      `- Wydolność: ${req.endurance} (zawsze min. 1)`,
      `- Piłka: ${req.ball}`,
      `- Prehab/mobilność: ${req.prehab}`,
      note,
    ].join("\n");

    return {
      content: [{ type: "text", text }],
      structuredContent: { requirements: req, note },
    };
  },
});
