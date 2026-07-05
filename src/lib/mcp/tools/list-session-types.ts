import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

// Loadwise session library catalog. Pure static reference data.

const SESSIONS: Record<string, { title: string; summary: string }[]> = {
  strength: [
    { title: "STRENGTH_TECHNIQUE", summary: "U13–U15/początkujący. Technika, masa ciała, koordynacja. Bez maksów." },
    { title: "STRENGTH_DEVELOPMENT", summary: "16+/zaawansowana młodzież. Wzorce ruchowe, 1–3 RIR." },
    { title: "STRENGTH_MAINTENANCE", summary: "W sezonie. 25–40 min, utrzymanie siły + robustness." },
    { title: "POWER_PLYO_SUPPORT", summary: "Zaawansowani, zdrowi. Niska objętość skoków/rzutów." },
  ],
  speed: [
    { title: "ACCELERATION", summary: "6×10 m / 4×15 m / 3×20 m, transfer z piłką. Limit 240 m." },
    { title: "MAX_VELOCITY", summary: "Flying 20s, pełny odpoczynek. Tylko gdy świeży." },
    { title: "SPEED_MICRODOSE", summary: "15–25 min. W sezonie / MD-2. Ekspozycja bez zmęczenia." },
    { title: "REPEATED_SPRINT_SUPPORT", summary: "Starsi/zaawansowani, z dala od meczu." },
  ],
  endurance: [
    { title: "EASY_AEROBIC", summary: "20–40 min, niska intensywność, regeneracja/baza." },
    { title: "TEMPO_EXTENSIVE", summary: "6–10×100 m tempo lub 2–4×4 min kontrolowane." },
    { title: "INTERVAL_HIIT", summary: "Starsi/zaawansowani. Z dala od meczu." },
    { title: "FOOTBALL_CONDITIONING", summary: "Wahadłowce, obwody z piłką." },
    { title: "RECOVERY_RUN", summary: "10–25 min bardzo niska, opcjonalnie MD+1." },
  ],
  ball: [
    { title: "FOOTBALL_SHARPNESS", summary: "MD-2. Pierwszy kontakt, skanowanie, akcja pozycyjna." },
    { title: "TECHNICAL_DEVELOPMENT", summary: "Tydzień bez meczu. Mistrzostwo piłki, słaba noga." },
    { title: "POSITION_SPECIFIC_BALL", summary: "Trening zależny od pozycji." },
    { title: "BALL_MASTERY_LIGHT", summary: "Regeneracja/MD-1. 15–30 min niska." },
    { title: "FINISHING_SESSION", summary: "Napastnicy/skrzydłowi. Wykończenie." },
    { title: "SOLO_GAMELIKE_SESSION", summary: "Trening solo, match-like." },
  ],
};

export default defineTool({
  name: "list_session_types",
  title: "Biblioteka sesji Loadwise",
  description:
    "Zwraca bibliotekę typów sesji treningowych Loadwise. Opcjonalnie filtruje po kategorii (strength, speed, endurance, ball).",
  inputSchema: {
    category: z
      .enum(["strength", "speed", "endurance", "ball", "all"])
      .describe("Kategoria sesji do wylistowania, 'all' zwraca wszystkie."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ category }) => {
    const entries =
      category === "all" ? Object.entries(SESSIONS) : [[category, SESSIONS[category] ?? []] as const];
    const text = entries
      .map(([cat, list]) => `## ${cat}\n${list.map((s) => `- ${s.title}: ${s.summary}`).join("\n")}`)
      .join("\n\n");
    return {
      content: [{ type: "text", text }],
      structuredContent: { categories: Object.fromEntries(entries) },
    };
  },
});
