// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { TacticalPitch } from "./TacticalPitch";
import { FootballIQJourney } from "./FootballIQJourney";
import { journeyBank } from "./journeyBank";
import { advancedJourneyBank } from "./advancedJourneyBank";
import { chooseJourney, createJourney, journeyStep, journeyPointChoice } from "./journeyEngine";
import {
  loadJourneyHistory,
  makeJourneyAttempt,
  saveJourneyAttempt,
  saveJourneyDraft,
  restoreJourney,
} from "./journeyHistory";
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
async function changeDelivery(value: string) {
  const select = host.querySelector<HTMLSelectElement>('select[aria-label="Rodzaj podania"]')!;
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function select(label: string, value: string) {
  const input = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  expect(input).toBeTruthy();
  await act(async () => {
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
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
  it("lets the player choose a dribble, location and timing without revealing authored destinations", async () => {
    const s = createJourney(advancedJourneyBank[0]);
    saveJourneyDraft("account-a", s, "learn", "free-tactical");
    await mount("goalkeeper");
    await clickText("Bez podpowiedzi");
    await select("Zamiar i moment", "carry:delay");
    await select("Sposób dryblingu", "cut-left");
    expect(bridge.props!.actions).toEqual([]);
    expect(bridge.props!.destinations).toEqual([]);
    const p = { x: s.world.positions.you.x - 8.23, y: s.world.positions.you.y - 4.5 };
    const c = journeyPointChoice(s, p, "carry", "cut-left", "delay"),
      expected = chooseJourney(s, c.id);
    await act(async () => bridge.props!.onPitchSelect(p));
    expect(Object.fromEntries(bridge.props!.frameOverride!.positions)).toEqual(
      expected.world.positions,
    );
    const stored = expected.outcome
      ? loadJourneyHistory("account-a")[0]
      : JSON.parse(localStorage.getItem("ballwise:iq:journeys:v1:account-a:draft")!);
    expect(stored.choices[0].id).toBe(c.id);
  });
  it("explicitly takes over the partner for one decision and saves that actor in the replay", async () => {
    const initial = createJourney(advancedJourneyBank[0]);
    const pass = journeyStep(initial).choices.find((c) => c.id === "t:pass:support:ground")!;
    const base = chooseJourney(initial, pass.id);
    expect(base.outcome).toBeNull();
    expect(base.world.carrierId).not.toBe("you");
    saveJourneyDraft("account-a", base, "learn", "partner-control");
    await mount("goalkeeper");
    expect(bridge.props!.selectedPlayerId).toBe("you");
    const before = localStorage.getItem("ballwise:iq:journeys:v1:account-a:draft");
    await select("Sterowany zawodnik", base.world.carrierId);
    expect(bridge.props!.selectedPlayerId).toBe(base.world.carrierId);
    expect(localStorage.getItem("ballwise:iq:journeys:v1:account-a:draft")).toBe(before);
    await select("Zamiar i moment", "pass:delay");
    await changeDelivery("ground");
    const id = host.querySelector<HTMLElement>("[data-iq-commit]")!.dataset.iqCommit!;
    expect(id).toMatch(/^as6:/);
    expect(bridge.props!.actions[0].playerId).toBe(base.world.carrierId);
    await clickText("Zagraj tak");
    expect(bridge.props!.selectedPlayerId).toBe("you");
    const history = loadJourneyHistory("account-a");
    const stored = history.length
      ? history[0]
      : JSON.parse(localStorage.getItem("ballwise:iq:journeys:v1:account-a:draft")!);
    const replay = restoreJourney(stored);
    expect(replay.decisions.at(-1)!.actorId).toBe(base.world.carrierId);
    expect(replay.decisions.at(-1)!.choiceId).toBe(id);
  });
  it("starts a different advanced action on every fresh entry even without a completed attempt", async () => {
    await act(async () =>
      root.render(<FootballIQJourney position="forward" historyOwner="fresh-owner" />),
    );
    const first = bridge.props!.scenario.id;
    expect(first).toMatch(/^iqx-/);
    expect(bridge.props!.diagram).not.toBe(true);
    expect(bridge.props!.scenario.players).toHaveLength(13);
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () =>
      root.render(<FootballIQJourney position="forward" historyOwner="fresh-owner" />),
    );
    expect(bridge.props!.scenario.id).not.toBe(first);
    expect(loadJourneyHistory("fresh-owner")).toEqual([]);
  });
  it("offers an unfinished action explicitly while showing another fresh task first", async () => {
    const definition = advancedJourneyBank.find((d) => d.role === "six")!;
    const initial = createJourney(definition);
    const partial = chooseJourney(
      initial,
      journeyStep(initial).choices.find((c) => c.quality !== "error")!.id,
    );
    saveJourneyDraft("resume-owner", partial, "learn", "original-draft");
    const raw = localStorage.getItem("ballwise:iq:journeys:v1:resume-owner:draft");
    await act(async () =>
      root.render(<FootballIQJourney position="midfielder" historyOwner="resume-owner" />),
    );
    expect(bridge.props!.scenario.id).not.toBe(definition.id);
    expect(localStorage.getItem("ballwise:iq:journeys:v1:resume-owner:draft")).toBe(raw);
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Jak rozegrać akcję"]')!.click(),
    );
    await clickText("Wznów poprzednią");
    expect(bridge.props!.scenario.id).toBe(definition.id);
    expect(Object.fromEntries(bridge.props!.frameOverride!.positions)).toEqual(
      partial.world.positions,
    );
  });
  it("previews one named movement at a time and records only after explicit confirmation", async () => {
    await mount("forward");
    const draft = () =>
      JSON.parse(localStorage.getItem("ballwise:iq:journeys:v1:account-a:draft")!);
    const first = host.querySelector<HTMLElement>("[data-iq-commit]")!.dataset.iqCommit;
    expect(bridge.props!.destinations).toEqual([]);
    expect(bridge.props!.actions).toHaveLength(1);
    expect(bridge.props!.visibleLabelIds!.length).toBeLessThanOrEqual(3);
    expect(host.textContent).not.toContain("Miejsce");
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Następny wariant"]')!.click(),
    );
    const second = host.querySelector<HTMLElement>("[data-iq-commit]")!.dataset.iqCommit;
    expect(second).not.toBe(first);
    expect(draft().choices).toEqual([]);
    await clickText("Zagraj tak");
    const stored = draft() ?? loadJourneyHistory("account-a")[0];
    expect(stored.choices[0].id).toBe(second);
  });
  it("starts a new positional action and records the explicitly selected delivery", async () => {
    await act(async () =>
      root.render(
        <FootballIQJourney position="goalkeeper" historyOwner="account-a" initialScenario={30} />,
      ),
    );
    const group = host.querySelector('[aria-label="Rodzaj podania"]')!;
    expect(group).toBeTruthy();
    expect((group as HTMLSelectElement).selectedOptions[0].textContent).toBe("Przerzut");
    await changeDelivery("ground");
    const s = createJourney(journeyBank.find((d) => d.role === "gk" && d.revision === 2)!);
    const c = journeyStep(s).choices.find((c) => c.delivery === "ground" && c.quality === "good")!;
    await act(async () =>
      bridge.props!.onPlayerSelect(
        bridge.props!.scenario.players.find((p) => p.id === c.targetId)!,
      ),
    );
    await clickText("Zagraj tak");
    const draft = JSON.parse(localStorage.getItem("ballwise:iq:journeys:v1:account-a:draft")!);
    expect(draft.choices[0].id).toBe(c.id);
    expect(host.textContent).toContain("2/5");
  });
  it("shows a transition after a loss and can restart from the reviewed moment", async () => {
    await act(async () =>
      root.render(
        <FootballIQJourney position="goalkeeper" historyOwner="account-a" initialScenario={30} />,
      ),
    );
    await changeDelivery("ground");
    const s = createJourney(journeyBank.find((d) => d.role === "gk" && d.revision === 2)!);
    const c = journeyStep(s).choices.find((c) => c.delivery === "ground" && c.quality === "error")!;
    expect(c).toBeTruthy();
    await act(async () =>
      bridge.props!.onPlayerSelect(
        bridge.props!.scenario.players.find((p) => p.id === c.targetId)!,
      ),
    );
    await clickText("Zagraj tak");
    expect(host.textContent).toContain("Zareaguj po stracie");
    expect(host.textContent).not.toContain("Moja akcja");
    await act(async () => bridge.props!.onDestinationSelect!("transition:recover"));
    await clickText("Zagraj tak");
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
    await clickText("Zagraj tak");
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
    expect(bridge.props?.destinations).toHaveLength(0);
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
    expect(bridge.props?.destinations).toHaveLength(0);
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
      await clickText("Zagraj tak");
    }
    expect(host.textContent).toContain("Moja akcja");
    const quality = host.querySelector('[aria-label="Jakość decyzji"]')!;
    expect(quality.textContent).toContain(
      `Trafne: ${plan.decisions.filter((d) => d.quality === "good").length}`,
    );
    expect(quality.textContent).toContain(
      `Błędy: ${plan.decisions.filter((d) => d.quality === "error").length}`,
    );
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
    await clickText("Zagraj tak");
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
  it("opens the positional catalog including the advanced contexts", async () => {
    await mount("forward");
    const trigger = host.querySelector<HTMLButtonElement>(
      '[aria-label="Wybierz sytuację i rolę"]',
    )!;
    await act(async () => trigger.click());
    expect(host.textContent).toContain("46 tematów · 138 wariantów");
    const select = host.querySelector<HTMLSelectElement>(".iqJ-dialog select")!;
    await act(async () => {
      select.value = "all";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.textContent).toContain("184 tematów · 552 wariantów");
    expect(host.querySelectorAll(".iqJ-scenario")).toHaveLength(552);
  });
  it("opens another task on a later visit when the previous action was already completed", async () => {
    const first = journeyBank.find((d) => d.role === "six" && d.revision === 2)!;
    let previous = createJourney(first);
    while (!previous.outcome) {
      const choices = journeyStep(previous).choices;
      previous = chooseJourney(
        previous,
        (choices.find((c) => c.quality === "good") ?? choices[0]).id,
        2,
      );
    }
    saveJourneyAttempt("account-a", makeJourneyAttempt(previous, "learn", "completed"));
    await act(async () =>
      root.render(<FootballIQJourney position="midfielder" historyOwner="account-a" />),
    );
    expect(bridge.props?.scenario.id).not.toBe(first.id);
    expect(loadJourneyHistory("account-a")).toHaveLength(1);
  });
});
