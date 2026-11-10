import { describe, expect, it } from "vitest";
import { lessonAim, type DecisionAssessment } from "./decisionAssessment";
import { pickerItems } from "./journeyGuide";
import {
  addAssessments,
  loadProblems,
  nextByMastery,
  PROBLEM_AIMS,
  pictureFor,
  picturesByDifficulty,
  problemLabels,
  recurringProblem,
  saveProblems,
  updateProblems,
  type ProblemEntry,
} from "./mastery";
import { aimProgress } from "./masteryStore";
import { GOOD_SHARE } from "./pictureDifficulty";
import { situationBank } from "./situationBank";

const withProblem = (problem: DecisionAssessment["problem"]) =>
  ({ problem, grade: problem ? "possible" : "good" }) as DecisionAssessment;
const def = (topic: string) => situationBank.find((d) => d.topicId === `iqs-${topic}`)!;

describe("choosing by error type", () => {
  it("maps every problem to aims that some offered situation trains", () => {
    const aims = new Set(pickerItems(undefined, true).map((i) => lessonAim(i.def)));
    for (const [problem, list] of Object.entries(PROBLEM_AIMS)) {
      expect(problemLabels[problem as keyof typeof problemLabels]).toBeTruthy();
      expect(
        list.some((a) => aims.has(a)),
        problem,
      ).toBe(true);
    }
  });

  it("finds a recurring problem only when it comes back", () => {
    const one: ProblemEntry[] = [{ problem: "marked", topicId: "iqs-six-pivot" }];
    expect(recurringProblem(one)).toBeNull();
    const two = [...one, { problem: "marked", topicId: "iqs-low-block" } as ProblemEntry];
    expect(recurringProblem(two)).toEqual(two[1]);
  });

  it("sends a recurring problem to the same principle in another situation", () => {
    const log: ProblemEntry[] = [
      { problem: "receiver-lane-closed", topicId: "iqs-six-pivot" },
      { problem: "receiver-lane-closed", topicId: "iqs-six-pivot" },
    ];
    const current = def("six-pivot");
    const next = nextByMastery(current, "midfielder", {}, log);
    expect(next.kind).toBe("transfer");
    expect(next.def.topicId).not.toBe("iqs-six-pivot");
    expect(PROBLEM_AIMS["receiver-lane-closed"]).toContain(lessonAim(next.def));
    expect(next.reason).toContain("Ta sama zasada w innej sytuacji");
    expect(next.reason).toContain(problemLabels["receiver-lane-closed"]);
  });

  it("drops a problem once a lesson that trains it goes without it", () => {
    const log: ProblemEntry[] = [
      { problem: "receiver-lane-closed", topicId: "iqs-six-pivot" },
      { problem: "receiver-lane-closed", topicId: "iqs-six-pivot" },
      { problem: "bypassed", topicId: "iqs-cb-delay" },
    ];
    const clean = updateProblems(log, [withProblem(null)], def("low-block"));
    expect(clean).toEqual([{ problem: "bypassed", topicId: "iqs-cb-delay" }]);
    const again = updateProblems(log, [withProblem("receiver-lane-closed")], def("low-block"));
    expect(again.filter((e) => e.problem === "receiver-lane-closed")).toHaveLength(3);
    expect(recurringProblem(clean)).toBeNull();
  });

  it("raises difficulty with progress: easiest picture first, hardest once mastered", () => {
    const topic = "iqs-cb-cover";
    const list = picturesByDifficulty(topic);
    expect(list.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < list.length; i++)
      expect(GOOD_SHARE[list[i - 1].id]).toBeGreaterThanOrEqual(GOOD_SHARE[list[i].id]);
    const first = list[0];
    const aim = lessonAim(first);
    expect(pictureFor(first, aimProgress({}, aim)).id).toBe(list[0].id);
    const mastered = addAssessments(
      {},
      Array.from({ length: 6 }, () => ({ aim, grade: "good" }) as DecisionAssessment),
    );
    expect(pictureFor(first, aimProgress(mastered, aim)).id).toBe(list.at(-1)!.id);
  });

  it("keeps only valid entries from storage", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    saveProblems("o", [{ problem: "marked", topicId: "iqs-x" }], storage);
    expect(loadProblems("o", storage)).toEqual([{ problem: "marked", topicId: "iqs-x" }]);
    store.set("ballwise:iq:problems:v1:o", JSON.stringify([{ problem: "nope", topicId: "x" }, 3]));
    expect(loadProblems("o", storage)).toEqual([]);
    store.set("ballwise:iq:problems:v1:o", "{");
    expect(loadProblems("o", storage)).toEqual([]);
  });
});
