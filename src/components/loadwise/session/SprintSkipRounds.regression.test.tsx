// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateFootballSpeedSession } from "@/lib/loadwise/footballSpeedSessionEngine";
import type { FootballSpeedFamily } from "@/lib/loadwise/footballSpeedSessionEngine";
import { flatToStructured } from "@/lib/loadwise/strengthBlocks";
import type { Profile, SessionDay } from "@/lib/loadwise/types";
import { FocusedSessionRunner } from "./FocusedSessionRunner";

vi.mock("@/lib/loadwise/auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("../ExerciseDetailSheet", () => ({ ExerciseDetailSheet: () => null }));
vi.mock("../ExerciseRunnerScreen", () => ({ ExerciseRunnerScreen: () => null }));

const FAMILIES: FootballSpeedFamily[] = [
  "acceleration",
  "maximum_velocity",
  "curved_sprinting",
  "deceleration_cod",
  "reactive_agility_reacceleration",
];

const makeProfile = (overrides: Partial<Profile> = {}): Profile => ({
  name: "Test",
  age: 24,
  position: "midfielder",
  level: "advanced",
  gymExperienceLevel: "intermediate",
  strengthTrainingMonths: 12,
  movementCompetence: "high",
  supervisionLevel: "some",
  goal: "speed",
  secondaryLimiter: null,
  clubTrainingDays: [],
  individualTrainingDays: [2, 4, 6],
  usualMatchDay: null,
  matchDate: null,
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
  ...overrides,
});
const profile = makeProfile();

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

/** Przechodzi przez całą sesję przyciskiem „Dalej” i zbiera tytuły oraz linie przerw. */
async function walkSession(session: SessionDay) {
  // Ten sam kształt co plan odtworzony z bazy: płaskie pozycje → bloki.
  const sections = flatToStructured(JSON.parse(JSON.stringify(session.sections)));
  await act(async () =>
    root.render(
      <FocusedSessionRunner
        sections={sections}
        date={session.date}
        kind="sprint"
        onFinish={() => undefined}
      />,
    ),
  );
  const titles: string[] = [];
  const restLines: string[] = [];
  for (let guard = 0; guard < 60; guard += 1) {
    const card = host.querySelector(".bw-focus-card");
    if (card) {
      titles.push(card.querySelector("h2")?.textContent ?? "");
      for (const line of card.querySelectorAll(".bw-session-muted"))
        restLines.push(line.textContent ?? "");
    }
    const next = [...host.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Dalej",
    );
    if (!next) break;
    await act(async () => next.click());
  }
  return { titles, restLines };
}

describe("skipy w sesji sprinterskiej — ekran", () => {
  it.each(FAMILIES)(
    "%s: każda runda skipu ma własną nazwę z rundą i rytmem, bez zdublowanej przerwy",
    async (family) => {
      const result = generateFootballSpeedSession({ profile, date: "2026-08-19", family });
      expect(result.status).toBe("generated");
      const { titles, restLines } = await walkSession(result.session!);

      const skipTitles = titles.filter((title) => /^Skip [ABCD](?: —|$)/.test(title));
      expect(skipTitles).toEqual([
        "Skip A — runda 1 · z dostawieniem",
        "Skip C — runda 1 · z dostawieniem",
        "Skip B — runda 1 · z dostawieniem",
        "Skip D — runda 1 · z dostawieniem",
        "Skip A — runda 2 · ciągły",
        "Skip C — runda 2 · ciągły",
        "Skip B — runda 2 · ciągły",
        "Skip D — runda 2 · ciągły",
      ]);

      expect(restLines.length).toBeGreaterThan(0);
      for (const line of restLines) {
        expect(line).not.toMatch(/przerwa\s+(?:pełna\s+)?przerwa/i);
        expect(line).not.toMatch(/^Przerwa\s+(?:Bez|—)/);
      }
      expect(restLines).toContain("Przerwa 30 s");
    },
  );
});
