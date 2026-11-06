import { describe, expect, it } from "vitest";
import { advancedJourneyBank } from "./advancedJourneyBank";
import {
  chooseJourney,
  createJourney,
  createJourneyForRules,
  journeyChoice,
  journeyStep,
} from "./journeyEngine";
import {
  makeJourneyDraft,
  restoreJourney,
  makeJourneyAttempt,
  saveJourneyAttempt,
  loadJourneyHistory,
} from "./journeyHistory";
import { controlTacticalActor, freeTacticalChoice, tacticalAlternatives } from "./tacticalJourney";
import { pressingAssessment } from "./tacticalLearning";
import { addForecast, forecastRival, observedReaction } from "./tacticalForecast";
import { journeyDebrief } from "./journeyDebrief";
import { LEGACY_TACTICAL_BANK_VERSION, TACTICAL_BANK_VERSION } from "./tacticalWorld";
import type { JourneySession } from "./journeyTypes";

function pressWorld() {
  const s = createJourney(
    advancedJourneyBank.find((d) => d.role === "wing" && d.concept === "press-cover")!,
  );
  s.world.positions.you = { x: 50, y: 70 };
  s.world.positions[s.world.carrierId] = { x: 50, y: 60 };
  for (const p of s.players)
    if (p.team === "home" && p.id !== "you")
      s.world.positions[p.id] = p.goalkeeper ? { x: 50, y: 133 } : { x: 4, y: 6 };
  return s;
}
function finish(s: JourneySession) {
  while (!s.outcome) {
    const choices = journeyStep(s).choices;
    s = chooseJourney(
      s,
      (choices.find((c) => c.quality === "good" && !c.timing && c.intent !== "shoot") ?? choices[0])
        .id,
      1,
      false,
    );
  }
  return s;
}
describe("tactical learning rules 7", () => {
  it("uses a new bank while retaining explicit legacy rules for replay", () => {
    expect(createJourney(advancedJourneyBank[0]).rulesVersion).toBe(7);
    const old = createJourneyForRules(advancedJourneyBank[0], 6);
    const draft = makeJourneyDraft(old, "learn", "legacy");
    expect(draft.bankVersion).toBe(LEGACY_TACTICAL_BANK_VERSION);
    expect(restoreJourney(draft)).toEqual(old);
    expect(
      makeJourneyDraft(createJourney(advancedJourneyBank[0]), "learn", "new").bankVersion,
    ).toBe(TACTICAL_BANK_VERSION);
  });
  it("does not count a goalkeeper or distant field player as pressing cover", () => {
    const s = pressWorld();
    expect(freeTacticalChoice(s, { x: 50, y: 64 }, "press").quality).not.toBe("good");
    const mate = s.players.find((p) => p.team === "home" && p.id !== "you" && !p.goalkeeper)!;
    s.world.positions[mate.id] = { x: 52, y: 100 };
    expect(pressingAssessment(s, { x: 50, y: 64 }).quality).not.toBe("good");
    s.world.positions[mate.id] = { x: 52, y: 76 };
    expect(pressingAssessment(s, { x: 50, y: 64 }).quality).toBe("good");
    expect(pressingAssessment(s, { x: 50, y: 56 }).quality).not.toBe("good");
    expect(pressingAssessment(s, { x: 50, y: 56 }).why).not.toBe(
      pressingAssessment(s, { x: 50, y: 64 }).why,
    );
  });
  it("compares a bad dribble with a viable pass, without confining the intention", () => {
    const s = createJourney(advancedJourneyBank.find((d) => d.id === "iqx-cb-0-0")!);
    const bad = journeyStep(s).choices.find((c) => c.intent === "carry" && c.quality === "error")!;
    expect(bad).toBeDefined();
    expect(
      tacticalAlternatives(s, bad).some((c) => c.intent === "pass" && c.quality === "good"),
    ).toBe(true);
    const next = chooseJourney(s, bad.id);
    expect(next.decisions[0].alternative?.intent).toBe("pass");
    const report = journeyDebrief(finish(next));
    expect(report?.comparison).toContain("Podanie");
  });
  it("does not reward passive defending simply for having room around TY", () => {
    const s = pressWorld();
    s.world.positions.you = { x: 5, y: 70 };
    expect(journeyStep(s).choices.find((c) => c.id === "t:wait")?.quality).toBe("error");
  });
  it("teaches defensive positioning after waiting in defence, rather than receiving a teammate pass", () => {
    let s = createJourney(
      advancedJourneyBank.find((d) => d.role === "wing" && d.concept === "press-cover")!,
    );
    while (!s.outcome) {
      const choices = journeyStep(s).choices;
      s = chooseJourney(
        s,
        (choices.find((c) => c.intent === "wait" || c.intent === "hold") ?? choices[0]).id,
        1,
        false,
      );
    }
    const report = journeyDebrief(s)!;
    expect(report.rule.signal).toContain("Rywal ma piłkę");
    expect(report.mission).toContain("partnera z pola");
  });
  it("persists and recomputes a prediction separately from tactical quality", () => {
    const s = createJourney(advancedJourneyBank[0]);
    const c = journeyStep(s).choices[0];
    const raw = chooseJourney(s, c.id, 3, false);
    const next = addForecast(raw, s, { predicted: "follow", plan: "protect" });
    expect(next.decisions).toEqual(raw.decisions);
    expect(next.forecasts).toHaveLength(1);
    const draft = makeJourneyDraft(next, "learn", "prediction");
    expect(restoreJourney(draft)).toEqual(next);
    expect(() =>
      restoreJourney({
        ...draft,
        forecasts: [
          {
            ...draft.forecasts![0],
            actual: draft.forecasts![0].actual === "ball" ? "follow" : "ball",
          },
        ],
      }),
    ).toThrow(/Prognoza/);
    expect(() =>
      restoreJourney({ ...draft, forecasts: [draft.forecasts![0], draft.forecasts![0]] }),
    ).toThrow();
    expect(() =>
      restoreJourney({ ...draft, forecasts: [{ ...draft.forecasts![0], decisionIndex: 8 }] }),
    ).toThrow();
  });
  it("recognizes the same prediction after a backup changes JSON field order", () => {
    const initial = createJourney(advancedJourneyBank[0]);
    const end = finish(
      addForecast(chooseJourney(initial, journeyStep(initial).choices[0].id, 1, false), initial, {
        predicted: "follow",
        plan: "protect",
      }),
    );
    const attempt = makeJourneyAttempt(end, "learn", "same-forecast");
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
      removeItem: (k: string) => {
        data.delete(k);
      },
    };
    saveJourneyAttempt("a", attempt, storage);
    const reordered = {
      ...attempt,
      forecasts: attempt.forecasts!.map((f) => ({
        plan: f.plan,
        actual: f.actual,
        rivalId: f.rivalId,
        decisionIndex: f.decisionIndex,
        predicted: f.predicted,
      })),
    };
    expect(() => saveJourneyAttempt("a", reordered, storage)).not.toThrow();
    expect(loadJourneyHistory("a", storage)).toHaveLength(1);
  });
  it("uses the controlled partner when selecting the opponent to forecast", () => {
    let s = createJourney(advancedJourneyBank[0]);
    s = chooseJourney(s, "t:pass:support:ground", 1, false);
    s = controlTacticalActor(s, s.world.carrierId);
    const next = addForecast(chooseJourney(s, journeyStep(s).choices[0].id, 2, false), s, {
      predicted: "ball",
      plan: "support",
    });
    expect(next.forecasts![0].rivalId).toBe(forecastRival(s)!.id);
    expect(restoreJourney(makeJourneyDraft(next, "learn", "partner")).forecasts).toEqual(
      next.forecasts,
    );
  });
  it("classifies actual movement and preserves ambiguous reactions", () => {
    const before = createJourney(advancedJourneyBank[0]);
    const next = chooseJourney(before, journeyStep(before).choices[0].id, 1, false);
    const rival = forecastRival(before)!.id,
      beat = next.beats[0];
    next.decisions[0].lastBeat = 0;
    beat.before.positions[rival] = { x: 20, y: 60 };
    beat.after.positions[rival] = { x: 25, y: 60 };
    beat.after.positions.you = { x: 40, y: 60 };
    beat.after.carrierId = "support";
    beat.after.positions.support = { x: 40, y: 60 };
    expect(observedReaction(next, 0, rival)).toBe("mixed");
    beat.after.positions.support = { x: 5, y: 60 };
    expect(observedReaction(next, 0, rival)).toBe("follow");
    beat.after.positions.you = { x: 5, y: 60 };
    beat.after.positions.support = { x: 40, y: 60 };
    expect(observedReaction(next, 0, rival)).toBe("ball");
  });
  it("completes and restores all 72 starts with independent teammates and finite positions", () => {
    const missions = new Set();
    for (const d of advancedJourneyBank) {
      const initial = createJourney(d),
        c = journeyStep(initial).choices[0];
      const first = addForecast(chooseJourney(initial, c.id, 2, false), initial, {
        predicted: "cover",
        plan: "scan",
      });
      const end = finish(first);
      expect(end.step).toBeLessThanOrEqual(8);
      expect(
        end.beats.some((b) => b.autonomous) ||
          end.outcome === "chance" ||
          end.outcome === "blocked",
      ).toBe(true);
      for (const pos of Object.values(end.world.positions))
        expect(Number.isFinite(pos.x + pos.y)).toBe(true);
      const attempt = makeJourneyAttempt(end, "learn", d.id);
      const restored = restoreJourney(attempt);
      expect(restored.world).toEqual(end.world);
      expect(restored.forecasts).toEqual(end.forecasts);
      expect(journeyChoice(initial, c.id)).toBeDefined();
      missions.add(journeyDebrief(end)!.mission);
    }
    expect(missions.size).toBeGreaterThan(12);
  });
});
