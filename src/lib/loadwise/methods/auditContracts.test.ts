import { describe, expect, it } from "vitest";
import { buildStrengthPowerStructured, structuredToFlat } from "../strengthBlocks";
import { sessionFixture } from "@/components/loadwise/session/testFixtures";
import type { Profile, SessionDay } from "../types";
import { createMethodSession } from "./planner";
import { trainingMethodEligibility } from "./eligibility";
import { resolveExecutionDay } from "../effectivePlan";
import { buildTimeVariants } from "../dailyTimeBudget";

const profile = {
  name: "Audyt",
  age: 25,
  position: "midfielder",
  level: "advanced",
  goal: "strength",
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  hasGym: true,
  gymExperienceLevel: "advanced",
  strengthTrainingMonths: 36,
  movementCompetence: "high",
  supervisionLevel: "full",
  equipment: [],
  homeEquipment: [],
  painInjury: false,
} as unknown as Profile;
const conditions = { coachPresent: true, spaceLengthM: 100, participants: 2 };
function session(phase = "Rozwój"): SessionDay {
  const plan = buildStrengthPowerStructured(profile, {
    weekPhase: "development",
    weekIndex: 1,
    mdLabel: "MD-5",
    gymSessionIndexInWeek: 0,
    gymSessionsThisWeekTotal: 2,
    powerFocus: false,
    history: { usedMainThisWeek: [], usedMainLastWeek: [], usedRolesThisWeek: [] },
  })!;
  return sessionFixture({
    date: "2026-11-03",
    title: "Siłownia: siła",
    sessionType: "Siłownia",
    mdLabel: "MD-5",
    blockPhaseLabel: phase,
    blockWeekNumber: 2,
    structuredSections: plan.sections,
    sections: structuredToFlat(plan.sections),
  });
}
const rows = (s: SessionDay) =>
  s.structuredSections!.flatMap((s) => s.blocks.flatMap((b) => b.exercises));
describe("independent scientific-method execution contracts", () => {
  it("adds a holding isometric without erasing the main strength pattern", () => {
    const s = session();
    const primary = rows(s).find((e) => e.label === "A1")!;
    const next = createMethodSession(s, profile, "M13");
    expect(rows(next).some((e) => e.exerciseId === primary.exerciseId)).toBe(true);
    expect(rows(next).some((e) => e.methodExecution?.mode === "hold")).toBe(true);
  });
  it("stores the coached pull and the strength exercise under different log identities", () => {
    const next = createMethodSession(session(), profile, "M07", conditions);
    const all = rows(next);
    expect(all.some((e) => e.exerciseId === "clean_pull_from_hang")).toBe(true);
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
  });
  it.each(["Rozwój", "Szczyt", "Odciążenie"])(
    "limits VBT to the displayed maximum in %s",
    (phase) => {
      const next = createMethodSession(session(phase), profile, "M39", {
        ...conditions,
        equipment: ["velocity_device"],
        validatedVelocityDevice: true,
      });
      const first = rows(next).find((e) => e.methodExecution?.mode === "velocity")!;
      expect(first.methodExecution!.repetitions).toBe(
        Math.max(...first.reps!.match(/\d+/g)!.map(Number)),
      );
    },
  );
  it("uses per-set contacts: three sets of three jumps are nine contacts", () => {
    const jump = rows(createMethodSession(session(), profile, "M06")).find(
      (e) => e.exerciseId === "countermovement_jump",
    )!;
    expect(jump.groundContacts).toBe(3);
    expect(Number(jump.sets) * jump.groundContacts!).toBe(9);
  });
  it("does not infer a sled from gym access or ignore an unavailable sled", () => {
    const sprint = { ...session(), title: "Sprint: przyspieszenie", sessionType: "Sprint" };
    const p = { ...profile, unavailableEquipmentIds: ["sled"] };
    expect(
      trainingMethodEligibility("M20", { ...p, hasGym: false }, sprint, { spaceLengthM: 40 })
        .allowed,
    ).toBe(false);
    const next = createMethodSession(sprint, p, "M20", {
      spaceLengthM: 40,
      participants: 2,
      equipment: ["band"],
    });
    expect(rows(next).find((e) => e.methodExecution)?.exerciseId).toBe(
      "band_resisted_acceleration",
    );
  });
  it.each(["Adaptacja", "Odciążenie"])("does not insert a complex contrast into %s", (phase) => {
    expect(trainingMethodEligibility("M09", profile, session(phase), conditions).allowed).toBe(
      false,
    );
    expect(() => createMethodSession(session(phase), profile, "M09", conditions)).toThrow(
      /osobne serie/,
    );
  });
  it("cannot restore the full dose by changing methods after today's reduction", () => {
    // Today's reduction is the athlete's explicit „Mam mniej czasu” choice.
    const s = session();
    const variant = buildTimeVariants(s)[0];
    expect(variant).toBeDefined();
    const adjusted = resolveExecutionDay(variant.day, { profile });
    expect(adjusted.checkinTimeBudgetMin).toBe(variant.minutes);
    expect(() => createMethodSession(adjusted, profile, "M03")).toThrow(/dzisiejszej korekcie/);
  });
  it("retains normal method choice after a healthy check-in", () => {
    const s = session(),
      readiness = {
        date: s.date,
        overall: 9,
        sleep: 8,
        fatigue: 2,
        soreness: 1,
        jointPain: 0,
        energy: 9,
        stress: 2,
        motivation: 9,
      };
    const adjusted = resolveExecutionDay(s, { profile, readiness: { [s.date]: readiness } });
    expect(trainingMethodEligibility("M03", profile, adjusted).allowed).toBe(true);
  });
});
