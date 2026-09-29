import type { SessionDay, TrainingExercise, TrainingSection } from "@/lib/loadwise/types";

export function sessionFixture(overrides: Partial<SessionDay> = {}): SessionDay {
  return {
    dbId: "session-1",
    date: "2026-09-29",
    dayName: "Wtorek",
    dayType: "training",
    title: "Trening",
    goalLabel: "Technika",
    intensity: "umiarkowana",
    durationMin: 45,
    reason: "",
    safetyNote: null,
    whyToday: "",
    sessionType: "Technika",
    goalOfSession: "Technika",
    riskManaged: "",
    avoidToday: "",
    mdLabel: null,
    slotLabel: null,
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    secondSession: null,
    ...overrides,
  };
}

export function sectionFixture(
  type: TrainingSection["type"],
  exercises: TrainingExercise[],
): TrainingSection {
  return {
    id: type,
    type,
    title: type,
    blocks: [
      {
        id: `${type}-block`,
        title: "BLOK A — Technika",
        blockType: "single",
        intent: "power",
        exercises,
      },
    ],
  };
}

export function sprintSectionsFixture(): TrainingSection[] {
  return [
    sectionFixture("warmup", [
      { id: "ramp", name: "Przygotowanie", speedRole: "preparation", restAfterExercise: "3 s" },
      ...["a_skip", "c_skip", "b_skip", "d_skip"].map((exerciseId) => ({
        id: exerciseId,
        exerciseId,
        name: exerciseId,
      })),
    ]),
    sectionFixture("main", [
      { id: "technical", name: "Drill", speedRole: "technical" },
      { id: "plyo", name: "Skoki", speedRole: "secondary" },
      { id: "resisted", name: "Start", speedRole: "resisted" },
      { id: "main", name: "Sprint", speedRole: "primary" },
      { id: "terminal", name: "Hamowanie", speedRole: "terminal" },
    ]),
    sectionFixture("cooldown", [{ id: "cooldown", name: "Marsz", speedRole: "cooldown" }]),
  ];
}
