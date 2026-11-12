// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("./fiveAside/FiveAsideIQ", () => ({
  FiveAsideIQ: (p: { onOpenClassic: () => void; onOpenThreeVsTwo: () => void }) => (
    <>
      <button type="button" onClick={p.onOpenClassic}>
        five
      </button>
      <button type="button" onClick={p.onOpenThreeVsTwo}>
        to-three
      </button>
    </>
  ),
}));
vi.mock("./firstPerson/FirstPersonIQ", () => ({
  FirstPersonIQ: (p: { onBack: () => void }) => (
    <button type="button" onClick={p.onBack}>
      three
    </button>
  ),
}));
vi.mock("./LearningJourney", () => ({
  LearningJourney: (p: { onBack: () => void }) => (
    <button type="button" onClick={p.onBack}>
      board
    </button>
  ),
}));
import { FootballIQMatch } from "./index";

const tick = () => act(() => new Promise((r) => setTimeout(r, 20)));

describe("IQ tab", () => {
  it("opens the 5v5 lesson by default; 3v2 and the board stay one tap away", async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<FootballIQMatch historyOwner="u" onBack={() => undefined} />));
    expect(host.textContent).toBe("fiveto-three");
    await act(async () => host.querySelector("button")!.click());
    await tick();
    expect(host.textContent).toBe("board");
    act(() => host.querySelector("button")!.click());
    expect(host.textContent).toBe("fiveto-three");
    await act(async () => host.querySelectorAll("button")[1]!.click());
    await tick();
    expect(host.textContent).toBe("three");
    act(() => host.querySelector("button")!.click());
    expect(host.textContent).toBe("fiveto-three");
    act(() => root.unmount());
  });
});
