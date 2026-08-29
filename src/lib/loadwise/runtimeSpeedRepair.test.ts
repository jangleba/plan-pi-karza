import { describe, expect, it } from "vitest";
import type { Profile, SessionDay } from "./types";
import {
  FOOTBALL_SPEED_GENERATOR_VERSION,
  generateFootballSpeedSession,
} from "./footballSpeedSessionEngine";
import { hasCompleteRuntimeSpeedPayload, repairRuntimeSpeedDay } from "./runtimeSpeedRepair";

const profile: Profile = {
  name: "Runtime repair",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "speed",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: null,
  equipment: [],
  unavailableEquipmentIds: [],
  painInjury: false,
  doubleSessionsAllowed: "yes_if_safe",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-01-01",
  seasonPhase: "preseason",
  seasonStage: null,
  competitionLevel: "pro",
  weeklyMatches: false,
  hasGym: true,
  hasPitch: true,
  hasSprintSpace: true,
};

function strengthHost(secondSession: SessionDay | null): SessionDay {
  return {
    date: "2026-08-21",
    dayName: "Piątek",
    dayType: "training",
    title: "Siłownia: siła dolna",
    goalLabel: "Siła",
    intensity: "wysoka",
    durationMin: 70,
    isOwnSession: true,
    isClubSession: false,
    reason: "test",
    safetyNote: null,
    whyToday: "test",
    sessionType: "Siła",
    goalOfSession: "Siła dolnej części ciała",
    riskManaged: "test",
    avoidToday: "test",
    mdLabel: null,
    slotLabel: null,
    sections: { warmup: [], main: [], accessory: [], footballTransfer: [], cooldown: [] },
    secondSession,
  };
}

function malformedEngineSlot(): SessionDay {
  const generated = generateFootballSpeedSession({
    profile,
    date: "2026-08-21",
    family: "acceleration",
  }).session!;
  return {
    ...generated,
    sessionId: "legacy-slot-2",
    slotLabel: "Sesja 2 (lekka)",
    isSupplemental: true,
    // Dokładny historyczny błąd: engine-owned, ale isOwnSession=false.
    isOwnSession: false,
    intensity: "wysoka",
    classification: { ...generated.classification!, generatedBy: "engine" },
    // Marker może być bieżący, mimo że payload runnera jest ucięty.
    speedGeneratorVersion: FOOTBALL_SPEED_GENERATOR_VERSION,
    structuredSections: generated.structuredSections?.slice(0, 1),
  };
}

describe("runtime speed payload repair", () => {
  it("repairs the exact legacy slot-2 shape before the runner renders it", async () => {
    const original = strengthHost(malformedEngineSlot());
    const repairedDay = repairRuntimeSpeedDay(original, profile);
    const repaired = repairedDay.secondSession!;

    expect(repaired.sessionId).toBe("legacy-slot-2");
    expect(repaired.speedGeneratorVersion).toBe(FOOTBALL_SPEED_GENERATOR_VERSION);
    expect(repaired.isSupplemental).toBe(true);
    expect(repaired.intensity).toBe("umiarkowana");
    expect(repaired.classification?.canBeSecondSession).toBe(true);
    expect(repaired.speedFamily).toBe("acceleration");
    expect(hasCompleteRuntimeSpeedPayload(repaired)).toBe(true);
    expect(repaired.structuredSections?.flatMap((section) => section.blocks)).toHaveLength(18);

    const { buildSprintRunnerBlocks } = await import("../../routes/sesja.$date");
    const runner = buildSprintRunnerBlocks(repaired.structuredSections ?? []);
    expect(runner.map((block) => block.exercises.length)).toEqual([1, 4, 3, 1, 1, 2, 1, 1]);
    expect(runner.every((block) => !block.hasDataError)).toBe(true);
    // Naprawa nie może udawać check-inu 7/10 i samodzielnie obniżać dawki.
    expect(
      repaired.sections.main.find((item) => item.exerciseId === "free_acceleration_sprint")
        ?.prescription,
    ).toBe("4–6 × 10–20 m");

    expect(repairRuntimeSpeedDay(repairedDay, profile)).toBe(repairedDay);
  });

  it("repairs the hidden readiness baseline so check-in cannot restore bad data", () => {
    const current = strengthHost(null);
    current.readinessAdjustedDate = current.date;
    current.readinessOriginalSession = strengthHost(malformedEngineSlot());

    const repaired = repairRuntimeSpeedDay(current, profile);

    expect(repaired.secondSession).toBeNull();
    expect(
      hasCompleteRuntimeSpeedPayload(
        repaired.readinessOriginalSession?.secondSession as SessionDay,
      ),
    ).toBe(true);
  });

  it("does not rewrite a user-added speed slot", () => {
    const userSlot = malformedEngineSlot();
    userSlot.classification = { ...userSlot.classification!, generatedBy: "user_added" };
    const parent = strengthHost(userSlot);

    expect(repairRuntimeSpeedDay(parent, profile)).toBe(parent);
    expect(parent.secondSession).toBe(userSlot);
  });

  it("requires explicit engine ownership for legacy isOwnSession=false data", () => {
    const ambiguousSlot = malformedEngineSlot();
    ambiguousSlot.classification = undefined;
    const parent = strengthHost(ambiguousSlot);

    expect(repairRuntimeSpeedDay(parent, profile)).toBe(parent);
    expect(parent.secondSession).toBe(ambiguousSlot);
  });

  it("does not rewrite past, completed, or swapped sessions", () => {
    const past = strengthHost(malformedEngineSlot());
    expect(repairRuntimeSpeedDay(past, profile, { today: "2026-08-22" })).toBe(past);

    const completedSlot = malformedEngineSlot();
    completedSlot.dbId = "completed-slot";
    const completed = strengthHost(completedSlot);
    expect(
      repairRuntimeSpeedDay(completed, profile, {
        completions: {
          "completed-slot": { completed: true, rpe: 7, notes: "" },
        },
      }),
    ).toBe(completed);

    const swapped = strengthHost(malformedEngineSlot());
    expect(
      repairRuntimeSpeedDay(swapped, profile, {
        modifications: {
          [swapped.date]: [
            {
              id: "swap-1",
              date: swapped.date,
              type: "swap",
              reason: "user choice",
              safetyStatus: "swapped_by_user",
              session: strengthHost(null),
              originalSession: swapped,
              createdAt: "2026-08-20T10:00:00.000Z",
            },
          ],
        },
      }),
    ).toBe(swapped);
  });

  it("removes a broken slot instead of regenerating it beside a hard club exposure", () => {
    const clubConflictProfile = { ...profile, clubTrainingDays: [4] };
    const repaired = repairRuntimeSpeedDay(
      strengthHost(malformedEngineSlot()),
      clubConflictProfile,
    );

    expect(repaired.secondSession).toBeNull();
  });

  it("revalidates and removes an already complete slot after a new hard conflict", () => {
    const complete = repairRuntimeSpeedDay(strengthHost(malformedEngineSlot()), profile);
    expect(hasCompleteRuntimeSpeedPayload(complete.secondSession!)).toBe(true);

    const clubConflictProfile = { ...profile, clubTrainingDays: [4] };
    const revalidated = repairRuntimeSpeedDay(complete, clubConflictProfile);

    expect(revalidated.secondSession).toBeNull();
  });

  it("removes a broken slot when the adjacent plan day already contains speed", () => {
    const adjacentSpeed = generateFootballSpeedSession({
      profile,
      date: "2026-08-22",
      family: "maximum_velocity",
    }).session!;
    const repaired = repairRuntimeSpeedDay(strengthHost(malformedEngineSlot()), profile, {
      plan: [adjacentSpeed],
    });

    expect(repaired.secondSession).toBeNull();
  });

  it("treats a same-day user-added speed session as a hard conflict", () => {
    const addedSpeed = generateFootballSpeedSession({
      profile,
      date: "2026-08-21",
      family: "acceleration",
    }).session!;
    addedSpeed.classification = {
      ...addedSpeed.classification!,
      generatedBy: "user_added",
    };
    const repaired = repairRuntimeSpeedDay(strengthHost(malformedEngineSlot()), profile, {
      modifications: {
        "2026-08-21": [
          {
            id: "add-speed",
            date: "2026-08-21",
            type: "add",
            reason: "user choice",
            safetyStatus: "added_by_user",
            session: addedSpeed,
            originalSession: null,
            createdAt: "2026-08-20T10:00:00.000Z",
          },
        ],
      },
    });

    expect(repaired.secondSession).toBeNull();
  });

  it("counts an adjacent hidden readiness speed session as a conflict", () => {
    const adjacent = strengthHost(null);
    adjacent.date = "2026-08-22";
    adjacent.readinessOriginalSession = generateFootballSpeedSession({
      profile,
      date: adjacent.date,
      family: "maximum_velocity",
    }).session!;

    const repaired = repairRuntimeSpeedDay(strengthHost(malformedEngineSlot()), profile, {
      plan: [adjacent],
    });

    expect(repaired.secondSession).toBeNull();
  });

  it("uses the swapped adjacent session instead of the replaced base plan", () => {
    const replacedSpeed = generateFootballSpeedSession({
      profile,
      date: "2026-08-22",
      family: "maximum_velocity",
    }).session!;
    const replacement = strengthHost(null);
    replacement.date = "2026-08-22";

    const repaired = repairRuntimeSpeedDay(strengthHost(malformedEngineSlot()), profile, {
      plan: [replacedSpeed],
      modifications: {
        "2026-08-22": [
          {
            id: "swap-adjacent",
            date: "2026-08-22",
            type: "swap",
            reason: "user choice",
            safetyStatus: "swapped_by_user",
            session: replacement,
            originalSession: replacedSpeed,
            createdAt: "2026-08-20T10:00:00.000Z",
          },
        ],
      },
    });

    expect(hasCompleteRuntimeSpeedPayload(repaired.secondSession!)).toBe(true);
  });

  it("detects speed nested in an adjacent added second session", () => {
    const addedHost = strengthHost(
      generateFootballSpeedSession({
        profile,
        date: "2026-08-22",
        family: "maximum_velocity",
      }).session!,
    );
    addedHost.date = "2026-08-22";

    const repaired = repairRuntimeSpeedDay(strengthHost(malformedEngineSlot()), profile, {
      modifications: {
        "2026-08-22": [
          {
            id: "add-adjacent-double",
            date: "2026-08-22",
            type: "add",
            reason: "user choice",
            safetyStatus: "added_by_user",
            session: addedHost,
            originalSession: null,
            createdAt: "2026-08-20T10:00:00.000Z",
          },
        ],
      },
    });

    expect(repaired.secondSession).toBeNull();
  });

  it("leaves top-level sprint data outside this slot-2-only repair", () => {
    const topLevel = malformedEngineSlot();
    topLevel.isSupplemental = false;

    expect(repairRuntimeSpeedDay(topLevel, profile)).toBe(topLevel);
  });

  it("rejects a 17-block payload when the required skip IDs are corrupted", () => {
    const valid = generateFootballSpeedSession({
      profile,
      date: "2026-08-21",
      family: "acceleration",
    }).session!;
    const corrupted = structuredClone(valid);
    const primer = corrupted.structuredSections
      ?.flatMap((section) => section.blocks)
      .find((block) => block.exercises[0]?.speedRole === "primer");
    if (primer) primer.exercises[0].exerciseId = "unknown_skip";

    expect(hasCompleteRuntimeSpeedPayload(valid)).toBe(true);
    expect(hasCompleteRuntimeSpeedPayload(corrupted)).toBe(false);
  });
});
