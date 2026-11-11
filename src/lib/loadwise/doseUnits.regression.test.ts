import { describe, expect, it, vi } from "vitest";
import { generatePlan } from "./planEngine";
import { reduceDailySessionDose } from "./dailyDose";
import { buildEquipmentReplacement, doseUnit, groundContactsForReps } from "./equipmentReplacement";
import { getExerciseDefinition } from "./exerciseLibrary";
import { filterUnavailableEquipment } from "./strengthBlocks";
import { sectionFixture } from "@/components/loadwise/session/testFixtures";
import type { Profile, SessionDay, TrainingExercise } from "./types";

const profile = (age: number, level: Profile["level"], goal: Profile["goal"]) =>
  ({
    name: "Dawki",
    age,
    healthPersonalizationEnabled: false,
    position: "midfielder",
    level,
    goal,
    secondaryLimiter: null,
    clubTrainingDays: [2, 4],
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
    unavailableDays: [],
    usualMatchDay: 6,
    matchDate: "2026-11-14",
    equipment: ["dumbbells", "barbell", "kettlebell"],
    painInjury: false,
    doubleSessionsAllowed: "yes_if_safe",
    guardianConsent: true,
    onboardingComplete: true,
    createdAt: "2026-09-01",
    seasonPhase: "inseason",
    seasonStage: "match_week",
    competitionLevel: "pro",
    weeklyMatches: true,
    hasGym: true,
    hasPitch: true,
    hasSprintSpace: true,
  }) as unknown as Profile;

const exercises = (day: SessionDay) =>
  [day, day.secondSession]
    .filter((s): s is SessionDay => !!s)
    .flatMap(
      (s) =>
        (s.structuredSections ?? []).flatMap((sec) =>
          sec.blocks.flatMap((b) => b.exercises),
        ) as TrainingExercise[],
    );

// Expected contacts from the repetitions it is printed next to.
const contactsMatchReps = (e: TrainingExercise) =>
  e.groundContacts === undefined || e.groundContacts === groundContactsForReps(e.reps);

describe("jednostki dawki i liczba kontaktów", () => {
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
  const plans = [
    generatePlan(profile(22, "advanced", "power"), new Date("2026-11-09T00:00:00"), 14),
    generatePlan(profile(17, "intermediate", "speed"), new Date("2026-11-09T00:00:00"), 14),
    generatePlan(profile(14, "beginner", "general"), new Date("2026-11-09T00:00:00"), 14),
  ];

  it("w wygenerowanych planach liczba kontaktów zgadza się z powtórzeniami", () => {
    const bad = plans
      .flatMap((plan) => plan.flatMap(exercises))
      .filter((e) => !contactsMatchReps(e))
      .map((e) => `${e.exerciseId}: reps="${e.reps}" contacts=${e.groundContacts}`);
    expect(bad).toEqual([]);
  });

  // Reproduced on c9e54e5: bilateral_pogo "3" repetitions with 14 contacts.
  it("redukcja dawki zmniejsza powtórzenia i kontakty razem", () => {
    for (const plan of plans)
      for (const day of plan) {
        if (day.dayType === "rest") continue;
        let reduced: SessionDay;
        try {
          reduced = reduceDailySessionDose(day);
        } catch {
          continue;
        }
        expect(
          exercises(reduced)
            .filter((e) => !contactsMatchReps(e))
            .map((e) => e.exerciseId),
        ).toEqual([]);
      }
  });

  it("sekundy zostają sekundami, a metry nie zamieniają się w czas", () => {
    expect(doseUnit({ duration: "30 s", reps: undefined })).toBe("time");
    expect(doseUnit({ reps: "20 m" })).toBe("distance");
    expect(doseUnit({ reps: "6–8" })).toBe("count");
    expect(doseUnit({ reps: "10 kontaktów" })).toBe("count");
  });

  it("zamiennik zaczyna zachowawczo: 2 serie i dawka nowego ćwiczenia, przerwa zostaje", () => {
    const original = {
      id: "x",
      name: "Martwy ciąg klasyczny",
      exerciseId: "barbell_deadlift",
      sets: "4",
      reps: "8",
      rpe: "RPE 7",
      restAfterExercise: "120 s",
      tempo: "3-1-1",
    } as TrainingExercise;
    const next = buildEquipmentReplacement(
      original,
      getExerciseDefinition("romanian_deadlift_db")!,
    );
    expect(next.sets).toBe("2");
    expect(next.restAfterExercise).toBe("120 s");
    expect(next.displayPrescription).toBe("2 × 6–8");
    expect(next.reps).toBe("6–8");
    expect(next.tempo).toBeUndefined();
  });

  it("zamiennik nie zamienia sekund na powtórzenia ani metrów na czas", () => {
    const hold = {
      id: "h",
      name: "Izometria",
      exerciseId: "long_lever_hamstring_iso",
      sets: "3",
      duration: "30 s",
    } as TrainingExercise;
    const toCount = buildEquipmentReplacement(
      hold,
      getExerciseDefinition("barbell_romanian_deadlift")!,
    );
    expect(toCount.duration).toBeUndefined();
    expect(toCount.reps).toBe("6–8");
    expect(toCount.displayPrescription).toBe("2 × 6–8");

    const sprint = {
      id: "s",
      name: "Sprint",
      exerciseId: "free_acceleration_sprint",
      sets: "4",
      reps: "20 m",
    } as TrainingExercise;
    const toTime = buildEquipmentReplacement(
      sprint,
      getExerciseDefinition("long_lever_hamstring_iso")!,
    );
    expect(toTime.reps).toBeUndefined();
    expect(toTime.duration).toBe("15–20 s");
  });

  it("zamiennik skoków ma liczbę kontaktów równą liczbie skoków", () => {
    const pogo = {
      id: "p",
      name: "Pogo",
      exerciseId: "bilateral_pogo",
      sets: "2",
      reps: "8 kontaktów",
      groundContacts: 8,
    } as TrainingExercise;
    const next = buildEquipmentReplacement(pogo, getExerciseDefinition("snap_down")!);
    expect(next.groundContacts).toBe(groundContactsForReps(next.reps));
  });

  it("kontakty na stronę liczą się podwójnie", () => {
    expect(groundContactsForReps("4 kontakty na stronę")).toBe(8);
    expect(groundContactsForReps("8 kontaktów")).toBe(8);
  });

  it("redukcja dawki zmniejsza liczbę kontaktów razem z powtórzeniami", () => {
    const day = {
      ...generatePlan(profile(17, "intermediate", "speed"), new Date("2026-11-09T00:00:00"), 7)[0],
      dayType: "training",
      type: "plyometric",
      sessionType: "Skoki",
      intensity: "wysoka",
      durationMin: 40,
      structuredSections: [
        sectionFixture("main", [
          {
            id: "p",
            exerciseId: "bilateral_pogo",
            name: "Pogo",
            sets: "1",
            reps: "14 kontaktów",
            groundContacts: 14,
          },
        ]),
      ],
    } as unknown as SessionDay;
    const [reduced] = exercises(reduceDailySessionDose(day));
    expect(reduced.reps).toBe("11 kontaktów");
    expect(reduced.groundContacts).toBe(11);
  });

  it("zamiennik sprzętu zachowuje serie i przerwę, a nie wpisuje domyślnej dawki", () => {
    const profileWithoutBarbell = {
      ...profile(22, "advanced", "strength"),
      unavailableEquipmentIds: ["barbell"],
    } as Profile;
    const sections = filterUnavailableEquipment(
      [
        sectionFixture("main", [
          {
            id: "d",
            exerciseId: "barbell_romanian_deadlift",
            name: "Martwy ciąg rumuński ze sztangą",
            sets: "4",
            reps: "8",
            restAfterExercise: "120 s",
            rpe: "RPE 7",
            instructionSteps: [{ title: "Stary", description: "STARA INSTRUKCJA" }],
          },
        ]),
      ],
      profileWithoutBarbell,
    );
    const e = sections[0].blocks[0].exercises[0];
    expect(e.exerciseId).not.toBe("barbell_romanian_deadlift");
    expect(e.sets).toBe("2");
    expect(e.reps).toBe("6–8");
    expect(e.restAfterExercise).toBe("120 s");
    expect(e.instructionSteps?.map((step) => step.description).join(" ")).not.toContain(
      "STARA INSTRUKCJA",
    );
    expect(e.displayPrescription).toBe("2 × 6–8");
  });
});
