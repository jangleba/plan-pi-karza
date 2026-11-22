import { describe, expect, it } from "vitest";
import { ACUTE_HIGH, ACUTE_MODERATE, WEEK_HIGH, WEEK_VERY_HIGH, loadNote, rpeLabel, weekLevel, weekLoadTotal, loadOf, loadSummary, normalizeExtras, weekExtraLoad, withExtraLoad, type ExtraActivity } from "./extra";
import { adaptSession, readinessScore, strainOf, type CheckIn } from "./adapt";
import type { HistoryEvent } from "./history";

const ok: CheckIn = { recovery: 3, feeling: 3, less: false };
const E = { easy: 3, medium: 5, hard: 8 } as const;
const ex = (date: string, kind: ExtraActivity["kind"], minutes: number, effort: keyof typeof E, id = `${date}${kind}`): ExtraActivity => ({ id, date, kind, minutes, rpe: E[effort] });
const T = "2026-11-22";

describe("własna jednostka: obciążenie", () => {
  it("minuty × wysiłek × waga rodzaju; sauna i spacer liczą się mało", () => {
    expect(loadOf(ex(T, "run", 60, "medium"))).toBe(300);
    expect(loadOf(ex(T, "football", 70, "hard"))).toBe(560);
    expect(loadOf(ex(T, "sauna", 30, "easy"))).toBe(23);
    expect(loadOf(ex(T, "walk", 60, "easy"))).toBe(90);
    expect(loadOf(ex(T, "bike", 120, "medium"))).toBe(480);
  });

  it("czas ponad 240 min jest obcinany", () => { expect(loadOf(ex(T, "run", 999, "easy"))).toBe(240 * 3); });

  it("spacer, sauna i basen nie ruszają planu", () => {
    const e = [ex(T, "walk", 90, "easy"), ex(T, "sauna", 30, "easy"), ex(T, "swim", 40, "easy")];
    const r = withExtraLoad(ok, e, [], T);
    expect(r.adjusted).toBe(false);
    expect(r.checkIn).toEqual(ok);
  });

  it("wczoraj ciężka jednostka obniża regenerację o 1 i skraca sesję; samopoczucie bez zmian", () => {
    const e = [ex("2026-11-21", "football", 90, "hard")]; // 90×8 = 720; po dobie ×0,6 = 432 → próg 450 niewiele...
    const s = loadSummary(e, [], T);
    expect(s.acute).toBe(432);
    expect(s.level).toBe("low");
    const e2 = [ex("2026-11-21", "football", 120, "hard")]; // 960 × 0,6 = 576
    const r = withExtraLoad(ok, e2, [], T);
    expect(r.summary.level).toBe("moderate");
    expect(r.checkIn).toEqual({ recovery: 2, feeling: 3, less: false });
    expect(r.adjusted).toBe(true);
    expect(readinessScore(r.checkIn)).toBeLessThan(readinessScore(ok));
    expect(strainOf(r.checkIn)).toBe("light");
  });

  it("dwa ciężkie dni z rzędu: duże obciążenie → regeneracja 1, „dziś mniej” i wyraźnie lżej", () => {
    const e = [ex(T, "run", 90, "hard"), ex("2026-11-21", "football", 90, "hard")]; // 720 + 720×0,6
    const r = withExtraLoad(ok, e, [], T);
    expect(r.summary.acute).toBeGreaterThanOrEqual(ACUTE_HIGH);
    expect(r.checkIn).toEqual({ recovery: 1, feeling: 3, less: true });
    expect(loadNote(r.summary)).toMatch(/bardzo ciężkie/);
  });

  it("regeneracja nie spada poniżej 1, a już słaby check-in zostaje słaby", () => {
    const bad: CheckIn = { recovery: 1, feeling: 1, less: false };
    expect(withExtraLoad(bad, [ex(T, "run", 120, "hard")], [], T).checkIn.recovery).toBe(1);
  });

  it("sesje z aplikacji wykonane wczoraj dokładają się do obciążenia własnego", () => {
    const h: HistoryEvent[] = [{ date: "2026-11-21", type: "session", key: "strength", value: 1 }];
    const e = [ex("2026-11-21", "football", 60, "hard")]; // 480 + 330 = 810 × 0,6 = 486
    expect(loadSummary(e, h, T).acute).toBe(486);
    expect(loadSummary(e, h, T).level).toBe("moderate");
    expect(loadSummary(e, [], T).level).toBe("low");
    // regeneracja zamiast sesji (viaRest) nie liczy się jako obciążenie
    expect(loadSummary([], [{ ...h[0]!, viaRest: true }], T).acute).toBe(0);
  });

  it("jednostka sprzed 3 dni nie wpływa na dziś", () => {
    expect(loadSummary([ex("2026-11-19", "run", 120, "hard")], [], T).acute).toBe(0);
  });

  it("plan staje się lżejszy: mniej serii w sesji siłowej po dużym obciążeniu", () => {
    const r = withExtraLoad(ok, [ex("2026-11-21", "football", 120, "hard")], [], T);
    const t = { name: "Siła", blocks: [{ title: "A", items: [{ exerciseId: "squat", sets: 4, reps: "5" }] }] } as unknown as Parameters<typeof adaptSession>[0];
    const before = adaptSession(t, ok).blocks[0]!.items[0]!.sets;
    const after = adaptSession(t, r.checkIn).blocks[0]!.items[0]!.sets;
    expect(after).toBeLessThan(before);
  });

  it("progi są uporządkowane", () => { expect(ACUTE_MODERATE).toBeLessThan(ACUTE_HIGH); });
});

describe("własna jednostka: zapis i tydzień", () => {
  it("normalizacja pomija błędne wpisy i ogranicza czas", () => {
    const r = normalizeExtras([
      { id: "a", date: T, kind: "run", minutes: 500, rpe: 8 },
      { id: "b", date: "złe", kind: "run", minutes: 30, rpe: 3 },
      { id: "c", date: T, kind: "nieznany", minutes: 30, rpe: 3 },
      { id: "a", date: T, kind: "bike", minutes: 30, rpe: 3 },
      null, 5,
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.minutes).toBe(240);
    expect(normalizeExtras("x")).toEqual([]);
  });

  it("suma tygodnia liczy tylko wpisy od poniedziałku do niedzieli", () => {
    const e = [ex("2026-11-16", "run", 30, "medium"), ex("2026-11-22", "bike", 60, "easy"), ex("2026-11-23", "run", 30, "medium")];
    expect(weekExtraLoad(e, "2026-11-16")).toEqual({ count: 2, minutes: 90, load: 150 + 144 });
  });
});

describe("własna jednostka: skala 1–10 i tydzień", () => {
  it("wysiłek 1–10: etykiety i obcinanie do skali", () => {
    expect([1, 3, 4, 6, 7, 10].map(rpeLabel)).toEqual(["Lekko", "Lekko", "Średnio", "Średnio", "Mocno", "Mocno"]);
    expect(loadOf({ kind: "run", minutes: 60, rpe: 99 })).toBe(600);
    expect(loadOf({ kind: "run", minutes: 60, rpe: 0 })).toBe(60);
  });

  it("starszy zapis z trzema poziomami słownymi jest przeliczany na skalę", () => {
    const r = normalizeExtras([{ id: "x", date: T, kind: "run", minutes: 30, effort: "hard" }]);
    expect(r[0]!.rpe).toBe(8);
  });

  it("obciążenie tygodnia: własne jednostki + sesje z aplikacji do dziś, poziomy", () => {
    const e = [ex("2026-11-16", "football", 90, "hard"), ex("2026-11-18", "bike", 90, "medium"), ex("2026-11-23", "run", 90, "hard")];
    const h: HistoryEvent[] = [{ date: "2026-11-17", type: "session", key: "strength", value: 1 }, { date: "2026-11-19", type: "session", key: "run", value: 1 }];
    const total = weekLoadTotal(e, h, "2026-11-16", T);
    expect(total).toBe(720 + 360 + 330 + 300); // jednostka z 23.11 jest po „dziś”
    expect(weekLevel(total)).toBe("ok");
    expect(weekLevel(WEEK_HIGH)).toBe("high");
    expect(weekLevel(WEEK_VERY_HIGH)).toBe("veryHigh");
  });
});

import { planWeek } from "./week";
import type { WeekInput } from "./types";

describe("własna jednostka: wpływ na plan tygodnia", () => {
  // tydzień 16–22.11, mecz w sobotę 21.11 nie potrzebny: sprawdzamy dni po środzie
  const base: WeekInput = { weekStart: "2026-11-16", matches: ["2026-11-28"], clubDays: ["2026-11-17", "2026-11-19"], level: "intermediate", limitedGymAccess: false, strengthYears: 3 };
  const ids = (p: ReturnType<typeof planWeek>) => p.days.map((d) => (d.session ? `${d.session.kind}:${d.session.variant}` : "-"));

  it("bez obciążenia plan jest taki sam jak dotąd", () => {
    expect(planWeek({ ...base, weekLoad: { level: "ok", from: "2026-11-18" } })).toEqual(planWeek(base));
  });

  it("ciężki tydzień: sesje po dniu zgłoszenia są lżejsze, wcześniejsze bez zmian", () => {
    const plain = planWeek(base);
    const heavy = planWeek({ ...base, weekLoad: { level: "high", from: "2026-11-18" } });
    heavy.days.forEach((d, i) => {
      const p = plain.days[i]!;
      if (d.date <= "2026-11-18") expect(d.session).toEqual(p.session);
      else if (p.session && ["strength", "run", "sprint"].includes(p.session.kind)) expect(d.session?.variant).toBe("light");
    });
    expect(heavy.warnings.join(" ")).toMatch(/ciężki/);
  });

  it("bardzo ciężki tydzień: pierwszy wolny dzień po zgłoszeniu staje się regeneracją", () => {
    const plain = planWeek(base);
    const hv = planWeek({ ...base, weekLoad: { level: "veryHigh", from: "2026-11-18" } });
    const firstFree = plain.days.find((d) => d.date > "2026-11-18" && !d.session && !d.isMatch && !d.isOff);
    if (firstFree) {
      const got = hv.days.find((d) => d.date === firstFree.date)!;
      expect(got.session?.kind).toBe("recovery");
    }
    expect(ids(hv)).toHaveLength(7);
  });

  it("dzień meczu i dni niedostępne nigdy nie dostają regeneracji", () => {
    const hv = planWeek({ ...base, matches: ["2026-11-21"], offDays: ["2026-11-20"], weekLoad: { level: "veryHigh", from: "2026-11-18" } });
    const m = hv.days.find((d) => d.date === "2026-11-21")!;
    expect(m.isMatch && m.session).toBeFalsy();
    expect(hv.days.find((d) => d.date === "2026-11-20")!.session).toBeNull();
  });
});
