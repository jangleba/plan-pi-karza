// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateTrainingPlan } from "@/lib/loadwise/engineV2/planner";
import { gymAthlete } from "@/lib/loadwise/engineV2/testFixtures";
import { buildRunnerSteps, occurrenceLogKey } from "@/lib/loadwise/sessionRunner/steps";
import { restSecondsAfter } from "@/lib/loadwise/sessionRunner/presentation";
import type { Profile, SessionDay } from "@/lib/loadwise/types";
import { SessionPlanList } from "./SessionPlanList";
import { SprintVariantNote } from "../SprintVariantNote";

const profile = {
  ...gymAthlete,
  goal: "speed",
  hasGym: false,
  trainingMethodPreferences: { spaceLengthM: 70 },
} as unknown as Profile;
function sprintSession(): SessionDay {
  const plan = generateTrainingPlan(profile, { startDate: "2026-11-02", weeks: 1 }).plan;
  return plan
    .flatMap((d) => [d, d.secondSession])
    .find((s): s is SessionDay => !!s?.engineV2?.roles.includes("speed"))!;
}

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("sprint session list: grouped parts and round circuits", () => {
  it("shows preparation → technique → build-ups → main sprint → additions → ending", async () => {
    const session = sprintSession();
    const steps = buildRunnerSteps(session.structuredSections!);
    const onSelect = vi.fn();
    await act(async () =>
      root.render(<SessionPlanList steps={steps} status={() => "open"} onSelect={onSelect} />),
    );
    const titles = [...host.querySelectorAll("section.bw-rplan-group > h3")].map((h) =>
      h.childNodes[0].textContent?.trim(),
    );
    expect(titles).toEqual([
      "Przygotowanie",
      "Technika",
      "Przebieżki",
      "Główny sprint",
      ...(titles.includes("Dodatki") ? ["Dodatki"] : []),
      "Zakończenie",
    ]);
  });

  it("shows the three technique exercises as one block of three rounds, not nine rows", async () => {
    const session = sprintSession();
    const steps = buildRunnerSteps(session.structuredSections!);
    const circuit = steps.filter((step) => step.rows[0].exercise.engineDose?.circuit);
    expect(circuit).toHaveLength(9);
    await act(async () =>
      root.render(<SessionPlanList steps={steps} status={() => "open"} onSelect={vi.fn()} />),
    );
    const block = host.querySelector('[aria-label="Technika biegu · 3 rundy"]')!;
    expect(block).not.toBeNull();
    expect(block.querySelectorAll(".bw-rplan-row")).toHaveLength(3);
    expect(block.textContent).toContain("A-Skip");
    expect(block.textContent).toContain("Ankling");
    expect(block.textContent).toContain("0 z 3 rund");
    // 60 s after the round, as the runner times it — not the 30 s between exercises.
    expect(block.querySelector(".bw-rplan-rest")!.textContent).toContain("1 min po rundzie");
    expect(block.querySelector(".bw-rplan-rest")!.textContent).toContain("30 s między");
  });

  it("keeps every occurrence as its own step with its own id and log key", () => {
    const steps = buildRunnerSteps(sprintSession().structuredSections!);
    const rows = steps.flatMap((step) => step.rows).filter((r) => r.exercise.engineDose?.circuit);
    expect(new Set(rows.map((r) => r.key)).size).toBe(9);
    expect(new Set(rows.map((r) => r.exercise.id)).size).toBe(9);
    const first = rows.filter((r) => r.exercise.name === rows[0].exercise.name);
    expect(first.map((r) => r.occurrence)).toEqual([1, 2, 3]);
    expect(new Set(first.map(occurrenceLogKey)).size).toBe(3);
  });

  it("aggregates status per exercise and opens the first round still open", async () => {
    const steps = buildRunnerSteps(sprintSession().structuredSections!);
    const rows = steps.flatMap((step) => step.rows);
    const circuit = rows.filter((r) => r.exercise.engineDose?.circuit);
    const firstName = circuit[0].exercise.name;
    // Round 1 and 2 of the first exercise done; round 3 open.
    const done = new Set(
      circuit
        .filter((r) => r.exercise.name === firstName)
        .slice(0, 2)
        .map((r) => r.key),
    );
    const onSelect = vi.fn();
    await act(async () =>
      root.render(
        <SessionPlanList
          steps={steps}
          status={(row) => (done.has(row.key) ? "done" : "open")}
          onSelect={onSelect}
        />,
      ),
    );
    const block = host.querySelector('[aria-label="Technika biegu · 3 rundy"]')!;
    expect(block.textContent).toContain("2 z 3 rund");
    const firstButton = block.querySelector("button")!;
    await act(async () => firstButton.click());
    const third = steps.findIndex(
      (step) =>
        step.rows[0].exercise.name === firstName &&
        !done.has(step.rows[0].key) &&
        !!step.rows[0].exercise.engineDose?.circuit,
    );
    expect(onSelect).toHaveBeenCalledWith(third);
  });

  it("preview and execution agree on the rest after a round (postRestSeconds)", () => {
    const steps = buildRunnerSteps(sprintSession().structuredSections!);
    const last = steps
      .flatMap((s) => s.rows)
      .filter((r) => r.exercise.engineDose?.circuit?.task === 3);
    for (const row of last)
      expect(restSecondsAfter(row.block, row.exercise, false, false, true)).toBe(
        row.exercise.engineDose!.postRestSeconds,
      );
    expect(last[0].exercise.engineDose!.postRestSeconds).toBe(60);
  });
});

describe("why the chosen sprint variant is not the requested one", () => {
  it("shows the recorded cause instead of a silent swap", async () => {
    const undeclared = {
      ...profile,
      trainingMethodPreferences: {},
    } as unknown as Profile;
    const session = generateTrainingPlan(undeclared, { startDate: "2026-11-02", weeks: 1 })
      .plan.flatMap((d) => [d, d.secondSession])
      .find((s): s is SessionDay => !!s?.engineV2?.roles.includes("speed"))!;
    await act(async () => root.render(<SprintVariantNote session={session} />));
    const note = host.querySelector('[aria-label="Dobór sprintu"]')!;
    expect(note.textContent).toContain("nie zadeklarowano długości prostej");
    expect(note.textContent).toContain("Zamiast „lotny sprint");
    await act(async () => root.render(<SprintVariantNote session={sprintSession()} />));
    expect(host.querySelector('[aria-label="Dobór sprintu"]')).toBeNull();
  });
});
