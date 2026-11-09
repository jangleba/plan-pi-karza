import { describe, expect, it } from "vitest";
import { assessAction, lessonAim, type DecisionAssessment } from "./decisionAssessment";
import { decisionOptions } from "./decisionOptions";
import {
  makeJourneyDraft,
  makeJourneyAttempt,
  readJourneyBackup,
  restoreJourney,
} from "./journeyHistory";
import { chooseJourney, createJourneyForRules } from "./journeyEngine";
import type { JourneySession } from "./journeyTypes";
import {
  addAssessments,
  aimProgress,
  focusAim,
  loadMastery,
  MASTERY_WINDOW,
  nextByMastery,
  saveMastery,
} from "./mastery";
import { pickerItems } from "./journeyGuide";
import { situationBank } from "./situationBank";
import { addForecast, forecastRival, predictionResult } from "./tacticalForecast";
import { teamOf } from "./tacticalWorld";

/** First decision of each hand-placed situation, with a prediction, while our team has the ball. */
function predicted(pick = 0) {
  const out: JourneySession[] = [];
  for (const def of situationBank.filter((d) => d.context === 0)) {
    const before: JourneySession = { ...createJourneyForRules(def, 9), controlledId: "you" };
    if (teamOf(before, before.world.carrierId) !== "home" || !forecastRival(before)) continue;
    const options = decisionOptions(before);
    const choice = options[Math.min(pick, options.length - 1)].choice;
    const next = chooseJourney(before, choice.id, 2);
    out.push(addForecast({ ...next, controlledId: "you" }, before, { predicted: "cover" }));
  }
  return out;
}

describe("prediction loop: TY predicts the nearest rival's reaction", () => {
  it("reads the reaction from the animation and is not always the same answer", () => {
    const seen = new Set<string>();
    for (const pick of [0, 1, 2])
      for (const s of predicted(pick)) {
        const f = s.forecasts![0];
        expect(f.decisionIndex).toBe(0);
        expect(["ball", "follow", "cover"]).toContain(f.actual);
        const r = predictionResult(s, f);
        expect(r.actual).toMatch(/^Nr \d+ /);
        expect(r.actual).not.toMatch(/undefined|NaN/);
        expect(r.hit).toBe(f.actual === "cover");
        seen.add(f.actual);
      }
    expect(seen.size).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it("is saved with the action and replays to the same reaction", () => {
    const [s] = predicted();
    const draft = makeJourneyDraft(s, "learn", "iq8-test");
    expect(draft.forecasts?.[0].plan).toBeUndefined();
    expect(restoreJourney(draft).forecasts).toEqual(s.forecasts);
  }, 60_000);

  it("rejects a saved prediction whose reaction does not match the replay", () => {
    const [s] = predicted();
    const f = s.forecasts![0];
    const wrong = f.actual === "ball" ? "cover" : "ball";
    const draft = makeJourneyDraft(
      { ...s, forecasts: [{ ...f, actual: wrong }] },
      "learn",
      "iq8-test",
    );
    expect(() => restoreJourney(draft)).toThrow();
  }, 60_000);

  it("a finished action with a prediction passes the backup check", () => {
    const finished = predicted().flatMap((first, n) => {
      let s = first,
        r = n * 31 + 7;
      for (let i = 0; i < 80 && !s.outcome; i++) {
        const options = decisionOptions({ ...s, controlledId: "you" });
        if (!options.length) break;
        r = (r * 1103515245 + 12345) % 2147483648;
        s = chooseJourney({ ...s, controlledId: "you" }, options[r % options.length].choice.id, 1);
      }
      return s.outcome ? [s] : [];
    });
    expect(finished.length).toBeGreaterThan(0);
    const attempts = finished
      .slice(0, 3)
      .map((s, i) => makeJourneyAttempt(s, "learn", `iq8-done-${i}`));
    for (const a of attempts) expect(a.forecasts).toHaveLength(1);
    expect(
      readJourneyBackup({ schema: "ballwise.iq.journey-backup.v1", attempts }).attempts,
    ).toHaveLength(attempts.length);
  }, 240_000);
});

const graded = (aim: string, grades: string[]) =>
  grades.map((grade, index) => ({ index, aim, grade })) as unknown as DecisionAssessment[];

describe("progress per lesson aim and the next situation", () => {
  it("keeps only the latest decisions and marks an aim mastered", () => {
    let m = addAssessments({}, graded("press", Array(MASTERY_WINDOW).fill("error")));
    expect(aimProgress(m, "press").level).toBe("learning");
    m = addAssessments(m, graded("press", Array(MASTERY_WINDOW).fill("good")));
    expect(m.press).toHaveLength(MASTERY_WINDOW);
    expect(aimProgress(m, "press")).toMatchObject({ level: "mastered", score: 1 });
    expect(aimProgress(m, "cover").level).toBe("new");
  });

  it("records each decision under the aim it was graded against", () => {
    const def = situationBank.find((d) => d.context === 0)!;
    let s: JourneySession = { ...createJourneyForRules(def, 9), controlledId: "you" };
    for (let i = 0; i < 3 && !s.outcome; i++)
      s = chooseJourney(s, decisionOptions(s)[0].choice.id, 1);
    const list = assessAction(s);
    const m = addAssessments({}, list);
    expect(Object.values(m).flat()).toHaveLength(list.length);
  }, 60_000);

  it("sends the player to the weakest aim first, then to aims not tried yet", () => {
    const pool = pickerItems("midfielder").map((i) => i.def);
    const current = pool[0];
    const weak = pool.find((d) => lessonAim(d) !== lessonAim(current))!;
    const m = addAssessments({}, graded(lessonAim(weak), ["error", "possible", "good"]));
    const next = nextByMastery(current, "midfielder", m);
    expect(lessonAim(next.def)).toBe(lessonAim(weak));
    expect(next.reason).toContain("Ćwiczysz dalej");
    expect(next.def.topicId).not.toBe(current.topicId);

    const mastered = addAssessments({}, graded(lessonAim(weak), Array(6).fill("good")));
    const fresh = nextByMastery(current, "midfielder", mastered);
    expect(aimProgress(mastered, lessonAim(fresh.def)).level).toBe("new");
    expect(fresh.reason).toContain("Nowy cel");
  });

  it("the Start goal is the weakest aim being learnt, never a new or mastered one", () => {
    expect(focusAim({})).toBeNull();
    const m = addAssessments(
      addAssessments(
        addAssessments({}, graded("press", ["error", "possible", "good"])),
        graded("cover", ["error", "error"]),
      ),
      graded("space", Array(6).fill("good")),
    );
    expect(focusAim(m)).toMatchObject({ aim: "cover", label: "Asekuracja", score: 0 });
    expect(focusAim(addAssessments({}, graded("space", Array(6).fill("good"))))).toBeNull();
  });

  it("stores progress per owner and ignores damaged data", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    saveMastery("u1", { press: ["good", "error"] }, storage);
    expect(loadMastery("u1", storage)).toEqual({ press: ["good", "error"] });
    expect(loadMastery("u2", storage)).toEqual({});
    store.set("ballwise:iq:mastery:v1:u3", '{"press":["great"],"cover":["good"]}');
    expect(loadMastery("u3", storage)).toEqual({ cover: ["good"] });
    store.set("ballwise:iq:mastery:v1:u4", "not json");
    expect(loadMastery("u4", storage)).toEqual({});
  });
});
