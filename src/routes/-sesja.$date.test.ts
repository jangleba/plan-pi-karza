import { describe, expect, it } from "vitest";
import type { SessionDay, TrainingSection } from "@/lib/loadwise/types";
import {
  buildSprintRunnerBlocks,
  canShowPostSessionForm,
  formatSprintPrescription,
  isSprintRunnerSession,
  SPRINT_RUNNER_CONTAINER_CLASS,
  shortDecisionNote,
  statusBadgeLabel,
} from "./sesja.$date";

function baseSession(overrides: Partial<SessionDay> = {}): SessionDay {
  return {
    date: "2026-08-17",
    dayName: "Poniedziałek",
    dayType: "club",
    title: "Trening klubowy",
    goalLabel: "",
    intensity: "umiarkowana",
    durationMin: 90,
    reason: "",
    safetyNote: null,
    whyToday: "",
    sessionType: "Klub",
    goalOfSession: "",
    riskManaged: "",
    avoidToday: "",
    mdLabel: null,
    slotLabel: null,
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    secondSession: null,
    ...overrides,
  } as SessionDay;
}

describe("sesja details view-model", () => {
  it("pokazuje współdzielony status adaptacji zamiast surowej intensywności", () => {
    const session = baseSession({ loadLabelOverride: "Ogranicz obciążenie" });
    expect(statusBadgeLabel(session)).toBe("Ogranicz obciążenie");
  });

  it("pokazuje pełne ostrzeżenie bezpieczeństwa dla niskiej gotowości", () => {
    const fullWarning =
      "Niska gotowość — zgłoś ją trenerowi przed treningiem i ogranicz obciążenie zgodnie z jego decyzją. Przerwij wysiłek, jeśli pojawi się lub nasili ból.";
    const session = baseSession({
      loadLabelOverride: "Ogranicz obciążenie",
      safetyNote: fullWarning,
    });
    expect(shortDecisionNote(session)).toBe(fullWarning);
  });

  it("renderuje dokładnie jeden kanoniczny formularz completion/monitoring", () => {
    const session = baseSession({ dbId: "session-1" });
    expect(canShowPostSessionForm(session)).toBe(true);
  });
});

function sprintSectionsFixture(): TrainingSection[] {
  return [
    {
      id: "warmup",
      title: "Przygotowanie",
      type: "warmup",
      blocks: [
        {
          id: "ramp",
          title: "RAMP",
          blockType: "single",
          intent: "mobility",
          exercises: [
            {
              id: "ramp-1",
              exerciseId: "a_march",
              name: "AKTYWACJA",
              reps: "8–10 min",
              restAfterExercise: "Bez przerw",
            },
          ],
        },
        ...(
          ["a_skip", "c_skip", "b_skip", "d_skip", "a_skip", "c_skip", "b_skip", "d_skip"] as const
        ).map((exerciseId, i) => ({
          id: `skip-${i}`,
          title: "Skip flow",
          blockType: "single" as const,
          intent: "power" as const,
          exercises: [
            {
              id: `skip-ex-${i}`,
              exerciseId,
              name: i < 4 ? `KONTROLA ${i}` : `DYNAMICZNE ${i}`,
              displayPrescription: "1 seria × 2 × 15–20 m powt. · 2 × 15–20 m",
              reps: "2 × 15–20 m",
              restAfterExercise: "Przerwa 30 s",
            },
          ],
        })),
      ],
    },
    {
      id: "main",
      title: "Bloki szybkości",
      type: "main",
      blocks: [
        {
          id: "drill-1",
          title: "Drill",
          blockType: "single",
          intent: "power",
          exercises: [
            {
              id: "drill-ex-1",
              exerciseId: "a_switch_progression",
              name: "TECHNIKA A",
              reps: "2 × 3 / strona",
              restAfterExercise: "Przerwa 30–45 s",
            },
          ],
        },
        {
          id: "plyo",
          title: "Krótki blok plyometryczny",
          blockType: "single",
          intent: "power",
          exercises: [
            {
              id: "plyo-ex",
              exerciseId: "scissor_bounds",
              name: "SPRĘŻ...",
              reps: "3 × 4 kontakty",
              restAfterExercise: "Przerwa 60 s",
            },
          ],
        },
        {
          id: "primary",
          title: "Główny bodziec",
          blockType: "single",
          intent: "power",
          exercises: [
            {
              id: "main-ex",
              exerciseId: "free_acceleration_sprint",
              name: "AKTY...",
              reps: "4 × 20 m z najazdu 15 m",
              purpose: "Główny bodziec: maksymalne przyspieszenie.",
            },
          ],
        },
        {
          id: "terminal",
          title: "Hamowanie",
          blockType: "single",
          intent: "braking",
          exercises: [
            {
              id: "terminal-ex",
              exerciseId: "progressive_deceleration_5_10_15",
              name: "KONTROLO...",
              reps: "2 × 5–10 m",
            },
          ],
        },
        {
          id: "cooldown",
          title: "Wyciszenie",
          blockType: "single",
          intent: "mobility",
          exercises: [
            {
              id: "cooldown-ex",
              exerciseId: "a_march",
              name: "Wyciszenie",
              reps: "5 min",
            },
          ],
        },
      ],
    },
  ];
}

describe("sprint runner layout", () => {
  it("renderuje 7 bloków w poprawnej kolejności", () => {
    const blocks = buildSprintRunnerBlocks(sprintSectionsFixture());
    expect(blocks.map((block) => `${block.index} ${block.title}`)).toEqual([
      "01 Przygotowanie RAMP",
      "02 Skipy A → C → B → D",
      "03 Drille techniczne",
      "04 Plyometria",
      "05 Sprint główny",
      "06 Hamowanie / zwrotność / łuk",
      "07 Wyciszenie",
    ]);
  });

  it("pokazuje pełne nazwy Skip A/C/B/D i scala serie w cztery pozycje", () => {
    const skipBlock = buildSprintRunnerBlocks(sprintSectionsFixture())[1];
    expect(skipBlock.exercises.map((exercise) => exercise.canonicalName)).toEqual([
      "Skip A",
      "Skip C",
      "Skip B",
      "Skip D",
    ]);
    expect(skipBlock.exercises).toHaveLength(4);
  });

  it("usuwa duplikacje i zbędne oznaczenia w dawce", () => {
    const skipPrescription =
      buildSprintRunnerBlocks(sprintSectionsFixture())[1].exercises[0].prescription;
    expect(skipPrescription).toBe("2 × 15–20 m");
    expect(skipPrescription).not.toMatch(/seria|powt\.|·/i);
    expect(
      formatSprintPrescription({
        id: "x",
        displayPrescription: "1 seria × 2 × 15–20 m powt. · 2 × 15–20 m",
        name: "x",
      }),
    ).toBe("2 × 15–20 m");
    expect(
      formatSprintPrescription({
        id: "y",
        displayPrescription: "4 × 20 m · 90 s przerwy",
        name: "y",
      }),
    ).toBe("4 × 20 m · 90 s przerwy");
    expect(
      formatSprintPrescription({
        id: "z",
        name: "z",
        reps: "2 × 15–20 m",
        duration: "2 × 15–20 m",
      }),
    ).toBe("2 × 15–20 m");
  });

  it("używa nazw kanonicznych zamiast etykiet intencji", () => {
    const blocks = buildSprintRunnerBlocks(sprintSectionsFixture());
    expect(blocks[0].exercises[0].canonicalName).toBe("Marsz A");
    expect(blocks[4].exercises[0].canonicalName).toBe("Swobodny sprint akceleracyjny");
  });

  it("przetwarza dane sprintowe bez mutowania sesji źródłowej", () => {
    const input = sprintSectionsFixture();
    const before = JSON.parse(JSON.stringify(input));
    const blocks = buildSprintRunnerBlocks(input);
    expect(blocks[0].exercises[0].canonicalName.length).toBeGreaterThan(0);
    expect(input).toEqual(before);
  });

  it("ustawia kontener mobilny bez poziomego overflow", () => {
    expect(SPRINT_RUNNER_CONTAINER_CLASS).toContain("overflow-x-hidden");
  });

  it("aktywuje nowy runner tylko dla sesji akceleracji i max velocity", () => {
    const acceleration = baseSession({
      classification: {
        category: "speed_sprint",
        subcategory: "acceleration",
        intensity: "wysoka",
        loadLevel: "high",
        durationMinutes: 50,
        tags: [],
        countsAsStrength: false,
        countsAsEndurance: false,
        countsAsSpeed: true,
        countsAsClub: false,
        countsAsMatch: false,
        isGym: false,
        isClubSession: false,
        isEndurance: false,
        isSpeed: true,
        isMatch: false,
        isRecovery: false,
        isPrehab: false,
        isMobility: false,
        isHeavyLegs: false,
        isHighImpactRunning: true,
        isMaxVelocity: false,
        isAcceleration: true,
        isDeceleration: false,
        isChangeOfDirection: false,
        canBeSecondSession: false,
        generatedBy: "engine",
        placementReason: "",
        sourceRule: "",
      },
    });
    const nonSprint = baseSession();
    expect(isSprintRunnerSession(acceleration)).toBe(true);
    expect(isSprintRunnerSession(nonSprint)).toBe(false);
  });
});
