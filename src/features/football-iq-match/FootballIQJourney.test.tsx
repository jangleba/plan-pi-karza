// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { TacticalPitch } from "./TacticalPitch";
import { FootballIQJourney } from "./FootballIQJourney";
import { journeyBank } from "./journeyBank";
import { chooseJourney, createJourney, journeyStep } from "./journeyEngine";
import { loadJourneyHistory } from "./journeyHistory";
import type { JourneySession } from "./journeyTypes";
const bridge = vi.hoisted(() => ({ props: null as ComponentProps<typeof TacticalPitch> | null }));
vi.mock("./TacticalPitch", () => ({
  TacticalPitch: (props: ComponentProps<typeof TacticalPitch>) => {
    bridge.props = props;
    useEffect(() => {
      props.onReadyChange?.(true);
    }, [props.onReadyChange]);
    return (
      <div data-testid="pitch">
        {props.selectablePlayerIds?.map((id) => (
          <button
            key={id}
            type="button"
            data-player={id}
            onClick={() => props.onPlayerSelect(props.scenario.players.find((p) => p.id === id)!)}
          >
            Zawodnik {id}
          </button>
        ))}
        {props.destinations?.map((d) => (
          <button
            key={d.id}
            type="button"
            data-destination={d.id}
            onClick={() => props.onDestinationSelect?.(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>
    );
  },
}));
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount(position = "midfielder") {
  await act(async () =>
    root.render(<FootballIQJourney position={position} historyOwner="account-a" />),
  );
}
async function clickText(text: string) {
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}
function complete(s: JourneySession): JourneySession | null {
  if (s.outcome) return s.step === 4 && !["loss", "blocked"].includes(s.outcome) ? s : null;
  for (const c of journeyStep(s).choices) {
    const result = complete(chooseJourney(s, c.id));
    if (result) return result;
  }
  return null;
}
describe("individual IQ screen", () => {
  it("keeps action time correct when animation frames are infrequent", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(performance, "now").mockReturnValue(0);
    await mount("goalkeeper");
    const s = createJourney(journeyBank[0]),
      c = journeyStep(s).choices.find((c) => c.quality === "good")!;
    await act(async () =>
      bridge.props!.onPlayerSelect(
        bridge.props!.scenario.players.find((p) => p.id === c.targetId)!,
      ),
    );
    await act(async () => callbacks.shift()!(250));
    await act(async () => callbacks.shift()!(2500));
    expect(host.textContent).toContain("2/4");
    expect(host.textContent).not.toContain("Akcja trwa…");
  });
  it("selects the onboarding position and removes hints in independent mode", async () => {
    await mount("goalkeeper");
    expect(host.textContent).toContain("Bramkarz");
    expect(host.textContent).toContain("Wskazówka");
    await clickText("Bez podpowiedzi");
    expect(host.textContent).not.toContain("Wskazówka");
    expect(bridge.props?.highlights).toBeUndefined();
    expect(bridge.props?.actions).toEqual([]);
  });
  it("plays a full action, records once, and keeps replay and review from adding attempts", async () => {
    await mount("midfielder");
    const definition = journeyBank.find((s) => s.role === "six")!;
    const plan = complete(createJourney(definition))!;
    expect(plan).not.toBeNull();
    for (const d of plan.decisions) {
      await act(async () => {
        const props = bridge.props!;
        if (d.choiceId.startsWith("pass:"))
          props.onPlayerSelect(props.scenario.players.find((p) => p.id === d.choiceId.slice(5))!);
        else props.onDestinationSelect?.(d.choiceId);
      });
    }
    expect(host.textContent).toContain("Moja akcja");
    expect(loadJourneyHistory("account-a")).toHaveLength(1);
    await clickText("Moja akcja");
    expect(loadJourneyHistory("account-a")).toHaveLength(1);
    await clickText("Analiza");
    expect(host.textContent).toContain("Decyzja 1 z 4");
    await clickText("Mój wybór");
    expect(loadJourneyHistory("account-a")).toHaveLength(1);
  });
  it("restores a committed decision after leaving and reopening", async () => {
    await mount("goalkeeper");
    const first = createJourney(journeyBank[0]);
    const choice = journeyStep(first).choices.find((c) => c.quality === "good")!;
    await act(async () =>
      bridge.props!.onPlayerSelect(
        bridge.props!.scenario.players.find((p) => p.id === choice.targetId)!,
      ),
    );
    const expected = Object.fromEntries(bridge.props!.frameOverride!.positions);
    await act(async () => root.unmount());
    root = createRoot(host);
    await mount("goalkeeper");
    expect(Object.fromEntries(bridge.props!.frameOverride!.positions)).toEqual(expected);
    expect(host.textContent).toContain("2/4");
  });
  it("opens the positional catalog and offers all 240 contexts explicitly", async () => {
    await mount("forward");
    const trigger = host.querySelector<HTMLButtonElement>(
      '[aria-label="Wybierz sytuację i rolę"]',
    )!;
    await act(async () => trigger.click());
    expect(host.textContent).toContain("60 scenariuszy");
    const select = host.querySelector("select")!;
    await act(async () => {
      select.value = "all";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.textContent).toContain("240 scenariuszy");
    expect(host.querySelectorAll(".iqJ-scenario")).toHaveLength(240);
  });
});
