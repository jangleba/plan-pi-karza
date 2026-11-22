import { beforeEach, describe, expect, it } from "vitest";
import { MD1_STRENGTH_MIN_YEARS, daySkipInfo, daySkipText, planForProfile, planWeek, skipLabel, type DaySkip, type Profile, type SessionKind, type WeekInput } from "./index";
import { loadSkipped, setSkipped } from "../lib/skipped";
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
type Plan = ReturnType<typeof planWeek>;
const by = (p: Plan, d: string) => p.days.find((x) => x.date === d)!;
const daysOf = (p: Plan, kind: SessionKind) => p.days.filter((d) => d.session?.kind === kind).map((d) => d.date);
const strengthDays = (p: Plan) => daysOf(p, "strength");
const skip = (dates: string[], since = WED): DaySkip[] => dates.map((date) => ({ date, since }));

describe("dzień po meczu dla siły: ostatnia opcja i dopiero od 2 lat stażu", () => {
  const onlyMd1 = { ...base, matches: [WED], offDays: [MON, TUE, FRI, SAT, SUN] }; // wolny jest tylko czwartek = MD+1 (środa to mecz)
  it("staż 1 rok: siły dzień po meczu NIE planujemy (mecz ma pierwszeństwo, bez ostrzeżenia)", () => {
    const p = planWeek({ ...onlyMd1, strengthYears: 1 });
    expect(strengthDays(p)).toEqual([]);
    expect(p.warnings.join(" ")).not.toMatch(/siła/);
  });
  it(`od ${MD1_STRENGTH_MIN_YEARS} lat stażu siła ląduje dzień po meczu (jako ostatnia opcja)`, () => {
    expect(strengthDays(planWeek({ ...onlyMd1, strengthYears: MD1_STRENGTH_MIN_YEARS }))).toEqual([THU]);
  });
  it("gdy jest lepszy dzień (MD-3), dzień po meczu nie jest wybierany nawet przy dużym stażu", () => {
    expect(strengthDays(planWeek({ ...base, strengthYears: 10 }))).toEqual([WED]);
  });
});

describe("„nie mogę zrobić dzisiejszych treningów”: trening indywidualny jest przekładany", () => {
  const plan = (days: string[], since = WED, over: Partial<WeekInput> = {}) => planWeek({ ...base, skippedDays: skip(days, since), ...over });
  it("siła ze środy trafia dzień po meczu (niedziela) przy stażu 2+ lat, z oznaczeniem skąd została przełożona", () => {
    const p = plan([WED]);
    expect(strengthDays(p)).toEqual([SUN]);
    expect(by(p, WED).session).toBeNull();
    expect(by(p, SUN).session).toMatchObject({ kind: "strength", movedFrom: WED });
    expect(by(p, SUN).session!.reason).toMatch(/Przełożona z środy/);
    expect(by(p, SUN).phase).toBe("MD+1");
    expect(p.moves).toEqual([{ from: WED, kind: "strength", to: SUN }]);
  });
  it("przy stażu poniżej 2 lat siły nie ma gdzie przełożyć: znika z tygodnia, a silnik mówi dlaczego (bez cichego ‘upchnięcia’ dzień po meczu)", () => {
    const p = plan([WED], WED, { strengthYears: 1 });
    expect(strengthDays(p)).toEqual([]);
    expect(p.moves).toEqual([{ from: WED, kind: "strength", to: null, needsYears: MD1_STRENGTH_MIN_YEARS }]);
  });
  it("zgłoszenie z wyprzedzeniem może przełożyć trening na wcześniejszy dzień (wtorek), a nie dzień po meczu", () => {
    const p = plan([WED], TUE);
    expect(strengthDays(p)).toEqual([TUE]);
    expect(by(p, TUE).session!.movedFrom).toBe(WED);
  });
  it("przełożona sesja nie zmienia miejsca z upływem dni: wynik zależy od zgłoszenia, nie od „dzisiaj”", () => {
    expect(strengthDays(plan([WED], WED))).toEqual([SUN]);
    expect(JSON.stringify(plan([WED], WED).days)).toBe(JSON.stringify(plan([WED], WED).days));
    expect(strengthDays(plan([WED], MON))).toEqual([TUE]); // zgłoszone w poniedziałek mogło trafić na wtorek
  });
  it("przełożenie nie łamie reguł: brak dwóch takich samych ciężkich sesji dzień po dniu", () => {
    for (const d of [MON, TUE, WED, THU]) {
      const p = plan([d], MON);
      for (const kind of ["strength", "run", "sprint"] as const) {
        const ds = daysOf(p, kind);
        for (let i = 1; i < ds.length; i++) expect(Date.parse(ds[i]!) - Date.parse(ds[i - 1]!), `${d} ${kind}`).toBeGreaterThan(86_400_000);
      }
    }
  });
  it("przełożyć można nie tylko siłę: bieg ze środy (MD-3 wolne) i sprint trafiają na dozwolone dni, a w dniu meczu i po zgłoszonych dniach nic nie ląduje", () => {
    const week = planWeek({ ...base, season: "preseason", matches: [], goal: "endurance" });
    const target = week.days.find((d) => d.session?.kind === "run")!.date;
    const p = planWeek({ ...base, season: "preseason", matches: [], goal: "endurance", skippedDays: skip([target], MON) });
    expect(by(p, target).session).toBeNull();
    expect(p.moves[0]).toMatchObject({ from: target, kind: "run" });
    expect(p.moves[0]!.to === null || p.days.find((d) => d.date === p.moves[0]!.to)!.session!.kind === "run").toBe(true);
    for (const d of p.days) if (d.date === target) expect(d.session).toBeNull();
  });
  it("technika przed meczem jest przekładana na dozwolony dzień; regeneracja po meczu nie jest przekładana i nie wraca w zgłoszonym dniu", () => {
    const fri = plan([FRI], FRI, { strengthYears: 3 }); // piątek = MD-1: technika
    expect(by(fri, FRI).session).toBeNull();
    expect(fri.moves[0]).toMatchObject({ from: FRI, kind: "technique" });
    const sun = plan([SUN], SUN, { strengthYears: 1 }); // niedziela = MD+1: regeneracja (siła niedozwolona przy stażu 1)
    expect(by(sun, SUN).session).toBeNull(); // regeneracja nie jest uzupełniana po zgłoszeniu
    expect(sun.moves).toEqual([]); // silnik nie zna jej jako sesji do przełożenia
  });
  it("dzień z treningiem klubowym: klub zostaje, przekładana jest tylko sesja indywidualna", () => {
    const p = planWeek({ ...base, clubDays: [WED], skippedDays: skip([WED]) });
    expect(by(p, WED).isClub).toBe(true);
    expect(by(p, WED).session).toBeNull();
    expect(p.moves.length).toBe(1);
  });
  it("zgłoszenie dnia, w którym nie ma treningu indywidualnego, niczego nie zmienia", () => {
    const quiet = plan([TUE], TUE); // wtorek nie ma sesji indywidualnej
    expect(JSON.stringify(quiet.days)).toBe(JSON.stringify(planWeek(base).days));
    expect(quiet.moves).toEqual([]);
  });
  it("odwołanie zgłoszenia przywraca pierwotny plan", () => {
    expect(JSON.stringify(plan([]).days)).toBe(JSON.stringify(planWeek(base).days));
  });
  it("regeneracja dzień po meczu nie wypiera przełożonej siły", () => {
    expect(by(plan([WED]), SUN).session!.kind).toBe("strength");
  });
  it("dwa zgłoszone dni: obie sesje są przekładane, żadna nie ląduje w zgłoszonym dniu", () => {
    const p = planWeek({ ...base, season: "preseason", matches: [], goal: "strength", skippedDays: skip([MON, TUE], MON) });
    expect(by(p, MON).session).toBeNull();
    expect(by(p, TUE).session).toBeNull();
  });
});

describe("profil → plan: zgłoszenia czytane z magazynu zawodnika", () => {
  const profile: Profile = {
    age: 22, weightKg: 75, position: "pomocnik", strengthYears: 3, equipment: ["gym", "track"], limitedGymAccess: false,
    clubWeekdays: [], matchWeekdays: [5], offWeekdays: [], season: "inseason", goal: "speed",
  };
  it("domyślnie plan czyta zgłoszone dni z magazynu i przekłada trening; cofnięcie przywraca plan", () => {
    expect(strengthDays(planForProfile(profile, MON, { skippedDays: [] }))).toEqual([WED]);
    setSkipped(WED, true, WED);
    expect(loadSkipped()).toEqual([{ date: WED, since: WED }]);
    expect(strengthDays(planForProfile(profile, MON))).toEqual([SUN]);
    setSkipped(WED, false, WED);
    expect(loadSkipped()).toEqual([]);
    expect(strengthDays(planForProfile(profile, MON))).toEqual([WED]);
  });
  it("zgłoszenia są osobne dla gościa i konta oraz porządkowane po ok. 10 tygodniach", () => {
    setSkipped("2026-11-18", true, "2026-11-18");
    setScope({ kind: "user", id: "u-2" });
    expect(loadSkipped()).toEqual([]);
    setScope({ kind: "guest" });
    expect(loadSkipped()).toEqual([{ date: "2026-11-18", since: "2026-11-18" }]);
    setSkipped("2027-03-01", true, "2027-03-01");
    expect(loadSkipped()).toEqual([{ date: "2027-03-01", since: "2027-03-01" }]);
  });
  it("uszkodzone lub obce dane w magazynie są ignorowane, a dzień zgłoszenia nie wypada po dniu, którego dotyczy", () => {
    scoped.setItem("skippedDays", JSON.stringify([{ date: "2026-11-18", since: "2026-11-17" }, { date: "zły", since: "x" }, "2026-11-19", { date: "2026-11-20", since: "2026-11-25" }, null]));
    expect(loadSkipped()).toEqual([{ date: "2026-11-18", since: "2026-11-17" }]);
    scoped.setItem("skippedDays", "{ nie json");
    expect(loadSkipped()).toEqual([]);
    expect(setSkipped("2026-11-20", true, "2026-11-25")).toEqual([{ date: "2026-11-20", since: "2026-11-20" }]);
  });
});

describe("check-in: tekst przycisku i informacja o przełożeniu", () => {
  const exp: Profile = {
    age: 22, weightKg: 75, position: "pomocnik", strengthYears: 3, equipment: ["gym"], limitedGymAccess: false,
    clubWeekdays: [], matchWeekdays: [5], offWeekdays: [], season: "inseason", goal: "speed",
  };
  it("jeden trening w dniu → „dzisiejszego treningu”, dwa (klub + indywidualny) → „dzisiejszych treningów”", () => {
    expect(skipLabel(1)).toBe("Nie mogę zrobić dzisiejszego treningu");
    expect(skipLabel(2)).toBe("Nie mogę zrobić dzisiejszych treningów");
    expect(daySkipInfo(exp, WED, [])).toMatchObject({ show: true, count: 1, club: false, skipped: false });
    const twoSessions = { ...exp, clubWeekdays: [2] }; // środa: klub + siła
    expect(daySkipInfo(twoSessions, WED, [])).toMatchObject({ show: true, count: 2, club: true });
    const clubOnly = { ...exp, clubWeekdays: [0] }; // poniedziałek: tylko klub
    expect(daySkipInfo(clubOnly, MON, [])).toMatchObject({ show: true, count: 1, club: true });
  });
  it("dzień bez treningu, dzień meczu i dzień zajęty nie pokazują przełącznika", () => {
    expect(daySkipInfo(exp, MON, []).show).toBe(false); // poniedziałek: wolny
    expect(daySkipInfo(exp, SAT, []).show).toBe(false);
    expect(daySkipInfo({ ...exp, offWeekdays: [2] }, WED, []).show).toBe(false);
  });
  it("po zgłoszeniu mówi, na który dzień przełożono (dzień po meczu – z wyjaśnieniem); zgłoszenie zostaje widoczne do cofnięcia", () => {
    const info = daySkipInfo(exp, WED, [{ date: WED, since: WED }]);
    expect(info).toMatchObject({ show: true, skipped: true, move: { to: SUN, afterMatch: true } });
    expect(daySkipText(info)).toMatch(/Przełożyliśmy siłę na niedzielę \(dzień po meczu.*od 2 lat\)\./);
    expect(daySkipText(daySkipInfo(exp, WED, []))).toBeNull();
  });
  it("gdy nie ma gdzie przełożyć (staż poniżej 2 lat), zawodnik dostaje jawną informację zamiast cichej zmiany", () => {
    const info = daySkipInfo({ ...exp, strengthYears: 1 }, WED, [{ date: WED, since: WED }]);
    expect(info.move?.to).toBeNull();
    expect(daySkipText(info)).toMatch(/Siła z tego dnia nie zmieściła się w tym tygodniu\. Dzień po meczu dopuszczamy dla siły dopiero przy stażu siłowym od 2 lat\./);
  });
  it("dzień z klubem: tekst przypomina, że treningu klubowego nie przekładamy", () => {
    const info = daySkipInfo({ ...exp, clubWeekdays: [2] }, WED, [{ date: WED, since: WED }]);
    expect(daySkipText(info)).toMatch(/Przełożyliśmy siłę na niedzielę.*Treningu klubowego nie przekładamy/);
    const clubOnly = daySkipInfo({ ...exp, clubWeekdays: [0] }, MON, [{ date: MON, since: MON }]);
    expect(daySkipText(clubOnly)).toBe("Treningu klubowego nie przekładamy: prowadzi go trener klubu.");
  });
  it("nieistniejące zgłoszenie dla dnia bez sesji: komunikat, że nic się nie zmienia", () => {
    expect(daySkipText(daySkipInfo(exp, MON, [{ date: MON, since: MON }]))).toBe("Zapisane. W tym dniu nic nie trzeba było przekładać.");
    // regeneracja po meczu: pokazujemy przełącznik, a po zgłoszeniu wyjaśniamy, że jej nie przekładamy
    const rec = daySkipInfo({ ...exp, strengthYears: 1 }, SUN, [{ date: SUN, since: SUN }]);
    expect(rec).toMatchObject({ show: true, skipped: true, move: { kind: "recovery", dropped: true } });
    expect(daySkipText(rec)).toBe("Regeneracja jest związana z dniem meczu, więc jej nie przekładamy.");
  });
});
