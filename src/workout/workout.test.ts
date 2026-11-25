import { describe, expect, it } from "vitest";
import { adjust, countdown, display, elapsed, isDone, parseCountdown, pause, remaining, start } from "./timer";
import { activeSeconds, completionOf, finishRun, markSet, newRun, parseRun, pauseRun, resumable, resumeRun, startTimer, RESUME_WINDOW_MS } from "./run";

const T0 = Date.UTC(2026, 10, 25, 17, 0, 0);

describe("odliczanie liczone od zegara", () => {
  it("po powrocie z tła pokazuje poprawny czas, nawet gdy przez minutę nie było żadnego tyknięcia", () => {
    const c = start(countdown(90_000), T0);
    expect(remaining(c, T0 + 30_000)).toBe(60_000);
    expect(remaining(c, T0 + 120_000)).toBe(0); // ekran był zablokowany dłużej niż przerwa
    expect(isDone(c, T0 + 120_000)).toBe(true);
  });
  it("pauza zatrzymuje, wznowienie kontynuuje od tego miejsca", () => {
    let c = start(countdown(60_000), T0);
    c = pause(c, T0 + 20_000);
    expect(remaining(c, T0 + 500_000)).toBe(40_000);
    c = start(c, T0 + 500_000);
    expect(remaining(c, T0 + 510_000)).toBe(30_000);
  });
  it("cofnięty zegar urządzenia nie dodaje czasu", () => {
    const c = start(countdown(60_000), T0);
    expect(elapsed(c, T0 - 5_000)).toBe(0);
  });
  it("+15 s działa, ale nie poniżej już upłyniętego czasu; format 1:05", () => {
    const c = start(countdown(60_000), T0);
    expect(adjust(c, 15_000, T0).durationMs).toBe(75_000);
    expect(adjust(c, -100_000, T0 + 30_000).durationMs).toBe(30_000);
    expect(display(65_000)).toBe("1:05");
    expect(display(400)).toBe("0:01");
  });
  it("odczyt odrzuca uszkodzony zapis", () => {
    expect(parseCountdown({ durationMs: -1, elapsedMs: 0, runningSince: null })).toBeNull();
    expect(parseCountdown({ durationMs: 1000, elapsedMs: 0, runningSince: T0 })).toMatchObject({ durationMs: 1000 });
  });
});

describe("trening w toku: wznowienie i zapis wykonania", () => {
  const base = () => newRun({ id: "run-1", date: "2026-11-25", sessionKey: "strength", title: "Siła", items: [{ key: "a", label: "Przysiad", setsTotal: 3 }, { key: "b", label: "Nordic", setsTotal: 2 }] }, T0);

  it("odhaczone serie i stoper przetrwają zapis i odczyt (np. po zabiciu aplikacji)", () => {
    let r = markSet(base(), "a", T0 + 60_000);
    r = startTimer(r, 90_000, "Przerwa", T0 + 61_000);
    const back = parseRun(JSON.stringify(r));
    expect(back?.items[0]?.setsDone).toBe(1);
    expect(back && back.timer ? remaining(back.timer, T0 + 121_000) : -1).toBe(30_000);
    expect(resumable(back, T0 + 3_600_000)).toBe(true);
  });
  it("po 18 h od ostatniej zmiany nie proponujemy wznowienia", () => {
    expect(resumable(base(), T0 + RESUME_WINDOW_MS + 1)).toBe(false);
  });
  it("seria nie przekracza zaplanowanej liczby i da się ją cofnąć", () => {
    let r = base();
    for (let i = 0; i < 5; i++) r = markSet(r, "b", T0 + i);
    expect(r.items[1]?.setsDone).toBe(2);
    r = markSet(r, "b", T0 + 10, true);
    expect(r.items[1]?.setsDone).toBe(1);
  });
  it("pauza nie wlicza się do czasu treningu", () => {
    let r = pauseRun(base(), T0 + 10 * 60_000);
    r = resumeRun(r, T0 + 40 * 60_000);
    r = finishRun(r, T0 + 50 * 60_000);
    expect(activeSeconds(r, T0 + 99 * 60_000)).toBe(20 * 60);
  });
  it("podwójne „Zakończ” nie zmienia zapisu (ten sam identyfikator, ten sam czas)", () => {
    const once = finishRun(markSet(base(), "a", T0 + 1), T0 + 600_000);
    const twice = finishRun(once, T0 + 900_000);
    expect(twice).toBe(once);
    const c = completionOf(twice);
    expect(c).toMatchObject({ id: "run-1", status: "partial", setsDone: 1, setsTotal: 5, durationS: 600 });
  });
  it("wszystkie serie = status done", () => {
    let r = base();
    for (const k of ["a", "a", "a", "b", "b"]) r = markSet(r, k, T0 + 1);
    expect(completionOf(finishRun(r, T0 + 2))?.status).toBe("done");
  });
  it("uszkodzony zapis nie blokuje aplikacji", () => {
    expect(parseRun("{nie json")).toBeNull();
    expect(parseRun(JSON.stringify({ v: 2 }))).toBeNull();
  });
});
