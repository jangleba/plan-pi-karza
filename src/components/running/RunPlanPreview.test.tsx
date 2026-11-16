// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sectionFixture, sessionFixture } from "@/components/loadwise/session/testFixtures";
import { applyRunningRecipe } from "@/lib/running/recipeSession";
import { deriveRunningIntervalProtocol } from "@/lib/running/intervals";
import { HIIT_RECIPE, INTERVAL_RECIPE } from "@/lib/running/testRecipes";
import { executionFor } from "@/lib/loadwise/methods/catalogue";
import { RunPlanPreview } from "./RunPlanPreview";
import { RunModePicker } from "./RunModePicker";

let host: HTMLDivElement, root: Root;
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
const contents = (selector: string) =>
  [...host.querySelectorAll(selector)].map((element) => element.textContent);

describe("running plan and tools", () => {
  it("separates the recipe warmup and cooldown from rests between bouts", async () => {
    const day = applyRunningRecipe(sessionFixture(), INTERVAL_RECIPE);
    await act(async () => root.render(<RunPlanPreview session={day} />));
    const rests = contents(".bw-run-plan-row[data-rest]");
    expect(rests).toHaveLength(1);
    expect(rests[0]).toContain("3 min");
    expect(rests[0]).toContain("Między odcinkami · 3 razy");
    expect(rests[0]).not.toContain("10 min");
    const phases = contents('[data-tone="recovery"]');
    expect(phases[0]).toContain("Rozgrzewka10 min");
    expect(phases[1]).toContain("Schłodzenie6 min");
    expect(host.textContent).not.toContain("Po każdym odcinku");
    expect(day.runningRecipe).toEqual(INTERVAL_RECIPE);
  });

  it("keeps the short bout rest and longer rest between sets distinct", async () => {
    const day = applyRunningRecipe(sessionFixture(), HIIT_RECIPE);
    await act(async () => root.render(<RunPlanPreview session={day} />));
    expect(contents('[data-tone="motion"]')).toHaveLength(1);
    expect(contents('[data-tone="motion"]')[0]).toContain("3 serie · 12 × 15 s");
    const rests = contents(".bw-run-plan-row[data-rest]");
    expect(rests).toHaveLength(2);
    expect(rests[0]).toContain("15 sMiędzy odcinkami · 33 razy");
    expect(rests[1]).toContain("3 minMiędzy seriami · 2 razy");
  });

  it("labels legacy method-47 round rests correctly in the real protocol and preview", async () => {
    const day = sessionFixture({
      trainingMethods: {
        schema: "ballwise-methods-v1",
        recipeVersion: "47",
        primary: "M29",
        support: [],
        organization: [],
        selection: "automatic",
        reason: "saved method",
        recipeKey: "saved-hiit-47",
      },
      structuredSections: [
        sectionFixture("main", [
          {
            id: "saved-hiit",
            name: "Interwały 15/15",
            methodExecution: executionFor("M29", {
              rounds: 3,
              repetitions: 4,
              workSeconds: 15,
              restSeconds: 15,
              roundRestSeconds: 180,
            }),
          },
        ]),
      ],
    });
    const protocol = deriveRunningIntervalProtocol(day)!;
    const mainRests = protocol.steps.filter((step) => step.kind === "recovery");
    expect(protocol.steps.filter((step) => step.kind === "work")).toHaveLength(12);
    expect(mainRests.filter((step) => step.target.value === 15)).toHaveLength(9);
    expect(
      mainRests
        .filter((step) => step.label === "Przerwa między seriami")
        .map((step) => step.target.value),
    ).toEqual([180, 180]);
    await act(async () => root.render(<RunPlanPreview session={day} />));
    const rests = contents(".bw-run-plan-row[data-rest]");
    expect(rests).toHaveLength(2);
    expect(rests[0]).toContain("15 sMiędzy odcinkami · 9 razy");
    expect(rests[1]).toContain("3 minMiędzy seriami · 2 razy");
  });

  it("does not invent cone distances for a time-only running prescription", async () => {
    const day = applyRunningRecipe(sessionFixture(), INTERVAL_RECIPE);
    await act(async () => root.render(<RunPlanPreview session={day} />));
    expect(host.querySelector(".bw-run-setup summary")?.textContent).toBe("Przygotuj trasę");
    expect(host.querySelector(".bw-run-setup")?.textContent).toContain("rozpisana na czas");
    expect(host.querySelector(".bw-run-setup svg")).toBeNull();
  });

  it("offers an exact measured course only for an explicit distance target", async () => {
    const day = sessionFixture({
      sections: {
        warmup: [],
        main: [{ name: "Bieg", prescription: "4 × 200 m / 1 min" }],
        accessory: [],
        footballTransfer: [],
        cooldown: [],
      },
    });
    await act(async () => root.render(<RunPlanPreview session={day} />));
    expect(host.querySelector(".bw-run-setup svg")).not.toBeNull();
    expect(host.querySelector(".bw-run-setup")?.textContent).toContain("200 m");
    expect(host.querySelector(".bw-run-setup")?.textContent).not.toContain("rozpisana na czas");
  });

  it("explains the selected measurement without allowing a mode switch during a run", async () => {
    const change = vi.fn();
    await act(async () =>
      root.render(<RunModePicker mode="timer" busy={false} onChange={change} />),
    );
    const buttons = [...host.querySelectorAll("button")];
    expect(buttons[1].getAttribute("aria-pressed")).toBe("true");
    expect(host.textContent).toContain("bez pomiaru dystansu");
    await act(async () => buttons[0].click());
    expect(change).toHaveBeenCalledWith("gps");
    await act(async () => root.render(<RunModePicker mode="timer" busy onChange={change} />));
    change.mockClear();
    await act(async () => buttons[0].click());
    expect(change).not.toHaveBeenCalled();
  });
});
