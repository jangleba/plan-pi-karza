import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { journeyBank } from "./journeyBank";
import { chooseJourney, createJourney, createJourneyForRules, journeyPointChoice, journeyStep } from "./journeyEngine";
import { makeJourneyAttempt, makeJourneyDraft, restoreJourney } from "./journeyHistory";

describe("IQ decision consistency and replay compatibility", () => {
  it("does not recommend a run that becomes an error after the modeled defender response", () => {
    const contradictions: string[] = [];
    for (const definition of journeyBank) {
      let session = createJourney(definition);
      for (let i = 0; i < 7 && !session.outcome; i++) {
        const step = journeyStep(session);
        for (const choice of step.choices) {
          if (["move", "carry"].includes(step.kind)) {
            const free = journeyPointChoice(session, choice.point);
            if (free.quality !== choice.quality)
              contradictions.push(`${definition.id}:${session.step}:${choice.id}:free`);
          }
          if (choice.quality === "good") {
            const next = chooseJourney(session, choice.id, 2, false);
            if (
              next.decisions.at(-1)?.quality === "error" ||
              ["loss", "blocked"].includes(next.outcome ?? "")
            )
              contradictions.push(`${definition.id}:${session.step}:${choice.id}:execution`);
          }
        }
        const choice = step.choices.find((c) => c.quality === "good") ?? step.choices[0];
        session = chooseJourney(session, choice.id, 2, false);
      }
      expect(session.outcome, definition.id).not.toBeNull();
    }
    expect(contradictions).toEqual([]);
  });

  it("reproduces all 480 installed pre-22 timelines, including their original assessments", () => {
    const rows = journeyBank.map((definition) => {
      let session = createJourneyForRules(definition, 3);
      while (!session.outcome) {
        const choices = journeyStep(session).choices;
        session = chooseJourney(
          session,
          (choices.find((c) => c.quality === "good") ?? choices[0]).id,
          2,
        );
      }
      const attempt = makeJourneyAttempt(session, "learn", definition.id);
      expect(attempt.bankVersion).toBe("2026-10-15.3");
      expect(restoreJourney(attempt)).toEqual(session);
      return session;
    });
    // Computed independently with the unmodified engine at GitHub main 138b891.
    expect(createHash("sha256").update(JSON.stringify(rows)).digest("hex")).toBe(
      "ada0e923a48558fd35851bda0466510ceda9a6fed389e39b1c997b63efa530ca",
    );
  });

  it("retains the rule version when saving an old draft and uses new rules for a new attempt", () => {
    for (const rules of [3, 4] as const) {
      const original = createJourneyForRules(journeyBank[0], rules);
      const next = chooseJourney(original, journeyStep(original).choices[0].id, 1.25);
      const draft = makeJourneyDraft(next, "challenge", "resume");
      expect(restoreJourney(draft)).toEqual(next);
      expect(draft.bankVersion).toBe(rules === 4 ? "2026-10-31.4" : "2026-10-15.3");
    }
  });
});
