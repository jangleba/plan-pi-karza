// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { TacticalPitch } from "./TacticalPitch";
import { FootballIQJourney } from "./FootballIQJourney";
import { journeyBank } from "./journeyBank";
import { chooseJourney, createJourney, journeyStep, journeyPointChoice } from "./journeyEngine";
import { loadJourneyHistory } from "./journeyHistory";
import type { JourneySession } from "./journeyTypes";
const exports = vi.hoisted(() => ({ deliver: vi.fn() }));
vi.mock("@/lib/loadwise/deliverExportFile", () => ({ deliverExportFile: exports.deliver }));
const bridge = vi.hoisted(() => ({ props: null as ComponentProps<typeof TacticalPitch> | null }));
vi.mock("./TacticalPitch", () => ({
  TacticalPitch: (props: ComponentProps<typeof TacticalPitch>) => {
    bridge.props = props;
    const { onReadyChange } = props;
    useEffect(() => {
      onReadyChange?.(true);
    }, [onReadyChange]);
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
  exports.deliver.mockReset().mockResolvedValue("delivered");
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
    root.render(
      <FootballIQJourney position={position} historyOwner="account-a" initialScenario={0} />,
    ),
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
  it("starts a new positional action and records the explicitly selected delivery", async () => {
    await act(async () =>
      root.render(<FootballIQJourney position="goalkeeper" historyOwner="account-a" />),
    );
    const group = host.querySelector('[aria-label="Rodzaj podania"]')!;
    expect(group).toBeTruthy();
    expect(group.querySelector('[aria-pressed="true"]')?.textContent).toBe("Przerzut");
    await clickText("Po ziemi");
    const s = createJourney(journeyBank.find((d) => d.role === "gk" && d.revision === 2)!);
    const c = journeyStep(s).choices.find((c) => c.delivery === "ground" && c.quality === "good")!;
    await act(async () =>
      bridge.props!.onPlayerSelect(
        bridge.props!.scenario.players.find((p) => p.id === c.targetId)!,
      ),
    );
    const draft = JSON.parse(localStorage.getItem("ballwise:iq:journeys:v1:account-a:draft")!);
    expect(draft.choices[0].id).toBe(c.id);
    expect(host.textContent).toContain("2/5");
  });
  it("shows a transition after a loss and can restart from the reviewed moment", async () => {
    await act(async () =>
      root.render(<FootballIQJourney position="goalkeeper" historyOwner="account-a" />),
    );
    await clickText("Po ziemi");
    const s = createJourney(journeyBank.find((d) => d.role === "gk" && d.revision === 2)!);
    const c = journeyStep(s).choices.find((c) => c.delivery === "ground" && c.quality === "error")!;
    expect(c).toBeTruthy();
    await act(async () =>
      bridge.props!.onPlayerSelect(
        bridge.props!.scenario.players.find((p) => p.id === c.targetId)!,
      ),
    );
    expect(host.textContent).toContain("Strata. Doskok czy powrót?");
    expect(host.textContent).not.toContain("Moja akcja");
    await clickText("Powrót");
    expect(host.textContent).toContain("Osłoniłeś drogę do bramki.");
    expect(loadJourneyHistory("account-a")).toHaveLength(1);
    await clickText("Analiza");
    await clickText("Zagraj od tego momentu");
    expect(host.textContent).toContain("1/5");
    expect(host.querySelector('[aria-label="Rodzaj podania"]')).toBeTruthy();
  });
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
    expect(bridge.props?.showGuidance).toBe(false);
    expect(bridge.props?.destinations).toEqual([]);
    expect(host.querySelector("h1")?.textContent).toBe("Rozegraj sytuację");
  });
  it("switches movement markers off and executes the user's own coordinates in independent mode", async () => {
    await mount("forward");
    expect(bridge.props?.destinations).toHaveLength(2);
    await clickText("Bez podpowiedzi");
    expect(bridge.props?.destinations).toEqual([]);
    expect(bridge.props?.freeMovement).toBe(true);
    expect(host.textContent).not.toContain("Którym korytarzem");
    const d = journeyBank.find((d) => d.role === "wing")!,
      s = createJourney(d),
      p = { x: 42.37, y: 83.91 };
    const c = journeyPointChoice(s, p),
      next = chooseJourney(s, c.id);
    await act(async () => bridge.props!.onPitchSelect(p));
    expect(Object.fromEntries(bridge.props!.frameOverride!.positions)).toEqual(
      next.world.positions,
    );
    expect(bridge.props?.showGuidance).toBe(false);
    const stored = JSON.parse(
      localStorage.getItem(
        next.outcome
          ? "ballwise:iq:journeys:v1:account-a"
          : "ballwise:iq:journeys:v1:account-a:draft",
      )!,
    );
    expect((next.outcome ? stored[0] : stored).choices[0].id).toBe(c.id);
  });
  it("restores the original guided layout when switching back before the first decision", async () => {
    await mount("forward");
    await clickText("Bez podpowiedzi");
    await clickText("Z podpowiedziami");
    expect(bridge.props?.showGuidance).toBe(true);
    expect(bridge.props?.destinations).toHaveLength(2);
    expect(bridge.props?.freeMovement).toBe(false);
    expect(host.textContent).toContain("Wskazówka");
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
  it("does not unlock clearing after a cancelled or unfinished raw backup handoff", async () => {
    await mount("goalkeeper");
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Jak rozegrać akcję"]')!.click(),
    );
    const rawKey = "ballwise:iq:journeys:v1:account-a:draft";
    const original = localStorage.getItem(rawKey);
    const reset = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Wyczyść zapis po wykonaniu kopii"),
    )!;
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    exports.deliver.mockResolvedValueOnce("cancelled");
    await clickText("Pobierz surową kopię zapisu");
    expect(reset.disabled).toBe(true);
    expect(localStorage.getItem(rawKey)).toBe(original);
    expect(host.textContent).toContain("Czyszczenie pozostaje zablokowane");
    expect(exports.deliver).toHaveBeenCalledWith(
      "BallWise-IQ-surowa-kopia.json",
      expect.any(String),
      "application/json",
      "account-a",
    );
    let resolve!: (result: string) => void;
    exports.deliver.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    await clickText("Pobierz surową kopię zapisu");
    expect(reset.disabled).toBe(true);
    await act(async () => resolve("delivered"));
    expect(reset.disabled).toBe(true);
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(reset.disabled).toBe(false);
  });
  it("opens the positional catalog and offers all 480 contexts explicitly", async () => {
    await mount("forward");
    const trigger = host.querySelector<HTMLButtonElement>(
      '[aria-label="Wybierz sytuację i rolę"]',
    )!;
    await act(async () => trigger.click());
    expect(host.textContent).toContain("120 scenariuszy");
    const select = host.querySelector("select")!;
    await act(async () => {
      select.value = "all";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.textContent).toContain("480 scenariuszy");
    expect(host.querySelectorAll(".iqJ-scenario")).toHaveLength(480);
  });
});
