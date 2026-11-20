import { beforeEach, describe, expect, it } from "vitest";
import { MD1_STRENGTH_MIN_YEARS, planForProfile, planWeek, strengthDayInfo, strengthMoveText, type Profile, type WeekInput } from "./index";
import { loadBlocked, setBlocked } from "../lib/blocked";
import { scoped, setScope } from "../lib/store";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(), key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
} as Storage;
beforeEach(() => { mem.clear(); setScope({ kind: "guest" }); });

// tydzień pn 16.11 – nd 22.11, mecz w sobotę 21.11
const MON = "2026-11-16", TUE = "2026-11-17", WED = "2026-11-18", THU = "2026-11-19", FRI = "2026-11-20", SAT = "2026-11-21", SUN = "2026-11-22";
const base: WeekInput = { weekStart: MON, matches: [SAT], clubDays: [], level: "intermediate", limitedGymAccess: false, strengthYears: 3 };
const by = (p: ReturnType<typeof planWeek>, d: string) => p.days.find((x) => x.date === d)!;
const strengthDays = (p: ReturnType<typeof planWeek>) => p.days.filter((d) => d.session?.kind === "strength").map((d) => d.date);

describe("silnik widzi dni z siłownią (tylko kilka razy w tygodniu)", () => {
  it("bez ograniczeń siła jest 3 dni przed meczem; z dostępem tylko we wtorek i czwartek – we wtorek (czwartek to MD-2, siły tam nie ma)", () => {
    expect(strengthDays(planWeek(base))).toEqual([WED]);
    const p = planWeek({ ...base, gymDays: [TUE, THU], limitedGymAccess: true });
    expect(strengthDays(p)).toEqual([TUE]);
    expect(p.warnings).toEqual([]);
  });
  it("siła nigdy nie trafia na dzień bez dostępu do siłowni; gdy żaden dozwolony dzień nie pasuje – ostrzeżenie zamiast cichego złamania ograniczenia", () => {
    const p = planWeek({ ...base, gymDays: [FRI], limitedGymAccess: true }); // piątek to MD-1: siły nie planujemy
    expect(strengthDays(p)).toEqual([]);
    expect(p.warnings.join(" ")).toMatch(/Brak miejsca na sesję: siła/);
  });
  it("dodatkowa sesja siłowa z celu też respektuje dni z siłownią", () => {
    const p = planWeek({ ...base, season: "preseason", matches: [], goal: "strength", gymDays: [MON, WED, FRI], limitedGymAccess: true });
    for (const d of strengthDays(p)) expect([MON, WED, FRI]).toContain(d);
    expect(strengthDays(p).length).toBe(2);
  });
});

describe("dzień po meczu dla siły: ostatnia opcja i dopiero od 2 lat stażu", () => {
  const onlyMd1 = { ...base, matches: [WED], offDays: [MON, TUE, FRI, SAT, SUN] }; // wolny jest tylko czwartek = MD+1 (środa to mecz)
  it("stażysta (1 rok): siły dzień po meczu NIE planujemy, jest ostrzeżenie", () => {
    const p = planWeek({ ...onlyMd1, strengthYears: 1 });
    expect(strengthDays(p)).toEqual([]);
    expect(p.warnings.join(" ")).toMatch(/siła/);
  });
  it(`od ${MD1_STRENGTH_MIN_YEARS} lat stażu siła ląduje dzień po meczu (jako ostatnia opcja)`, () => {
    const p = planWeek({ ...onlyMd1, strengthYears: MD1_STRENGTH_MIN_YEARS });
    expect(strengthDays(p)).toEqual([THU]);
  });
  it("gdy jest lepszy dzień (MD-3, wolny), dzień po meczu nie jest wybierany nawet przy dużym stażu", () => {
    expect(strengthDays(planWeek({ ...base, strengthYears: 10 }))).toEqual([WED]);
  });
});

describe("zawodnik zgłasza „dziś bez siły”: siła jest przekładana", () => {
  const blocked = (days: string[], since = WED, over: Partial<WeekInput> = {}) => planWeek({ ...base, noStrengthDays: days.map((date) => ({ date, since })), ...over });
  it("siła ze środy trafia dzień po meczu (niedziela) przy stażu 2+ lat, z oznaczeniem skąd została przełożona", () => {
    const p = blocked([WED]);
    expect(strengthDays(p)).toEqual([SUN]);
    expect(by(p, WED).session).toBeNull();
    expect(by(p, SUN).session).toMatchObject({ kind: "strength", movedFrom: WED });
    expect(by(p, SUN).session!.reason).toMatch(/Przełożona z środy/);
    expect(by(p, SUN).phase).toBe("MD+1");
  });
  it("przy stażu poniżej 2 lat siły nie ma gdzie przełożyć: znika z tygodnia z jawnym ostrzeżeniem (bez cichego ‘upchnięcia’ dzień po meczu)", () => {
    const p = blocked([WED], WED, { strengthYears: 1 });
    expect(strengthDays(p)).toEqual([]);
    expect(p.warnings.join(" ")).toMatch(/Siła z środy nie zmieściła się w tym tygodniu/);
    expect(p.warnings.join(" ")).toMatch(/stażu siłowym od 2 lat/);
  });
  it("jeśli jest wcześniejszy dozwolony dzień (zgłoszenie z wyprzedzeniem), siła jest przekładana tam, a nie dzień po meczu", () => {
    const p = blocked([WED], TUE); // zgłoszone we wtorek: wtorek (poza fazą MD-3) też się nadaje
    expect(strengthDays(p)).toEqual([TUE]);
    expect(by(p, TUE).session!.movedFrom).toBe(WED);
  });
  it("przełożona siła nie zmienia miejsca z upływem dni: wynik zależy od zgłoszenia, nie od „dzisiaj”", () => {
    const sameDay = blocked([WED], WED);
    expect(strengthDays(sameDay)).toEqual([SUN]);
    // plan liczony ponownie następnego dnia z tym samym zgłoszeniem jest identyczny (zgłoszenie z środy nie cofa się na wtorek)
    expect(JSON.stringify(blocked([WED], WED).days)).toBe(JSON.stringify(sameDay.days));
    expect(strengthDays(blocked([WED], MON))).toEqual([TUE]); // zgłoszone w poniedziałek mogło trafić na wtorek
  });
  it("przełożona siła respektuje dni z siłownią i brak dwóch ciężkich sesji dzień po dniu", () => {
    const p = blocked([WED], WED, { gymDays: [WED, SUN], limitedGymAccess: true }); // niedziela też jest dniem z siłownią
    expect(strengthDays(p)).toEqual([SUN]);
    const noGym = blocked([WED], WED, { gymDays: [WED], limitedGymAccess: true }); // siłownia tylko w środę, a w środę nie może
    expect(strengthDays(noGym)).toEqual([]);
    expect(noGym.warnings.join(" ")).toMatch(/nie zmieściła się/);
  });
  it("zgłoszenie dnia bez siły nie wpływa na inne rodzaje sesji (bieg, sprint zostają)", () => {
    const a = planWeek(base), b = blocked([WED]);
    const kinds = (p: ReturnType<typeof planWeek>) => p.days.map((d) => (d.session?.kind === "strength" ? null : d.session?.kind ?? null));
    expect(kinds(b).filter((k) => k === "run" || k === "sprint")).toEqual(kinds(a).filter((k) => k === "run" || k === "sprint"));
  });
  it("odwołanie zgłoszenia przywraca pierwotny plan", () => {
    expect(strengthDays(blocked([]))).toEqual(strengthDays(planWeek(base)));
  });
  it("zgłoszenie dnia, w którym i tak nie ma siły, niczego nie zmienia", () => {
    expect(JSON.stringify(blocked([MON], MON).days)).toBe(JSON.stringify(planWeek(base).days));
  });
  it("regeneracja dzień po meczu nie wypiera przełożonej siły", () => {
    const p = blocked([WED]);
    expect(by(p, SUN).session!.kind).toBe("strength");
  });
});

describe("profil → plan: gdzie możesz ćwiczyć i dni na siłownię", () => {
  const profile: Profile = {
    age: 20, weightKg: 75, position: "pomocnik", strengthYears: 3, equipment: ["gym", "field"], limitedGymAccess: true, gymWeekdays: [1, 3],
    clubWeekdays: [], matchWeekdays: [5], offWeekdays: [], season: "inseason", goal: "speed",
  };
  const adj = { noStrengthDays: [] };
  it("ograniczony dostęp do siłowni: siła tylko w wybrane dni", () => {
    const p = planForProfile(profile, MON, adj);
    for (const d of strengthDays(p)) expect([TUE, THU]).toContain(d);
    expect(strengthDays(p).length).toBeGreaterThan(0);
  });
  it("bez siłowni w sprzęcie dni z siłownią są ignorowane (ćwiczenia z własnym ciężarem planujemy jak zwykle)", () => {
    const free = planForProfile({ ...profile, equipment: ["bodyweight", "field"] }, MON, adj);
    const any = planForProfile({ ...profile, equipment: ["bodyweight", "field"], limitedGymAccess: false, gymWeekdays: undefined }, MON, adj);
    expect(strengthDays(free)).toEqual(strengthDays(any));
    expect(strengthDays(free)).toEqual([WED]);
  });
  it("starszy profil (ograniczony dostęp, brak dni) działa jak dotąd", () => {
    expect(strengthDays(planForProfile({ ...profile, gymWeekdays: undefined }, MON, adj))).toEqual([WED]);
  });
  it("domyślnie plan czyta zgłoszone dni „bez siły” z magazynu zawodnika i przekłada siłę", () => {
    const experienced = { ...profile, limitedGymAccess: false, gymWeekdays: undefined };
    expect(strengthDays(planForProfile(experienced, MON, { noStrengthDays: [] }))).toEqual([WED]);
    setBlocked(WED, true, WED);
    expect(loadBlocked()).toEqual([{ date: WED, since: WED }]);
    expect(strengthDays(planForProfile(experienced, MON, { noStrengthDays: loadBlocked() }))).toEqual([SUN]);
    expect(strengthDays(planForProfile(experienced, MON))).toEqual([SUN]); // domyślnie czyta magazyn zawodnika
    setBlocked(WED, false, WED);
    expect(loadBlocked()).toEqual([]);
    expect(strengthDays(planForProfile(experienced, MON))).toEqual([WED]);
  });
  it("zgłoszenia są osobne dla gościa i konta oraz porządkowane po ok. 10 tygodniach", () => {
    setBlocked("2026-11-18", true, "2026-11-18");
    setScope({ kind: "user", id: "u-2" });
    expect(loadBlocked()).toEqual([]);
    setScope({ kind: "guest" });
    expect(loadBlocked()).toEqual([{ date: "2026-11-18", since: "2026-11-18" }]);
    setBlocked("2027-03-01", true, "2027-03-01"); // dużo później: stare wpisy znikają
    expect(loadBlocked()).toEqual([{ date: "2027-03-01", since: "2027-03-01" }]);
  });
  it("uszkodzone lub obce dane w magazynie są ignorowane, a zgłoszenie „z przyszłości” nie cofa się przed dzień zgłoszenia", () => {
    scoped.setItem("strengthBlocked", JSON.stringify([{ date: "2026-11-18", since: "2026-11-17" }, { date: "zły", since: "x" }, "2026-11-19", { date: "2026-11-20", since: "2026-11-25" }, null]));
    expect(loadBlocked()).toEqual([{ date: "2026-11-18", since: "2026-11-17" }]);
    scoped.setItem("strengthBlocked", "{ nie json");
    expect(loadBlocked()).toEqual([]);
    expect(setBlocked("2026-11-20", true, "2026-11-25")).toEqual([{ date: "2026-11-20", since: "2026-11-20" }]); // dzień zgłoszenia nie może być po dniu, którego dotyczy
  });
});

describe("check-in: informacja dla zawodnika o przełożeniu siły", () => {
  const experienced: Profile = {
    age: 22, weightKg: 75, position: "pomocnik", strengthYears: 3, equipment: ["gym"], limitedGymAccess: false,
    clubWeekdays: [], matchWeekdays: [5], offWeekdays: [], season: "inseason", goal: "speed",
  };
  it("przełącznik jest tylko w dniu z siłą; po zgłoszeniu mówi, na który dzień przełożono (dzień po meczu – z wyjaśnieniem)", () => {
    expect(strengthDayInfo(experienced, TUE, []).show).toBe(false);
    expect(strengthDayInfo(experienced, WED, [])).toEqual({ show: true, blocked: false });
    const info = strengthDayInfo(experienced, WED, [{ date: WED, since: WED }]);
    expect(info).toMatchObject({ show: true, blocked: true, movedTo: { date: SUN, afterMatch: true } });
    expect(strengthMoveText(info)).toMatch(/Przełożyliśmy siłę na niedzielę \(dzień po meczu.*od 2 lat\)\./);
    expect(strengthMoveText({ show: true, blocked: false })).toBeNull();
  });
  it("gdy siły nie ma gdzie przełożyć (staż poniżej 2 lat), zawodnik dostaje jawną informację zamiast cichej zmiany", () => {
    const info = strengthDayInfo({ ...experienced, strengthYears: 1 }, WED, [{ date: WED, since: WED }]);
    expect(info.movedTo).toBeUndefined();
    expect(strengthMoveText(info)).toMatch(/Siła z środy nie zmieściła się w tym tygodniu/);
  });
  it("zgłoszenie można cofnąć (przełącznik zostaje widoczny mimo że siły z tego dnia już nie ma w planie)", () => {
    const blockedInfo = strengthDayInfo(experienced, WED, [{ date: WED, since: WED }]);
    expect(blockedInfo.show).toBe(true);
    expect(strengthDayInfo(experienced, WED, []).blocked).toBe(false);
  });
  it("zgłoszenie dnia bez siły nic nie zmienia i mówi o tym", () => {
    expect(strengthMoveText(strengthDayInfo(experienced, TUE, [{ date: TUE, since: TUE }]))).toBe("W tym dniu nie było siły w planie, więc nic się nie zmienia.");
  });
  it("przy dniach z siłownią przełożona siła trafia tylko w dozwolony dzień", () => {
    const limited: Profile = { ...experienced, limitedGymAccess: true, gymWeekdays: [1, 3] }; // wt, czw
    expect(strengthDayInfo(limited, TUE, []).show).toBe(true);
    const info = strengthDayInfo(limited, TUE, [{ date: TUE, since: TUE }]);
    expect(info.movedTo).toBeUndefined(); // czwartek to MD-2 – siły tam nie planujemy, niedziela nie jest dniem z siłownią
    expect(info.lost).toMatch(/Siła z wtorku nie zmieściła się/);
  });
});
