// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreparationGuide, RecoveryCoach } from "./PreparationGuide";
import {
  buildRecoveryProtocol,
  type PreparationProtocol,
} from "@/lib/loadwise/preparation/protocols";
let host: HTMLDivElement;
let root: Root;
const finished = vi.fn();
function button(text: string) {
  const found = [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}
async function click(text: string) {
  await act(async () => button(text).click());
}
async function tick(milliseconds: number) {
  await act(async () => vi.advanceTimersByTime(milliseconds));
}
function bilateral(): PreparationProtocol {
  const p = buildRecoveryProtocol("calves");
  return { ...p, id: "test-bilateral", exercises: [p.exercises[2], p.exercises[3]] };
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  window.localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  finished.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function render(protocol = bilateral()) {
  await act(async () =>
    root.render(
      <PreparationGuide protocol={protocol} storageKey="test-user:session-1" onFinish={finished} />,
    ),
  );
}
describe("prowadzenie ćwiczeń na ekranie", () => {
  it("pokazuje obrazek, dwie instrukcje i prowadzi przez stronę, zmianę i przerwę", async () => {
    await render();
    await click("Rozpocznij regenerację");
    expect(host.querySelector('svg[role="img"]')).not.toBeNull();
    expect(host.querySelectorAll(".bw-prep-cues li")).toHaveLength(2);
    expect(host.querySelector('[role="timer"]')?.textContent).toBe("00:30");
    await tick(30000);
    expect(host.querySelector(".bw-prep-side")?.textContent).toBe("Zmień stronę");
    await tick(10000);
    expect(host.querySelector(".bw-prep-side")?.textContent).toBe("Prawa strona");
    await tick(30000);
    expect(host.querySelector(".bw-prep-side")?.textContent).toBe("Przerwa");
    expect(host.querySelector('[role="timer"]')?.textContent).toBe("00:15");
  });
  it("pauzuje bez zużywania czasu i poprawnie wznawia", async () => {
    await render();
    await click("Rozpocznij regenerację");
    await tick(12000);
    await click("Pauza");
    await tick(60000);
    expect(host.querySelector('[role="timer"]')?.textContent).toBe("00:18");
    await click("Wznów");
    await tick(3000);
    expect(host.querySelector('[role="timer"]')?.textContent).toBe("00:15");
  });
  it("po schowaniu aplikacji zatrzymuje prowadzenie", async () => {
    await render();
    await click("Rozpocznij regenerację");
    await tick(5000);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await tick(60000);
    expect(host.querySelector('[role="timer"]')?.textContent).toBe("00:25");
    expect(button("Wznów")).toBeTruthy();
    vi.restoreAllMocks();
  });
  it("nie oznacza automatycznie pominiętych ćwiczeń jako wykonanych", async () => {
    await render();
    await click("Rozpocznij regenerację");
    await click("Pomiń ćwiczenie");
    await click("Pomiń ćwiczenie");
    expect(finished).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Pominięte ćwiczenia: 2");
    await click("Potwierdź zakończenie");
    expect(finished).toHaveBeenCalledWith(false);
  });
  it("ćwiczenie na powtórzenia czeka na świadome potwierdzenie", async () => {
    const p = buildRecoveryProtocol("back");
    await render({ ...p, id: "manual", exercises: [p.exercises[1]] });
    await click("Rozpocznij regenerację");
    await tick(120000);
    expect(host.textContent).toContain("6 powtórzeń");
    expect(host.querySelector('[role="timer"]')).toBeNull();
    await click("Wykonane");
    expect(finished).not.toHaveBeenCalled();
    await click("Potwierdź zakończenie");
    expect(finished).toHaveBeenCalledWith(true);
  });
  it("wybór łydki zmienia zestaw i zaczyna go jednym przyciskiem", async () => {
    await act(async () =>
      root.render(
        <RecoveryCoach
          storageKey="test-user:recovery-1"
          context={{ highLoad: true }}
          onFinish={finished}
        />,
      ),
    );
    await click("Łydki");
    expect(button("Łydki").getAttribute("aria-pressed")).toBe("true");
    expect(host.textContent).toContain("Łydka z ugiętym kolanem");
    await click("Rozpocznij");
    expect(host.querySelector('[role="timer"]')?.textContent).toBe("02:00");
    expect(host.querySelector(".bw-prep-player")).not.toBeNull();
    expect(host.querySelectorAll(".bw-prep-evidence a").length).toBeGreaterThan(0);
  });
  it("blokada w planie uniemożliwia rozpoczęcie regeneracji", async () => {
    await act(async () =>
      root.render(
        <RecoveryCoach
          storageKey="blocked"
          context={{ limited: true }}
          blocked
          onFinish={finished}
        />,
      ),
    );
    expect(button("Rozpocznij").disabled).toBe(true);
    expect(host.querySelector(".bw-prep-player")).toBeNull();
  });
  it("wyjście z widoku zachowuje pozostały czas i powrót otwiera pauzę", async () => {
    const protocol = bilateral();
    await render(protocol);
    await click("Rozpocznij regenerację");
    await tick(11000);
    await act(async () => root.render(null));
    await render(protocol);
    expect(button("Wznów")).toBeTruthy();
    expect(host.querySelector('[role="timer"]')?.textContent).toBe("00:19");
  });
  it("czyści aktywny licznik po opuszczeniu widoku", async () => {
    await render();
    await click("Rozpocznij regenerację");
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => root.render(null));
    expect(vi.getTimerCount()).toBe(0);
  });
});
