import { describe, expect, it } from "vitest";
import { planWeek } from "./week";
import { cycleWeekFor, planForProfile, validateProfile, type Profile } from "./profile";
import type { WeekInput } from "./types";

const base: WeekInput = {
  weekStart: "2026-11-16", matches: ["2026-11-21"], clubDays: [], level: "intermediate", limitedGymAccess: false,
};
const count = (p: ReturnType<typeof planWeek>, k: string) => p.days.filter((d) => d.session?.kind === k).length;

describe("sezon i cel", () => {
  it("w sezonie bez celu: minimum 1× siła, 1× sprint, 1× bieg", () => {
    const p = planWeek(base);
    expect([count(p, "strength"), count(p, "sprint"), count(p, "run")]).toEqual([1, 1, 1]);
  });
  it("cel szybkość w okresie przygotowawczym: dwa sprinty (obowiązkowo)", () => {
    const p = planWeek({ ...base, matches: [], season: "preseason", goal: "speed" });
    expect(count(p, "sprint")).toBe(2);
    expect(p.warnings).toEqual([]);
  });
  it("cel siła w okresie przygotowawczym: dwie pełne siły nie dzień po dniu, a przy wolnym dniu trzecia: góra", () => {
    const p = planWeek({ ...base, matches: [], season: "preseason", goal: "strength" });
    const full = p.days.map((d, i) => (d.session?.kind === "strength" && d.session.variant !== "upper" ? i : -1)).filter((i) => i >= 0);
    expect(full).toHaveLength(2);
    expect(full[1]! - full[0]!).toBeGreaterThan(1);
    expect(count(p, "strength") - full.length).toBeLessThanOrEqual(1);
    expect(p.days.filter((d) => d.session?.kind === "strength" && d.session.variant === "upper").length).toBeLessThanOrEqual(1);
  });
  it("cel wydolność w sezonie: drugi bieg tylko gdy jest wolny dzień (bez ostrzeżenia)", () => {
    const p = planWeek({ ...base, goal: "endurance" });
    expect(count(p, "run")).toBeGreaterThanOrEqual(1);
    expect(p.warnings).toEqual([]);
  });
  it("przygotowawczy: sparing zaznaczony działa jak mecz (MD-1 itd.)", () => {
    const p = planWeek({ ...base, season: "preseason" });
    expect(p.days.find((d) => d.date === "2026-11-21")!.isMatch).toBe(true);
  });
  it("przerwa: zaznaczony mecz (np. towarzyski) jest w planie, sprint i bieg lekkie, siła zostaje", () => {
    const p = planWeek({ ...base, season: "offseason" });
    expect(p.days.some((d) => d.isMatch)).toBe(true);
    const sprint = p.days.find((d) => d.session?.kind === "sprint")!.session!;
    const run = p.days.find((d) => d.session?.kind === "run")!.session!;
    expect(sprint.variant).toBe("light");
    expect(run.variant).toBe("light");
    expect(count(p, "strength")).toBe(1);
  });
});

const profile: Profile = {
  age: 22, strengthYears: 2, weightKg: 72, position: "pomocnik", equipment: ["gym"],
  clubWeekdays: [], matchWeekdays: [], limitedGymAccess: false, startDate: "2026-11-16",
};

describe("profil: nowe pola", () => {
  it("dzień meczu wymagany tylko w sezonie", () => {
    expect(validateProfile({ ...profile, season: "inseason" })).toContain("Zaznacz dzień meczu.");
    expect(validateProfile({ ...profile, season: "preseason" })).toEqual([]);
    expect(validateProfile({ ...profile, season: "offseason" })).toEqual([]);
  });
  it("powrót po przerwie: dwa pierwsze tygodnie jako rozładowanie, potem zwykły cykl", () => {
    const p = { ...profile, goal: "return" as const };
    expect(cycleWeekFor(p, "2026-11-16")).toBe(5);
    expect(cycleWeekFor(p, "2026-11-23")).toBe(5);
    expect(cycleWeekFor(p, "2026-11-30")).toBe(3);
    expect(cycleWeekFor(profile, "2026-11-16")).toBe(1);
  });
  it("plan z profilu przekazuje sezon i cel", () => {
    const p = planForProfile({ ...profile, season: "preseason", goal: "speed" }, "2026-11-16");
    expect(p.days.filter((d) => d.session?.kind === "sprint")).toHaveLength(2);
  });
});

describe("dni niedostępne", () => {
  it("w dzień niedostępny nie ma żadnej sesji indywidualnej", () => {
    const off = ["2026-11-16", "2026-11-18"];
    const p = planWeek({ ...base, offDays: off });
    for (const d of p.days.filter((x) => off.includes(x.date))) {
      expect(d.isOff).toBe(true);
      expect(d.session).toBeNull();
    }
  });
  it("za mało dni: ostrzeżenie zamiast sesji w dzień niedostępny", () => {
    const off = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"];
    const p = planWeek({ ...base, offDays: off });
    expect(p.days.filter((d) => off.includes(d.date)).every((d) => d.session === null)).toBe(true);
    // miękkie minimum: w tygodniu z meczem brak ostrzeżenia, bez meczu ostrzeżenie zostaje
    expect(p.warnings).toEqual([]);
    expect(planWeek({ ...base, matches: [], offDays: off }).warnings.length).toBeGreaterThan(0);
  });
});

import { feelChange, feelDue, suggestGoals } from "./feel";
describe("drugi cel i samopoczucie na boisku", () => {
  it("drugi cel dodaje sesję, gdy jest miejsce (bez ostrzeżeń)", () => {
    const one = planWeek({ ...base, matches: [], season: "preseason", goal: "speed" });
    const two = planWeek({ ...base, matches: [], season: "preseason", goal: "speed", goal2: "strength" });
    expect(count(two, "strength")).toBe(count(one, "strength") + 1);
    expect(two.warnings).toEqual([]);
  });
  it("drugi cel taki sam jak pierwszy nie dubluje sesji", () => {
    const a = planWeek({ ...base, goal: "speed" });
    const b = planWeek({ ...base, goal: "speed", goal2: "speed" });
    expect(count(b, "sprint")).toBe(count(a, "sprint"));
  });
  it("odpowiedzi podpowiadają cele w kolejności, maks. dwa", () => {
    expect(suggestGoals(["duels", "slow", "stamina"])).toEqual(["strength", "speed"]);
    expect(suggestGoals([])).toEqual([]);
    expect(suggestGoals(["other"])).toEqual([]); // „Inne” nie podpowiada celu
    expect(suggestGoals(["other", "slow"])).toEqual(["speed"]);
  });
  it("pytanie wraca po 5 tygodniach i pokazuje zmianę", () => {
    expect(feelDue(undefined, "2026-11-19")).toBe(true);
    expect(feelDue({ date: "2026-11-01", now: [] }, "2026-11-19")).toBe(false);
    expect(feelDue({ date: "2026-10-01", now: [] }, "2026-11-19")).toBe(true);
    expect(feelChange({ date: "a", now: ["slow", "duels"] }, { date: "b", now: ["duels", "stamina"] })).toEqual({ better: ["slow"], worse: ["stamina"] });
  });
});
