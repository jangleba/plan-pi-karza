// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAttemptPlan, FULL_PROFILE_TEST_IDS } from "@/lib/lab/engine";
import { captureFixture } from "@/lib/lab/testFixtures";
import type { LabMarkers, LabResult, LabTestDefinition } from "@/lib/lab/types";
import { LabFlow } from "./LabFlow";

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  remove: vi.fn(),
  save: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/lib/lab/nativeCamera", () => ({
  recordLabVideo: mocks.record,
  deleteLabVideo: mocks.remove,
}));
vi.mock("@/lib/lab/storage", () => ({ saveLabResult: mocks.save }));
vi.mock("sonner", () => ({ toast: { info: mocks.toast, error: mocks.toast } }));
vi.mock("./FrameAnalyzer", () => ({
  FrameAnalyzer: ({
    test,
    onComplete,
  }: {
    test: LabTestDefinition;
    onComplete: (markers: LabMarkers) => void;
  }) => (
    <button
      onClick={() =>
        onComplete({
          firstFrame: 100,
          secondFrame: test.category === "jump" ? 220 : 580,
          trimStartFrame: 0,
          trimEndFrame: 1599,
          firstGuidePosition: 0.2,
          secondGuidePosition: 0.8,
        })
      }
    >
      Measure
    </button>
  ),
}));

let host: HTMLDivElement;
let root: Root;
const saved = vi.fn();
function button(text: string) {
  return [...host.querySelectorAll("button")].find((el) => el.textContent?.includes(text))!;
}
async function click(text: string) {
  await act(async () => button(text).click());
}
async function render(full = false) {
  await act(async () =>
    root.render(
      <LabFlow
        userId="u"
        attempts={createAttemptPlan(full ? FULL_PROFILE_TEST_IDS : ["cmj"])}
        onSaved={saved}
        onClose={() => {}}
      />,
    ),
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mocks.record.mockReset().mockResolvedValue(captureFixture());
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.save
    .mockReset()
    .mockImplementation(async (result: LabResult) => ({ result, cloudSaved: false }));
  mocks.toast.mockReset();
  saved.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("LAB measurement flow", () => {
  it("saves once on a double click and deletes the video only after durable save", async () => {
    let finish!: (value: { result: LabResult; cloudSaved: boolean }) => void;
    mocks.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    await click("Nagraj");
    await act(async () => {
      button("Measure").click();
      button("Measure").click();
    });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.remove).not.toHaveBeenCalled();
    const result = mocks.save.mock.calls[0][0];
    await act(async () => finish({ result, cloudSaved: false }));
    expect(mocks.remove).toHaveBeenCalledWith(captureFixture().path);
    expect(saved).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("30,6 cm");
  });

  it("retains the recording on local storage failure and allows retry", async () => {
    mocks.save.mockRejectedValueOnce(new Error("quota"));
    await render();
    await click("Nagraj");
    await click("Measure");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
    expect(button("Measure")).toBeDefined();
    await click("Measure");
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it("records an extra trial with a new ID and sequential trial number", async () => {
    await render();
    await click("Nagraj");
    await click("Measure");
    await click("Powtórz");
    await click("Nagraj");
    await click("Measure");
    await click("Następna próba");
    await click("Nagraj");
    await click("Measure");
    const rows = mocks.save.mock.calls.map(([result]) => result as LabResult);
    expect(rows.map((row) => row.trialNumber)).toEqual([1, 2, 3]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(3);
  });

  it("completes all 17 attempts without ball tests", async () => {
    await render(true);
    for (let i = 0; i < 17; i++) {
      await click("Nagraj");
      await click("Measure");
      await click(i === 16 ? "Zobacz podsumowanie" : "Następna próba");
    }
    expect(saved).toHaveBeenCalledTimes(17);
    expect(host.textContent).toContain("Profil ukończony");
    expect(host.textContent).toContain("Asymetria skoku");
    expect(host.textContent).toContain("Asymetria 505");
    expect(host.textContent).not.toContain("z piłką");
    expect(new Set(mocks.save.mock.calls.map(([row]) => row.testId)).size).toBe(5);
  });
});
