// @vitest-environment jsdom
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DailyReadinessCard } from "./DailyReadinessCard";
import { buildReadiness } from "@/lib/loadwise/readinessModel";
import { sessionFixture } from "./session/testFixtures";

// The bottom panel (vaul) is replaced by a plain container; its content is the real form.
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div data-panel>{children}</div> : null,
  DrawerContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

let root: Root, host: HTMLDivElement;
let props: ComponentProps<typeof DailyReadinessCard>;
const today = "2026-11-16";
const recorded = buildReadiness(today, { sleep: 8, fatigue: 3, soreness: 2, jointPain: 0 });
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  props = {
    ownerId: "owner",
    todayIso: today,
    enabled: true,
    onSave: vi.fn(async () => {}),
    onManageConsent: vi.fn(),
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const render = async (next: Partial<typeof props> = {}) => {
  props = { ...props, ...next };
  await act(async () => root.render(<DailyReadinessCard {...props} />));
};
const button = (name: string) =>
  [...host.querySelectorAll("button")].find((item) => item.textContent === name)!;
const click = async (name: string) => act(async () => button(name).click());
const field = (name: string) =>
  host.querySelector<HTMLSelectElement>(`select[aria-label="${name}"]`)!;
const select = async (name: string, value: string) =>
  act(async () => {
    field(name).value = value;
    field(name).dispatchEvent(new Event("change", { bubbles: true }));
  });
const scale = (name: string) =>
  host.querySelector<HTMLFieldSetElement>(`fieldset[aria-label="${name}"]`)!;
const pick = async (name: string, value: string) =>
  act(async () => scale(name).querySelector<HTMLInputElement>(`input[value="${value}"]`)!.click());
const scaleValue = (name: string) =>
  scale(name).querySelector<HTMLInputElement>("input:checked")?.value ?? "";
const fill = async (pain = "0") => {
  await pick("Jakość snu", "8");
  await pick("Zmęczenie", "3");
  await pick("Ból mięśni", "2");
  await pick("Ból stawów lub urazowy", pain);
};

it("collects no health answers without consent and links to profile editing", async () => {
  await render({ enabled: false, value: recorded });
  expect(host.querySelector("input,select,form")).toBeNull();
  expect(host.textContent).not.toContain("Check-in zapisany");
  expect(host.textContent).toContain("Trening pozostaje dostępny bez check-inu");
  await click("Edytuj profil i zgody");
  expect(props.onManageConsent).toHaveBeenCalledOnce();
  expect(props.onSave).not.toHaveBeenCalled();
});

it("does not collect an anonymous draft", async () => {
  await render({ ownerId: undefined });
  expect(host.querySelector("input,select,form")).toBeNull();
  expect(button("Uzupełnij")).toBeUndefined();
});

it("requires all four explicit answers instead of supplying default observations", async () => {
  await render();
  await click("Uzupełnij");
  expect(host.querySelectorAll("input[type=radio]:checked")).toHaveLength(0);
  expect(button("Zapisz check-in").disabled).toBe(true);
  await pick("Jakość snu", "8");
  await pick("Zmęczenie", "3");
  await pick("Ból mięśni", "2");
  expect(button("Zapisz check-in").disabled).toBe(true);
  await pick("Ból stawów lub urazowy", "0");
  expect(button("Zapisz check-in").disabled).toBe(false);
  expect(props.onSave).not.toHaveBeenCalled();
});

it("requires a pain location and clears pain-only answers when pain is set to zero", async () => {
  await render();
  await click("Uzupełnij");
  await fill("3");
  expect(button("Zapisz check-in").disabled).toBe(true);
  await select("Miejsce bólu", "knee");
  await select("Od kiedy czujesz ból?", "today");
  await act(async () => host.querySelector<HTMLInputElement>(".bw-readiness-pain input")!.click());
  expect(button("Zapisz check-in").disabled).toBe(false);
  await pick("Ból stawów lub urazowy", "0");
  expect(field("Miejsce bólu")).toBeNull();
  await click("Zapisz check-in");
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      date: today,
      jointPain: 0,
      painLocation: null,
      painOnset: null,
      altersMovement: false,
    }),
  );
});

it("waits for acknowledgement and prevents a duplicate in-flight save", async () => {
  let resolve!: () => void;
  const onSave = vi.fn(
    () =>
      new Promise<void>((yes) => {
        resolve = yes;
      }),
  );
  await render({ onSave });
  await click("Uzupełnij");
  await fill();
  await click("Zapisz check-in");
  expect(host.textContent).not.toContain("Check-in zapisany");
  expect(button("Zapisywanie…").disabled).toBe(true);
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(onSave).toHaveBeenCalledOnce();
  await act(async () => resolve());
  expect(host.textContent).toContain("Check-in zapisany");
  expect(button("Edytuj")).toBeDefined();
  expect(host.querySelector("form")).toBeNull();
});

it("retains answers and allows retry after a rejected save", async () => {
  const onSave = vi
    .fn()
    .mockRejectedValueOnce(new Error("Brak połączenia"))
    .mockResolvedValue(undefined);
  await render({ onSave });
  await click("Uzupełnij");
  await fill();
  await click("Zapisz check-in");
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("Brak połączenia");
  expect(scaleValue("Jakość snu")).toBe("8");
  expect(scaleValue("Ból stawów lub urazowy")).toBe("0");
  expect(host.textContent).not.toContain("Check-in zapisany");
  await click("Zapisz check-in");
  expect(onSave).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain("Check-in zapisany");
});

it("shows and edits today's saved answers, and cancelling leaves the record unchanged", async () => {
  await render({ value: recorded });
  expect(host.querySelectorAll(".bw-readiness-summary dd")[0].textContent).toBe("8/10");
  await click("Edytuj");
  expect(scaleValue("Jakość snu")).toBe("8");
  await pick("Jakość snu", "1");
  await click("Anuluj");
  expect(host.querySelectorAll(".bw-readiness-summary dd")[0].textContent).toBe("8/10");
  expect(props.onSave).not.toHaveBeenCalled();
});

it("retains red flags independently of zero joint pain", async () => {
  await render();
  await click("Uzupełnij");
  await fill();
  await act(async () => {
    host.querySelector("summary")!.click();
    [...host.querySelectorAll("label")]
      .find((label) => label.textContent === "Ból w klatce piersiowej")!
      .querySelector("input")!
      .click();
  });
  await click("Zapisz check-in");
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({ jointPain: 0, redFlags: ["chest_pain"], overall: 1 }),
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Nie rozpoczynaj treningu");
});

it.each([{ ownerId: "other-owner" }, { todayIso: "2026-11-17" }])(
  "scopes drafts and late save acknowledgements to account and date: %j",
  async (next) => {
    let resolve!: () => void;
    await render({
      onSave: () =>
        new Promise<void>((yes) => {
          resolve = yes;
        }),
    });
    await click("Uzupełnij");
    await fill();
    await click("Zapisz check-in");
    await render(next);
    await act(async () => resolve());
    expect(host.textContent).not.toContain("Check-in zapisany");
    await click("Uzupełnij");
    expect(scaleValue("Jakość snu")).toBe("");
  },
);

it("discards a draft when health consent is revoked and does not restore it after re-enabling", async () => {
  await render();
  await click("Uzupełnij");
  await fill("3");
  await render({ enabled: false });
  expect(host.querySelector("input,select,form")).toBeNull();
  await render({ enabled: true });
  await click("Uzupełnij");
  expect(scaleValue("Jakość snu")).toBe("");
  expect(scaleValue("Ból stawów lub urazowy")).toBe("");
});

it("does not present yesterday's answers as today's report", async () => {
  await render({ value: { ...recorded, date: "2026-11-15" } });
  expect(host.querySelector("dl")).toBeNull();
  await click("Uzupełnij");
  expect(scaleValue("Jakość snu")).toBe("");
});

it("allows skipping without saving and remembers it only for the same account and date", async () => {
  await render();
  await click("Uzupełnij");
  await fill();
  await click("Pomiń na dziś");
  expect(host.querySelector("form")).toBeNull();
  expect(host.textContent).toContain("Check-in pominięty na dziś");
  expect(props.onSave).not.toHaveBeenCalled();
  expect(button("Uzupełnij")).toBeDefined();
  await click("Uzupełnij");
  expect(scaleValue("Jakość snu")).toBe("");
  await click("Pomiń na dziś");
  await render({ ownerId: "other" });
  expect(host.textContent).not.toContain("Check-in pominięty na dziś");
  await render({ ownerId: "owner" });
  expect(host.textContent).toContain("Check-in pominięty na dziś");
  await render({ todayIso: "2026-11-17" });
  expect(host.textContent).not.toContain("Check-in pominięty na dziś");
  await click("Uzupełnij");
  expect(scaleValue("Jakość snu")).toBe("");
});

it("clears hidden pain answers when pain returns to 0 and saves a consistent score", async () => {
  await render();
  await click("Uzupełnij");
  await fill("5");
  await select("Miejsce bólu", "knee");
  await select("Od kiedy czujesz ból?", "today");
  const alters = host.querySelector<HTMLInputElement>(".bw-readiness-check input[type=checkbox]")!;
  await act(async () => alters.click());
  expect(alters.checked).toBe(true);
  await pick("Ból stawów lub urazowy", "0");
  expect(host.querySelector('select[aria-label="Miejsce bólu"]')).toBeNull();
  await click("Zapisz check-in");
  const saved = vi.mocked(props.onSave).mock.calls[0][0];
  expect(saved).toMatchObject({
    jointPain: 0,
    painLocation: null,
    painOnset: null,
    altersMovement: false,
  });
  expect(saved.overall).toBe(
    buildReadiness(today, { sleep: 8, fatigue: 3, soreness: 2, jointPain: 0 }).overall,
  );
  expect(saved.overall).toBeGreaterThan(1);
  // Raising the pain again starts from an empty form, not from the cleared answers.
  await click("Edytuj");
  await pick("Ból stawów lub urazowy", "4");
  expect(field("Miejsce bólu").value).toBe("");
  expect(
    host.querySelector<HTMLInputElement>(".bw-readiness-check input[type=checkbox]")!.checked,
  ).toBe(false);
});

it("is a small card on Start: title, one line and one button; the form lives in the bottom panel", async () => {
  await render();
  expect(host.querySelector("h2")!.textContent).toBe("Samopoczucie");
  expect(host.textContent).toContain("Krótki check-in przed treningiem");
  expect(button("Uzupełnij")).toBeDefined();
  expect(host.querySelector("form")).toBeNull();
  expect(host.querySelector("[data-panel]")).toBeNull();
  await click("Uzupełnij");
  expect(host.querySelector("[data-panel] form")).not.toBeNull();
  // Scales are groups of buttons (radios), not long lists; the answers still start empty.
  expect(host.querySelectorAll("fieldset.bw-scale")).toHaveLength(4);
  expect(scale("Ból stawów lub urazowy").querySelectorAll("input")).toHaveLength(11);
  expect(scale("Jakość snu").querySelectorAll("input")).toHaveLength(10);
  expect(host.querySelectorAll("input[type=radio]:checked")).toHaveLength(0);
});

it("answers are reachable with the keyboard: native radios in one group per scale", async () => {
  await render();
  await click("Uzupełnij");
  for (const name of ["Jakość snu", "Zmęczenie", "Ból mięśni", "Ból stawów lub urazowy"]) {
    const names = new Set(
      [...scale(name).querySelectorAll<HTMLInputElement>("input")].map((input) => input.name),
    );
    expect(names.size).toBe(1);
  }
});

it("after saving, shows the real effect on today's session", async () => {
  const strength = sessionFixture({
    title: "Siła A",
    engineV2: {
      roles: ["strengthA"],
      exercises: [],
    } as unknown as NonNullable<import("@/lib/loadwise/types").SessionDay["engineV2"]>,
  });
  await render({ todaySession: strength });
  await click("Uzupełnij");
  // sleep 8, fatigue 3, soreness 2, no pain: no effect on the session.
  await fill();
  await click("Zapisz check-in");
  expect(host.querySelector('[aria-label="Wpływ na dzisiejszy trening"]')!.textContent).toBe(
    "Bez wpływu na dzisiejszą sesję „Siła A”.",
  );
  // A poorer answer: the load progression waits, the session stays.
  await click("Edytuj");
  await pick("Jakość snu", "5");
  await pick("Zmęczenie", "6");
  await pick("Ból mięśni", "6");
  await click("Zapisz check-in");
  expect(host.querySelector('[aria-label="Wpływ na dzisiejszy trening"]')!.textContent).toContain(
    "ciężary w seriach nie rosną dziś",
  );
});

it("shows that pain pauses today's own session and that a red flag stops training", async () => {
  const session = sessionFixture({
    title: "Sprint",
    engineV2: { roles: ["speed"], exercises: [] } as unknown as NonNullable<
      import("@/lib/loadwise/types").SessionDay["engineV2"]
    >,
  });
  await render({ todaySession: session });
  await click("Uzupełnij");
  await fill("4");
  await select("Miejsce bólu", "knee");
  await click("Zapisz check-in");
  const impact = host.querySelector('[aria-label="Wpływ na dzisiejszy trening"]')!;
  expect(impact.textContent).toContain("wstrzymuje start dzisiejszej sesji własnej „Sprint”");
});
