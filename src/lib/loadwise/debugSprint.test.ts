import { describe, it } from "vitest";
import { generatePlan } from "./planEngine";
import type { Profile } from "./types";

const profile: Profile = {
  name: "Test",
  age: 24,
  position: "midfielder",
  level: "advanced",
  goal: "speed",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [1, 2, 3, 4, 5, 6, 7],
  usualMatchDay: null,
  matchDate: "2026-08-22",
  equipment: [],
  unavailableEquipmentIds: ["sled", "box"],
  painInjury: false,
  doubleSessionsAllowed: "no",
  guardianConsent: true,
  onboardingComplete: true,
  createdAt: "2026-01-01",
  seasonPhase: "inseason",
  seasonStage: "match_week",
  competitionLevel: "pro",
  weeklyMatches: true,
  hasGym: false,
  hasPitch: true,
  hasSprintSpace: true,
};

describe("debug sprint session", () => {
  it("prints sprint session details", () => {
    const plan = generatePlan(profile, new Date("2026-08-17"), 7);
    const speedDay = plan.find((d) => d.sessionType === "Szybkość");
    console.log("Date:", speedDay?.date);
    console.log("speedGeneratorVersion:", speedDay?.speedGeneratorVersion);
    console.log("structuredSections:", speedDay?.structuredSections?.length, "sections");
    const blocks = speedDay?.structuredSections?.flatMap((s) => s.blocks) ?? [];
    console.log("total blocks:", blocks.length);
    console.log("warmup blocks:", speedDay?.structuredSections?.find(s => s.type === "warmup")?.blocks.length);
    console.log("sections.warmup count:", speedDay?.sections.warmup.length);
    console.log("sections.warmup:", JSON.stringify(speedDay?.sections.warmup.map(e => e.name)));
    console.log("sections.main count:", speedDay?.sections.main.length);
    console.log("sections.main:", JSON.stringify(speedDay?.sections.main.map(e => e.name)));
    console.log("sections.footballTransfer:", JSON.stringify(speedDay?.sections.footballTransfer.map(e => e.name)));
  });
});
