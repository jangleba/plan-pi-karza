import { describe, expect, it } from "vitest";
import { getExerciseDefinition } from "@/lib/loadwise/exerciseLibrary";
import { flatToStructured } from "@/lib/loadwise/strengthBlocks";
import type { ExerciseItem, SessionDay, TrainingSection } from "@/lib/loadwise/types";
import {
  buildSprintRunnerBlocks,
  canShowPostSessionForm,
  formatSprintPrescription,
  isSprintRunnerSession,
  resolveSprintExerciseDetails,
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
          id: "resisted",
          title: "Przygotowanie startu bez sprzętu",
          blockType: "single",
          intent: "power",
          exercises: [
            {
              id: "resisted-ex",
              exerciseId: "wall_march",
              speedRole: "resisted",
              name: "Wall march — pozycja akceleracyjna",
              reps: "3 × 5 na stronę",
              restAfterExercise: "Przerwa 45–60 s",
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
  it("renderuje 8 bloków w poprawnej kolejności", () => {
    const blocks = buildSprintRunnerBlocks(sprintSectionsFixture());
    expect(blocks.map((block) => `${block.index} ${block.title}`)).toEqual([
      "01 Przygotowanie RAMP",
      "02 Skipy A → C → B → D",
      "03 Drille techniczne",
      "04 Plyometria",
      "05 Opór / przygotowanie startu",
      "06 Sprint główny",
      "07 Hamowanie / zwrotność / łuk",
      "08 Wyciszenie",
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
    expect(blocks[5].exercises[0].canonicalName).toBe("Swobodny sprint akceleracyjny");
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

  it("aktywuje runner dla starych sesji sprintu i każdej nowej rodziny z wersją silnika", () => {
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
    const canonicalCod = baseSession({
      speedGeneratorVersion: "football-speed-v3-complete-flow",
      classification: {
        ...acceleration.classification!,
        isAcceleration: false,
        isDeceleration: true,
      },
    });
    expect(isSprintRunnerSession(acceleration)).toBe(true);
    expect(isSprintRunnerSession(canonicalCod)).toBe(true);
    expect(isSprintRunnerSession(nonSprint)).toBe(false);
  });

  function sprintItem(
    exerciseId: string,
    speedRole: ExerciseItem["speedRole"],
    name: string,
    prescription: string,
    rest?: string,
    purpose?: string,
  ): ExerciseItem {
    return {
      name,
      exerciseId,
      speedRole,
      prescription,
      rest,
      purpose,
    };
  }

  function persistedSprintSessionFixture(kind: "acceleration" | "maximum_velocity"): SessionDay {
    const warmup = [
      sprintItem(
        "sprint_ramp_warmup",
        "preparation",
        "Rozgrzewka biegowa",
        "8–10 min: Raise → Activate/Mobilise → Potentiate",
        "Bez przerw",
        "Krótka ogólna rozgrzewka.",
      ),
      sprintItem("a_skip", "primer", "Skip A — seria 1", "1 × 15–20 m", "Przerwa 30 s"),
      sprintItem("c_skip", "primer", "Skip C — seria 1", "1 × 15–20 m", "Przerwa 30 s"),
      sprintItem("b_skip", "primer", "Skip B — seria 1", "1 × 15–20 m", "Przerwa 30 s"),
      sprintItem("d_skip", "primer", "Skip D — seria 1", "1 × 15–20 m", "Przerwa 45 s"),
      sprintItem("a_skip", "primer", "Skip A — seria 2", "1 × 15–20 m", "Przerwa 30 s"),
      sprintItem("c_skip", "primer", "Skip C — seria 2", "1 × 15–20 m", "Przerwa 30 s"),
      sprintItem("b_skip", "primer", "Skip B — seria 2", "1 × 15–20 m", "Przerwa 30 s"),
      sprintItem("d_skip", "primer", "Skip D — seria 2", "1 × 15–20 m", "Przerwa 45 s"),
    ];
    const technical =
      kind === "acceleration"
        ? [
            sprintItem(
              "a_switch_progression",
              "technical",
              "Zmiany A: pojedyncza → podwójna → potrójna",
              "2 rundy × 3 na stronę",
              "Przerwa 30–45 s",
            ),
            sprintItem(
              "a_skip_add_step",
              "technical",
              "Skip A z add-step",
              "2 × 15 m",
              "Przerwa 60 s",
            ),
            sprintItem(
              "a_skip_no_add_step",
              "technical",
              "Skip A bez add-step",
              "2 × 15 m",
              "Przerwa 60 s",
            ),
          ]
        : [
            sprintItem("c_accent", "technical", "C-accent", "2–3 × 10–15 m", "Przerwa 60 s"),
            sprintItem(
              "a_skip_no_add_step",
              "technical",
              "Skip A bez add-step",
              "2–3 × 15–20 m",
              "Przerwa 60 s",
            ),
            sprintItem(
              "scissor_exchange_jump",
              "technical",
              "Naprzemienny skok nożycowy z wymianą",
              "2 × 4 na stronę",
              "Przerwa 90 s",
            ),
          ];
    const primary =
      kind === "acceleration"
        ? sprintItem(
            "free_acceleration_sprint",
            "primary",
            "Swobodny sprint akceleracyjny",
            "4 × 20 m z najazdu 15 m",
            "Pełna przerwa 3 min",
            "Główny bodziec: maksymalne przyspieszenie.",
          )
        : sprintItem(
            "flying_sprint",
            "primary",
            "Sprint lotny",
            "4 × 20 m z najazdu 15 m",
            "Pełna przerwa 3–4 min",
            "Główny bodziec: 2–3 s pracy przy prędkości bliskiej maksymalnej.",
          );
    const resisted = sprintItem(
      "wall_march",
      "resisted",
      "Wall march — pozycja akceleracyjna",
      "3 × 5 na stronę",
      "Przerwa 45–60 s",
    );
    const cooldown = sprintItem(
      "sprint_cooldown_walk",
      "cooldown",
      "Marsz i uspokojenie oddechu",
      "3–4 min",
      "—",
    );
    const canonicalFlat = {
      warmup,
      main: [
        ...technical,
        sprintItem(
          "scissor_bounds",
          "secondary",
          "Niskie wyskoki nożycowe",
          "2–3 × 4 kontakty na stronę",
          "Przerwa 60–90 s",
        ),
        resisted,
        primary,
        sprintItem(
          "progressive_deceleration_5_10_15",
          "terminal",
          "Hamowanie po sprincie",
          "2 serie × 5–10 m",
          "Pełna przerwa 90 s",
        ),
      ],
      accessory: [] as ExerciseItem[],
      footballTransfer: [] as ExerciseItem[],
      cooldown: [cooldown],
    };

    return baseSession({
      title: kind === "acceleration" ? "Sprint: akceleracja" : "Sprint: prędkość maksymalna",
      sessionType: "Szybkość",
      sections: {
        ...canonicalFlat,
      },
      structuredSections: flatToStructured(canonicalFlat),
    });
  }

  function expectSprintFixture(
    kind: "acceleration" | "maximum_velocity",
    expectedMainId: string,
    expectedTechnicalIds: string[],
  ) {
    const persisted = JSON.parse(JSON.stringify(persistedSprintSessionFixture(kind))) as SessionDay;
    const startBlocks = buildSprintRunnerBlocks(persisted.structuredSections ?? []);
    const detailsBlocks = buildSprintRunnerBlocks(flatToStructured(persisted.sections));
    const summarize = (blocks: ReturnType<typeof buildSprintRunnerBlocks>) =>
      blocks.map((block) => ({
        key: block.key,
        ids: block.exercises.map((exercise) => exercise.exercise.exerciseId),
      }));

    expect(summarize(detailsBlocks)).toEqual(summarize(startBlocks));
    expect(detailsBlocks.map((block) => block.index)).toEqual([
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
    ]);
    expect(detailsBlocks.map((block) => block.title)).toEqual([
      "Przygotowanie RAMP",
      "Skipy A → C → B → D",
      "Drille techniczne",
      "Plyometria",
      "Opór / przygotowanie startu",
      "Sprint główny",
      "Hamowanie / zwrotność / łuk",
      "Wyciszenie",
    ]);

    const byKey = Object.fromEntries(detailsBlocks.map((block) => [block.key, block]));
    expect(byKey.skip.exercises.map((exercise) => exercise.exercise.exerciseId)).toEqual([
      "a_skip",
      "c_skip",
      "b_skip",
      "d_skip",
    ]);
    expect(byKey.skip.exercises.map((exercise) => exercise.canonicalName)).toEqual([
      "Skip A",
      "Skip C",
      "Skip B",
      "Skip D",
    ]);
    expect(byKey.technical.exercises.map((exercise) => exercise.exercise.exerciseId)).toEqual(
      expectedTechnicalIds,
    );
    expect(byKey.technical.exercises).toHaveLength(3);
    expect(byKey.plyo.exercises.map((exercise) => exercise.exercise.exerciseId)).toEqual([
      "scissor_bounds",
    ]);
    expect(byKey.resisted.exercises.map((exercise) => exercise.exercise.exerciseId)).toEqual([
      "wall_march",
    ]);
    expect(byKey.main.exercises.map((exercise) => exercise.exercise.exerciseId)).toEqual([
      expectedMainId,
    ]);
    expect(byKey.terminal.exercises.map((exercise) => exercise.exercise.exerciseId)).toEqual([
      "progressive_deceleration_5_10_15",
    ]);
    expect(byKey.cooldown.exercises.map((exercise) => exercise.exercise.exerciseId)).toEqual([
      "sprint_cooldown_walk",
    ]);

    for (const block of detailsBlocks) {
      expect(block.exercises.length).toBeGreaterThan(0);
      expect(block.hasDataError ?? false).toBe(false);
      for (const exercise of block.exercises) {
        const definition = getExerciseDefinition(exercise.exercise.exerciseId ?? "");
        expect(definition?.approved).toBe(true);
        if (exercise.exercise.speedRole && block.key !== "skip") {
          // Precyzyjna nazwa z silnika, nie ogólna etykieta kanoniczna.
          expect(exercise.canonicalName).toBe(exercise.exercise.name);
        } else {
          expect(exercise.canonicalName).toBe(definition?.displayNamePl);
        }
        expect(exercise.canonicalName).not.toBe(block.title);
        const details = resolveSprintExerciseDetails(exercise.exercise);
        expect(details.howTo).toBeTruthy();
        expect(details.cues.length).toBeGreaterThanOrEqual(1);
      }
    }

    // Drille, sprint główny i element końcowy nie mogą być generycznymi duplikatami.
    const distinctNames = [
      ...byKey.technical.exercises,
      ...byKey.main.exercises,
      ...byKey.terminal.exercises,
    ].map((exercise) => exercise.canonicalName);
    expect(new Set(distinctNames).size).toBe(distinctNames.length);
    for (const name of distinctNames) {
      expect(name).not.toBe("Mechanika przyspieszenia");
    }
  }

  it("utrzymuje kanoniczne bloki i szczegóły dla zapisanej sesji akceleracji", () => {
    expectSprintFixture("acceleration", "free_acceleration_sprint", [
      "a_switch_progression",
      "a_skip_add_step",
      "a_skip_no_add_step",
    ]);
  });

  it("utrzymuje kanoniczne bloki i szczegóły dla zapisanej sesji max velocity", () => {
    expectSprintFixture("maximum_velocity", "flying_sprint", [
      "c_accent",
      "a_skip_no_add_step",
      "scissor_exchange_jump",
    ]);
  });
});
