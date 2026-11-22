import { describe, expect, it } from "vitest";
import { applyChoice, choiceNote, estimate1RM, estimatedRM, firstNumber, suggestNext, type LogEntry } from "./progress";

describe("progresja siły", () => {
  it("1RM wg Epleya", () => {
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(100, 5)).toBeCloseTo(116.67, 1);
  });
  it("pierwsza liczba z tekstu powtórzeń", () => {
    expect(firstNumber("5 / nogę")).toBe(5);
    expect(firstNumber("LL-RR")).toBe(1);
  });
  it("potwierdzona dobra sesja: ostrożna propozycja dodania, dolne partie +2,5%", () => {
    const s = suggestNext("back-squat", 100, "none", false, "all")!;
    expect(s.to).toBe(102.5);
    expect(s.options).toEqual(["raise", "stay", "lower", "swap", "skip"]);
  });
  it("góra: +1,25 kg (po potwierdzeniu)", () => {
    expect(suggestNext("bench-press", 80, "none", false, "all")!.to).toBe(81.25);
  });
  it("gorszy check-in lub rozładowanie: bez dodawania, nawet po potwierdzeniu", () => {
    expect(suggestNext("back-squat", 100, "light", false, "all")!.to).toBe(100);
    expect(suggestNext("back-squat", 100, "none", true, "all")!.to).toBe(100);
  });
  it("ćwiczenie bez ciężaru: brak sugestii", () => {
    expect(suggestNext("box-jump", 20, "none", false)).toBeNull();
  });
});

describe("progresja: zaplanowane ≠ wykonane, brak danych ≠ zwiększ", () => {
  it("bez potwierdzenia wykonania NIE ma propozycji zwiększenia (samo wpisanie kg niczego nie potwierdza)", () => {
    const s = suggestNext("back-squat", 100, "none", false)!;
    expect(s.to).toBe(100);
    expect(s.options).not.toContain("raise");
    expect(s.text).toMatch(/Nie potwierdzono/);
  });
  it("wykonanie częściowe lub przerwanie: ciężar bez zmian i zawsze dostępne: zostań, obniż, zmień ćwiczenie, pomiń", () => {
    for (const c of ["partial", "stopped"] as const) {
      const s = suggestNext("back-squat", 100, "none", false, c)!;
      expect(s.to).toBe(100);
      expect(s.options).toEqual(["stay", "lower", "swap", "skip"]);
      expect(s.lowerTo).toBe(97.5);
    }
  });
  it("obniżenie ma sens tylko, gdy ciężar zostaje dodatni", () => {
    expect(suggestNext("bench-press", 1, "none", false, "all")!.lowerTo).toBeUndefined();
  });
  it("1RM tylko z potwierdzonego wykonania wszystkich zaplanowanych powtórzeń", () => {
    const e = (completion?: LogEntry["completion"]): LogEntry => ({ kg: 100, reps: 5, date: "2026-11-19", ...(completion ? { completion } : {}) });
    expect(estimatedRM(e("all"))).toBeCloseTo(116.67, 1);
    expect(estimatedRM(e())).toBeNull();
    expect(estimatedRM(e("partial"))).toBeNull();
    expect(estimatedRM(e("stopped"))).toBeNull();
    expect(estimatedRM(undefined)).toBeNull();
  });
  it("decyzje zawodnika: zwiększ / zostań / obniż ustawiają ciężar, zmień ćwiczenie i pomiń go nie ustawiają", () => {
    const entry: LogEntry = { kg: 100, reps: 5, date: "2026-11-19", completion: "all" };
    const sug = suggestNext("back-squat", 100, "none", false, "all")!;
    expect(applyChoice(entry, sug, "raise")).toMatchObject({ next: 102.5, choice: "raise" });
    expect(applyChoice(entry, sug, "stay")).toMatchObject({ next: 100, choice: "stay" });
    expect(applyChoice(entry, sug, "lower")).toMatchObject({ next: 97.5, choice: "lower" });
    const swap = applyChoice({ ...entry, next: 90 }, sug, "swap");
    expect(swap.next).toBeUndefined();
    expect(swap.choice).toBe("swap");
    expect(applyChoice(entry, sug, "skip").next).toBeUndefined();
    expect(choiceNote(swap)).toMatch(/zmianę ćwiczenia/);
    expect(choiceNote(applyChoice(entry, sug, "skip"))).toMatch(/pominięto/);
    expect(choiceNote(applyChoice(entry, sug, "stay"))).toBeNull();
  });
  it("opcja „zwiększ” jest odrzucana, gdy propozycja jej nie zawiera (brak potwierdzenia)", () => {
    const entry: LogEntry = { kg: 100, reps: 5, date: "2026-11-19" };
    const sug = suggestNext("back-squat", 100, "none", false)!;
    const r = applyChoice(entry, sug, "raise");
    expect(r.next).toBeUndefined(); // nie podnosimy bez potwierdzenia
  });
});

describe("ciężar startowy", () => {
  it("ułamek masy ciała, 2,5 kg, mniej poniżej 18 lat, limit przy butelkach", async () => {
    const { startingKg } = await import("./progress");
    expect(startingKg("goblet-squat", { weightKg: 80, level: "beginner" })).toBe(12.5);
    expect(startingKg("goblet-squat", { weightKg: 80, level: "beginner", age: 16 })).toBe(10);
    expect(startingKg("db-rdl", { weightKg: 100, level: "advanced", improvised: true })).toBe(7.5);
    expect(startingKg("back-squat", { weightKg: 80, level: "beginner" })).toBeNull();
  });
});
