// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModifySheet } from "./ModifySheet";
import { sessionFixture } from "./session/testFixtures";

const mocks = vi.hoisted(() => ({ apply: vi.fn(), proposals: vi.fn(), changed: vi.fn() }));
vi.mock("@/lib/loadwise/store", () => ({
  useLoadwise: () => ({ state: { profile: {}, plan: [] }, applyModification: mocks.apply }),
}));
vi.mock("@/lib/loadwise/modifications", () => ({
  buildProposals: mocks.proposals,
  PLACE_LABELS: { dom: "Dom", boisko: "Boisko", silownia: "Siłownia" },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

let host: HTMLDivElement;
let root: Root;
function button(label: string) {
  const result = [...document.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === label,
  );
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mocks.apply.mockReset().mockResolvedValue(undefined);
  mocks.changed.mockReset();
  mocks.proposals
    .mockReset()
    .mockReturnValue({
      message: "Dopasowane sesje",
      safe: [{ id: "proposal-1", session: sessionFixture(), reason: "Lekkie obciążenie" }],
      blocked: [],
    });
  await act(async () =>
    root.render(
      <ModifySheet open onOpenChange={mocks.changed} date="2026-09-29" initialChoice="swap" />,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("session modification form", () => {
  it("opens the requested action directly and retains parameters when returning from proposals", async () => {
    expect(document.body.textContent).toContain("Zamień sesję");
    expect(document.body.textContent).not.toContain("Dodaj lekką sesję");
    await act(async () =>
      document.querySelector<HTMLInputElement>('input[type="radio"][value="45"]')!.click(),
    );
    await click("Pokaż propozycje");
    expect(mocks.proposals).toHaveBeenCalledWith([], {}, "2026-09-29", null, "swap", "boisko", 45);
    await click("Zmień parametry");
    expect(
      document.querySelector<HTMLInputElement>('input[type="radio"][value="45"]')!.checked,
    ).toBe(true);
  });

  it("prevents duplicate writes while pending and preserves the proposal after a failure for retry", async () => {
    let rejectSave!: (error: Error) => void;
    mocks.apply.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectSave = reject;
        }),
    );
    await click("Pokaż propozycje");
    await click("Zamień");
    expect(button("Zapisywanie…").disabled).toBe(true);
    await act(async () => button("Zapisywanie…").click());
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    await act(async () => rejectSave(new Error("Brak połączenia")));
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Brak połączenia");
    expect(button("Zamień").disabled).toBe(false);
    expect(mocks.changed).not.toHaveBeenCalled();
    await click("Zamień");
    expect(mocks.apply).toHaveBeenCalledTimes(2);
    expect(mocks.changed).toHaveBeenCalledWith(false);
  });
});
