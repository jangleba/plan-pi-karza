import { describe, expect, it } from "vitest";
import type { RunningIntervalStep } from "@/lib/running/types";
import { runningPreviewRows } from "./runPlanPresentation";

function work(id: string, pace: string): RunningIntervalStep {
  return {
    id,
    kind: "work",
    label: "Bieg",
    instruction: "Równo",
    repeatIndex: 1,
    repeatTotal: 2,
    target: {
      mode: "time",
      value: 120,
      label: "2:00",
      autoAdvance: true,
      paceTarget: { fastestSecPerKm: 300, slowestSecPerKm: 330, label: pace },
    },
  };
}
describe("running plan presentation", () => {
  it("does not collapse equal-duration bouts when the pace changes", () => {
    const rows = runningPreviewRows({
      title: "Bieg",
      summary: "",
      steps: [work("a", "5:00–5:30/km"), work("b", "4:30–5:00/km")],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].details).toContain("Tempo 5:00–5:30/km");
    expect(rows[1].details).toContain("Tempo 4:30–5:00/km");
  });

  it("keeps a returning pace in its original place in a varied sequence", () => {
    const first = work("a", "5:00–5:30/km");
    const middle = work("b", "4:30–5:00/km");
    const last = { ...first, id: "c" };
    expect(
      runningPreviewRows({ title: "Bieg", summary: "", steps: [first, middle, last] }).map(
        (row) => row.id,
      ),
    ).toEqual(["a", "b", "c"]);
  });

  it("summarizes equal complete sets without changing their repetition count", () => {
    const steps = [1, 1, 2, 2].map((setIndex, index) => ({
      ...work(String(index), "5:00–5:30/km"),
      setIndex,
      setTotal: 2,
    }));
    expect(runningPreviewRows({ title: "Bieg", summary: "", steps })[0].title).toBe(
      "2 serie · 2 × 2 min",
    );
  });

  it.each([
    [1, 1, 1, 2],
    [1, 1, 3, 3],
    [1, 1, undefined, undefined],
  ])("does not invent equal complete sets from set indices %j", (...indices) => {
    const steps = indices.map((setIndex, index) => ({
      ...work(String(index), "5:00–5:30/km"),
      setIndex,
      setTotal: 2,
    }));
    expect(runningPreviewRows({ title: "Bieg", summary: "", steps })[0].title).toBe("4 × 2 min");
  });
});
