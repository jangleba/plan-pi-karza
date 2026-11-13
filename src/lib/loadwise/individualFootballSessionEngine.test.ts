import { describe,expect,it } from "vitest";
import { buildIndividualFootballSession,INDIVIDUAL_FOOTBALL_DRILLS } from "./individualFootballSessionEngine";
import { getExerciseDefinition } from "./exerciseLibrary";
import { fieldMasTestAvailable } from "./runningWeek";
import { classifySession } from "./sessionClassification";
import type { Profile,SessionDay } from "./types";

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: "Football fixture", age: 22, position: "midfielder", level: "intermediate",
    goal: "general", secondaryLimiter: "ball", clubTrainingDays: [],
    individualTrainingDays: [1, 2, 3, 4, 5, 6, 7], usualMatchDay: null,
    matchDate: null, matchDates: [], equipment: [], painInjury: false,
    doubleSessionsAllowed: "no", guardianConsent: true, onboardingComplete: true,
    createdAt: "2026-11-01", seasonPhase: "preseason", seasonStage: null,
    competitionLevel: "iv_liga", weeklyMatches: false, seasonPhaseOverride: true,
    hasGym: false, hasPitch: false, hasSprintSpace: false, ...overrides,
  };
}

function asSession(built: ReturnType<typeof buildIndividualFootballSession>): SessionDay {
  return {
    date: "2026-11-02", dayName: "Poniedziałek", dayType: "training",
    goalLabel: "Piłka", reason: "Technika", secondSession: null,
    safetyNote: "Kontrola przed intensywnością.", whyToday: "Technika indywidualna.",
    mdLabel: null, slotLabel: null,
    ...built,
  };
}

function rows(built: ReturnType<typeof buildIndividualFootballSession>) {
  return Object.values(built.sections).flat();
}

describe("individual football: solo conditions and real runtime", () => {
  it("never schedules the MAS test by itself; the athlete can choose it only when eligible", () => {
    const eligible = profile({ movementCompetence: "medium" });
    expect(fieldMasTestAvailable(profile()).ok).toBe(false);
    expect(fieldMasTestAvailable(eligible).ok).toBe(true);
  });
  it("does not assume a wall, goal, yard or pitch when the profile has none", () => {
    for (let seed = 0; seed < 12; seed++) {
      const built = buildIndividualFootballSession(profile(), { seed });
      for (const row of rows(built)) {
        const drill = INDIVIDUAL_FOOTBALL_DRILLS.find((item) => item.id === row.exerciseId)!;
        expect(drill.space, row.exerciseId).toBe("small");
        expect("wall" in drill || "goal" in drill, row.exerciseId).toBe(false);
      }
      expect(rows(built).every((row) => row.instructionSteps?.length === 3)).toBe(true);
      expect(rows(built).every((row) => row.purpose && row.commonMistake && row.easier)).toBe(true);
    }
  });

  it("uses a wall task only after wall access is declared, and honors unavailable equipment", () => {
    const withWall = buildIndividualFootballSession(profile({ equipment: ["ściana/odbojnik"] }), { seed: 1 });
    expect(rows(withWall).some((row) => row.exerciseId === "football_wall_first_touch")).toBe(true);
    const blocked = buildIndividualFootballSession(profile({ equipment: ["ściana/odbojnik"], unavailableEquipmentIds: ["odbojnik"] }), { seed: 1 });
    expect(rows(blocked).some((row) => row.exerciseId?.startsWith("football_wall_"))).toBe(false);
  });

  it("brings in pitch and goal tasks only when the athlete has a pitch", () => {
    const ids = (overrides: Partial<Profile>) =>
      new Set(Array.from({ length: 12 }, (_, seed) =>
        rows(buildIndividualFootballSession(profile({ position: "forward", ...overrides }), { seed })).map((row) => row.exerciseId),
      ).flat());
    expect(ids({ hasPitch: true, hasSprintSpace: true }).has("football_finishing_corners")).toBe(true);
    expect(ids({ hasPitch: false, hasSprintSpace: true }).has("football_finishing_corners")).toBe(false);
    expect(ids({ hasPitch: false, hasSprintSpace: true, equipment: ["Bramka lub mini-bramka"] }).has("football_finishing_corners")).toBe(true);
    expect(ids({ hasPitch: false, hasSprintSpace: false, equipment: ["Bramka lub mini-bramka"] }).has("football_finishing_corners")).toBe(false);
    expect(ids({ hasPitch: false, hasSprintSpace: true }).has("football_slalom_time")).toBe(true);
  });

  it("gives every position its own task and ends with a scored challenge", () => {
    for (const position of ["goalkeeper", "defender", "midfielder", "forward"] as Profile["position"][]) {
      for (let seed = 0; seed < 6; seed++) {
        const built = buildIndividualFootballSession(profile({ position }), { seed });
        const task = INDIVIDUAL_FOOTBALL_DRILLS.find((item) => item.id === built.sections.main[1].exerciseId)!;
        expect("positions" in task && (task.positions as readonly string[]).includes(position)).toBe(true);
        expect(built.sections.footballTransfer[0].cue).toMatch(/^Wyzwanie: /);
        expect(built.sessionType).toContain("indywidualna");
        expect(classifySession(asSession(built)).category).toBe("other");
      }
    }
  });

  it("varies the drills between sessions and keeps fast or forceful tasks out of light ones", () => {
    const pitch = profile({ hasPitch: true, hasSprintSpace: true, equipment: ["ściana/odbojnik"] });
    const combos = new Set(Array.from({ length: 8 }, (_, seed) =>
      rows(buildIndividualFootballSession(pitch, { seed })).map((row) => row.exerciseId).join(","),
    ));
    expect(combos.size).toBeGreaterThanOrEqual(4);
    for (let seed = 0; seed < 12; seed++) {
      const light = buildIndividualFootballSession(pitch, { seed, light: true });
      for (const row of rows(light)) {
        const drill = INDIVIDUAL_FOOTBALL_DRILLS.find((item) => item.id === row.exerciseId)!;
        expect("intense" in drill, row.exerciseId).toBe(false);
      }
    }
  });

  it("allocates time to work, rests and setup rather than keeping a conflicting template duration", () => {
    for (const durationMin of [15, 20, 25, 30, 40, 90]) {
      const built = buildIndividualFootballSession(profile(), { seed: 0, durationMin });
      const warm = Number(built.sections.warmup[0].prescription.match(/^(\d+)/)![1]);
      const cool = Number(built.sections.cooldown[0].prescription.match(/^(\d+)/)![1]);
      const practices = [...built.sections.main, ...built.sections.footballTransfer];
      const blockTotal = practices.reduce((sum, row) => sum + Number(row.prescription.match(/blok (\d+) min/)![1]), 0);
      expect(warm + cool + blockTotal).toBe(built.durationMin);
      for (const row of practices) {
        const [sets, work, rest, block] = row.prescription.match(/\d+/g)!.map(Number);
        expect(sets * work + (sets - 1) * rest).toBeLessThanOrEqual(block * 60);
      }
    }
  });

  it("caps novice and cautious dose, and uses quality rather than calendar to advance difficulty", () => {
    const novice = buildIndividualFootballSession(profile({ age: 14, level: "beginner" }), { seed: 0 });
    const regular = buildIndividualFootballSession(profile(), { seed: 0 });
    const returning = buildIndividualFootballSession(profile({ goal: "return" }), { seed: 0 });
    expect(novice.durationMin).toBeLessThan(regular.durationMin);
    expect(novice.intensity).toBe("niska");
    expect(returning.durationMin).toBeLessThanOrEqual(25);
    expect(returning.sections.footballTransfer).toEqual([]);
    expect(regular.sections.main.every((row) => row.harder?.includes("dwóch seriach"))).toBe(true);
    expect(buildIndividualFootballSession(profile(), { seed: 0, weekIndex: 3 })).toEqual(regular);
  });

  it("preserves the actual drill name and instructions after canonicalization and hydration", () => {
    for (const definition of INDIVIDUAL_FOOTBALL_DRILLS) {
      expect(getExerciseDefinition(definition.id)).toMatchObject({ approved: true, requiresBall: true, participantMode: "solo" });
    }
  });
});
