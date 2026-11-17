// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DailyReadinessCard } from "./DailyReadinessCard";
import { buildReadiness } from "@/lib/loadwise/readinessModel";

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
const fill = async (pain = "0") => {
  await select("Jakość snu", "8");
  await select("Zmęczenie", "3");
  await select("Ból mięśni", "2");
  await select("Ból stawów lub urazowy", pain);
};

it("collects no health answers without consent and links to profile editing", async () => {
  await render({ enabled: false, value: recorded });
  expect(host.querySelector("input,select,form")).toBeNull();
  expect(host.textContent).not.toContain("check-in zapisany");
  expect(host.textContent).toContain("Trening pozostaje dostępny bez check-inu");
  await click("Edytuj profil i zgody");
  expect(props.onManageConsent).toHaveBeenCalledOnce();
  expect(props.onSave).not.toHaveBeenCalled();
});

it("does not collect an anonymous draft", async () => {
  await render({ ownerId: undefined });
  expect(host.querySelector("input,select,form")).toBeNull();
  expect(button("Wypełnij check-in")).toBeUndefined();
});

it("requires all four explicit answers instead of supplying default observations", async () => {
  await render();
  await click("Wypełnij check-in");
  expect([...host.querySelectorAll("select")].map((item) => item.value)).toEqual(["", "", "", ""]);
  expect(button("Zapisz check-in").disabled).toBe(true);
  await select("Jakość snu", "8");
  await select("Zmęczenie", "3");
  await select("Ból mięśni", "2");
  expect(button("Zapisz check-in").disabled).toBe(true);
  await select("Ból stawów lub urazowy", "0");
  expect(button("Zapisz check-in").disabled).toBe(false);
  expect(props.onSave).not.toHaveBeenCalled();
});

it("requires a pain location and clears pain-only answers when pain is set to zero", async () => {
  await render();
  await click("Wypełnij check-in");
  await fill("3");
  expect(button("Zapisz check-in").disabled).toBe(true);
  await select("Miejsce bólu", "knee");
  await select("Od kiedy czujesz ból?", "today");
  await act(async () => host.querySelector<HTMLInputElement>(".bw-readiness-pain input")!.click());
  expect(button("Zapisz check-in").disabled).toBe(false);
  await select("Ból stawów lub urazowy", "0");
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
  await click("Wypełnij check-in");
  await fill();
  await click("Zapisz check-in");
  expect(host.textContent).not.toContain("check-in zapisany");
  expect(button("Zapisywanie…").disabled).toBe(true);
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(onSave).toHaveBeenCalledOnce();
  await act(async () => resolve());
  expect(host.textContent).toContain("Dzisiejszy check-in zapisany");
  expect(button("Edytuj check-in")).toBeDefined();
  expect(host.querySelector("form")).toBeNull();
});

it("retains answers and allows retry after a rejected save", async () => {
  const onSave = vi
    .fn()
    .mockRejectedValueOnce(new Error("Brak połączenia"))
    .mockResolvedValue(undefined);
  await render({ onSave });
  await click("Wypełnij check-in");
  await fill();
  await click("Zapisz check-in");
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("Brak połączenia");
  expect(field("Jakość snu").value).toBe("8");
  expect(field("Ból stawów lub urazowy").value).toBe("0");
  expect(host.textContent).not.toContain("check-in zapisany");
  await click("Zapisz check-in");
  expect(onSave).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain("check-in zapisany");
});

it("shows and edits today's saved answers, and cancelling leaves the record unchanged", async () => {
  await render({ value: recorded });
  expect(host.querySelectorAll(".bw-readiness-summary dd")[0].textContent).toBe("8/10");
  await click("Edytuj check-in");
  expect(field("Jakość snu").value).toBe("8");
  await select("Jakość snu", "1");
  await click("Anuluj");
  expect(host.querySelectorAll(".bw-readiness-summary dd")[0].textContent).toBe("8/10");
  expect(props.onSave).not.toHaveBeenCalled();
});

it("retains red flags independently of zero joint pain", async () => {
  await render();
  await click("Wypełnij check-in");
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
    await click("Wypełnij check-in");
    await fill();
    await click("Zapisz check-in");
    await render(next);
    await act(async () => resolve());
    expect(host.textContent).not.toContain("check-in zapisany");
    await click("Wypełnij check-in");
    expect(field("Jakość snu").value).toBe("");
  },
);

it("discards a draft when health consent is revoked and does not restore it after re-enabling", async () => {
  await render();
  await click("Wypełnij check-in");
  await fill("3");
  await render({ enabled: false });
  expect(host.querySelector("input,select,form")).toBeNull();
  await render({ enabled: true });
  await click("Wypełnij check-in");
  expect(field("Jakość snu").value).toBe("");
  expect(field("Ból stawów lub urazowy").value).toBe("");
});

it("does not present yesterday's answers as today's report", async () => {
  await render({ value: { ...recorded, date: "2026-11-15" } });
  expect(host.querySelector("dl")).toBeNull();
  await click("Wypełnij check-in");
  expect(field("Jakość snu").value).toBe("");
});

it("allows skipping without saving and remembers it only for the same account and date", async () => {
  await render();
  await click("Wypełnij check-in");
  await fill();
  await click("Pomiń na dziś");
  expect(host.querySelector("form")).toBeNull();
  expect(host.textContent).toContain("Check-in pominięty na dziś");
  expect(props.onSave).not.toHaveBeenCalled();
  expect(button("Wypełnij check-in")).toBeDefined();
  await click("Wypełnij check-in");
  expect(field("Jakość snu").value).toBe("");
  await click("Pomiń na dziś");
  await render({ ownerId: "other" });
  expect(host.textContent).not.toContain("Check-in pominięty na dziś");
  await render({ ownerId: "owner" });
  expect(host.textContent).toContain("Check-in pominięty na dziś");
  await render({ todayIso: "2026-11-17" });
  expect(host.textContent).not.toContain("Check-in pominięty na dziś");
  await click("Wypełnij check-in");
  expect(field("Jakość snu").value).toBe("");
});

it("clears hidden pain answers when pain returns to 0 and saves a consistent score", async () => {
  await render();
  await click("Wypełnij check-in");
  await fill("5");
  await select("Miejsce bólu", "knee");
  await select("Od kiedy czujesz ból?", "today");
  const alters = host.querySelector<HTMLInputElement>(".bw-readiness-check input[type=checkbox]")!;
  await act(async () => alters.click());
  expect(alters.checked).toBe(true);
  await select("Ból stawów lub urazowy", "0");
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
  await click("Edytuj check-in");
  await select("Ból stawów lub urazowy", "4");
  expect(field("Miejsce bólu").value).toBe("");
  expect(
    host.querySelector<HTMLInputElement>(".bw-readiness-check input[type=checkbox]")!.checked,
  ).toBe(false);
});
