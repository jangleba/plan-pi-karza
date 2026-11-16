// @vitest-environment jsdom
import { act, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));
vi.mock("@/lib/loadwise/uiHooks", () => ({ useInstantBack: () => vi.fn() }));

import { Route } from "./faq";

const Component = Route.options.component as ComponentType;
let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Component />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function answer(question: string) {
  const trigger = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === question,
  )!;
  await act(async () => trigger.click());
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  return document.getElementById(trigger.getAttribute("aria-controls")!)!.textContent ?? "";
}

it("explains the optional Start check-in, its consent and its separate save action", async () => {
  const text = await answer("Czy przed treningiem muszę zrobić check-in?");
  expect(text).toContain("Na ekranie Start możesz opcjonalnie");
  for (const observation of ["sen", "zmęczenie", "ból mięśni", "ból stawów"])
    expect(text).toContain(observation);
  expect(text).toContain("opcjonalnej zgody na przetwarzanie danych zdrowotnych");
  expect(text).toContain("Profil → Edytuj profil i plan");
  expect(text).toContain("nie rozpoczyna sesji ani nie przebudowuje 28-dniowego planu");
});

it("distinguishes the online check-in from queued training saves", async () => {
  const text = await answer("Co dzieje się bez internetu?");
  expect(text).toContain("Zapisy treningów są najpierw zachowywane na urządzeniu");
  expect(text).toContain("synchronizowane po odzyskaniu połączenia");
  expect(text).toContain("Check-in wymaga internetu");
  expect(text).toContain("bez połączenia nie można go zapisać");
});
