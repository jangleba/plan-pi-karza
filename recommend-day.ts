import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

// Loadwise decision engine: MD proximity + readiness + goal -> day recommendation.
// Pure logic, no private data or env access.

const GOALS = [
  "speed",
  "strength",
  "endurance",
  "power",
  "agility",
  "general",
  "mobility",
  "return",
  "matchready",
] as const;

function readinessAdjustment(readiness: number): string {
  if (readiness >= 8) return "Utrzymaj zaplanowaną sesję, możliwa mała progresja.";
  if (readiness >= 6) return "Zmniejsz objętość o 10–20%.";
  if (readiness >= 4)
    return "Zmniejsz objętość o 30–40%, usuń twarde sprinty, plyo i ciężkie dolne partie.";
  return "Tylko regeneracja: mobilność, oddech, łatwy spacer.";
}

function dayByMatchProximity(mdRelation: string, goal: string): { type: string; guidance: string } {
  switch (mdRelation) {
    case "MD":
      return { type: "match_day", guidance: "Mecz lub monitoring. Bez dodatkowego treningu." };
    case "MD-1":
      return {
        type: "primer_day",
        guidance:
          "20–30 min, niska intensywność. Mobilność, aktywacja, 3–5 krótkich submax akceleracji. Bez ciężkich nóg i twardych sprintów.",
      };
    case "MD-2":
      return {
        type: "md_minus_2_sharpness",
        guidance: "30–45 min, niska/umiarkowana. Ostrość z piłką, lekka szybkość, aktywacja.",
      };
    case "MD+1":
      return {
        type: "recovery_day",
        guidance: "Regeneracja, jeśli zagrano >60 min. Kompensacja, jeśli <30 min i gotowy.",
      };
    case "MD-3":
    case "MD-4":
    default:
      if (goal === "speed") return { type: "speed_day", guidance: "Najlepszy dzień na szybkość. Twardy sprint ≤240 m." };
      if (goal === "strength")
        return { type: "strength_day", guidance: "Najlepszy dzień na siłę. Unikaj ciężkich dolnych partii 48h przed meczem." };
      if (goal === "endurance")
        return { type: "endurance_day", guidance: "Praca tlenowa/tempo/interwały z dala od meczu." };
      return { type: "football_ball_day", guidance: "Rozwój techniczny i pracy z piłką." };
  }
}

export default defineTool({
  name: "recommend_day_pattern",
  title: "Rekomendacja dnia treningowego",
  description:
    "Rekomenduje typ dnia treningowego Loadwise na podstawie relacji do meczu (MD), celu zawodnika i gotowości (readiness 1–10).",
  inputSchema: {
    mdRelation: z
      .enum(["MD", "MD-1", "MD-2", "MD-3", "MD-4", "MD+1", "none"])
      .describe("Relacja do dnia meczu, np. MD-3. 'none' gdy brak meczu w tygodniu."),
    goal: z.enum(GOALS).describe("Główny cel zawodnika."),
    readiness: z.number().describe("Gotowość zawodnika w skali 1–10."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ mdRelation, goal, readiness }) => {
    const clamped = Math.max(1, Math.min(10, Math.round(readiness)));
    const day = dayByMatchProximity(mdRelation === "none" ? "MD-3" : mdRelation, goal);
    const adjustment = readinessAdjustment(clamped);
    const text = [
      `Typ dnia: ${day.type}`,
      `Wytyczne: ${day.guidance}`,
      `Korekta wg gotowości (${clamped}/10): ${adjustment}`,
      clamped <= 3 ? "Uwaga: niska gotowość nadpisuje cel — priorytet to regeneracja." : "",
    ]
      .filter(Boolean)
      .join("\n");
    return {
      content: [{ type: "text", text }],
      structuredContent: { dayType: day.type, guidance: day.guidance, readinessAdjustment: adjustment, readiness: clamped },
    };
  },
});
