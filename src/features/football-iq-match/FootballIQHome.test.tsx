// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("./firstPerson/FirstPersonIQ", () => ({
  FirstPersonIQ: (p: { onOpenClassic: () => void }) => (
    <button type="button" onClick={p.onOpenClassic}>
      first-person
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

describe("IQ tab", () => {
  it("opens the first-person lesson by default and keeps the board situations one tap away", async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<FootballIQMatch historyOwner="u" onBack={() => undefined} />));
    expect(host.textContent).toBe("first-person");
    await act(async () => host.querySelector("button")!.click());
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(host.textContent).toBe("board");
    act(() => host.querySelector("button")!.click());
    expect(host.textContent).toBe("first-person");
    act(() => root.unmount());
  });
});
