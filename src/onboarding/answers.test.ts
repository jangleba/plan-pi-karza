import { describe, expect, it } from "vitest";
import { Answers, buildProfile, dayIndexes, goalsFor, initialAnswers, nextDayState, previewWeek, restoreDraft, sessionCount, understood, validateStep, type DayState } from "./answers";
import { levelOf, planForProfile, validateProfile, weekStartOf } from "../engine";
import { finalizeNewProfile } from "../lib/profileGuard";

const TODAY = "2026-11-19"; // czwartek
const answers = (over: Partial<Answers> = {}, days: Record<number, DayState> = {}): Answers => {
  const a: Answers = { ...initialAnswers(), name: "Kuba", position: "pomocnik", goals: ["speed"], season: "inseason", league: "IV liga", equipment: ["gym"], ...over };
  const d = [...a.days]; for (const [i, s] of Object.entries(days)) d[Number(i)] = s;
  return { ...a, days: d };
};
const plan = (a: Answers) => previewWeek(a, TODAY);
const kinds = (a: Answers) => plan(a).days.map((d) => d.session);

describe("onboarding: odpowiedzi → profil", () => {
  it("kompletne odpowiedzi dają profil, który przechodzi tę samą walidację i bramkę wieku co reszta aplikacji", () => {
    const p = buildProfile(answers({ age: 17, weight: 68, years: 2 }, { 0: "club", 2: "club", 5: "match", 6: "off" }))!;
    expect(p).toMatchObject({ name: "Kuba", age: 17, weightKg: 68, position: "pomocnik", season: "inseason", goal: "speed", league: "IV liga", strengthYears: 2, equipment: ["gym", "bodyweight"], limitedGymAccess: false, clubWeekdays: [0, 2], matchWeekdays: [5], offWeekdays: [6] });
    expect(validateProfile({ ...p, ageAsOf: TODAY })).toEqual([]);
    const done = finalizeNewProfile(p, TODAY);
    expect(done.kind).toBe("ok");
  });
  it("brak wymaganej odpowiedzi → brak profilu (nie powstaje „puste” ani domyślne konto)", () => {
    expect(buildProfile({ ...answers(), name: "  " })).toBeNull();
    expect(buildProfile({ ...answers(), position: undefined })).toBeNull();
    expect(buildProfile({ ...answers(), league: undefined })).toBeNull();
    expect(buildProfile({ ...answers(), equipment: [] })).toMatchObject({ equipment: ["bodyweight"] });
  });
  it("w przerwie między sezonami mecze nie trafiają do profilu, nawet jeśli zostały zaznaczone wcześniej", () => {
    expect(buildProfile(answers({ season: "offseason" }, { 5: "match" }))!.matchWeekdays).toEqual([5]); // mecz (np. towarzyski) można zaznaczyć także w przerwie
  });
  it("cel podpowiadany z odpowiedzi „co Ci przeszkadza”, gdy nie wybrano celu; wybrany cel ma pierwszeństwo", () => {
    expect(goalsFor(answers({ goals: [], feelNow: ["duels", "slow"] }))).toEqual(["strength", "speed"]);
    expect(goalsFor(answers({ goals: ["endurance"], feelNow: ["duels"] }))).toEqual(["endurance"]);
    expect(buildProfile(answers({ goals: [], feelNow: ["stamina"] }))!.goal).toBe("endurance");
  });
});

describe("onboarding: walidacja kroków (polskie komunikaty)", () => {
  it("każdy krok blokuje brak odpowiedzi właściwym komunikatem", () => {
    expect(validateStep(1, answers({ name: "" }))).toBe("Podaj imię.");
    expect(validateStep(2, answers({ position: undefined }))).toBe("Wybierz pozycję.");
    expect(validateStep(3, answers({ goals: [] }))).toBe("Wybierz przynajmniej jeden cel.");
    expect(validateStep(4, answers({ season: undefined }))).toBe("Wybierz, w którym momencie sezonu jesteś.");
    expect(validateStep(4, answers({ league: undefined }))).toBe("Wybierz poziom rozgrywek.");
    expect(validateStep(5, answers({ equipment: [] }))).toBeNull();
    expect(validateStep(6, answers())).toBe("Zaznacz dzień meczu."); // w sezonie wymagany dzień meczu
    expect(validateStep(6, answers({}, { 4: "match" }))).toBeNull();
    expect(validateStep(6, answers({}, { 1: "match", 3: "match", 5: "match" }))).toBe("Maksymalnie dwa mecze w tygodniu.");
    expect(validateStep(6, answers({}, { 5: "match", 0: "off", 1: "off", 2: "off", 3: "off", 4: "off" }))).toBe("Zostaw co najmniej 3 dni na trening.");
    expect(validateStep(6, answers({ season: "offseason" }))).toBeNull(); // w przerwie meczu nie trzeba
  });
  it("dotknięcie dnia przechodzi wolny → klub → mecz → zajęty; w przerwie pomija mecz", () => {
    expect((["free", "club", "match", "off", "free"] as DayState[]).slice(0, 4).map((s, i, all) => nextDayState(s, "inseason") === all[(i + 1) % 4]!)).toEqual([true, true, true, true]);
    expect(nextDayState("free", "offseason")).toBe("club");
    expect(nextDayState("club", "offseason")).toBe("match"); // mecz jest dostępny także w przerwie
    expect(nextDayState("match", "offseason")).toBe("off");
  });
});

describe("onboarding: PLAN NADAL WYNIKA Z ODPOWIEDZI", () => {
  it("podgląd jest dokładnie tym samym planem, który aplikacja liczy z profilu", () => {
    const a = answers({ goals: ["strength", "speed"] }, { 0: "club", 2: "club", 5: "match" });
    const real = planForProfile(buildProfile(a)!, weekStartOf(TODAY));
    expect(plan(a).days.map((d) => d.session)).toEqual(real.days.map((d) => d.session?.kind ?? null));
    expect(plan(a).warnings).toEqual(real.warnings);
  });
  it("dzień meczu zmienia układ: sobotni mecz → piątek bez ciężkiej pracy, niedziela regeneracja; mecz w środę → inny tydzień", () => {
    const sat = plan(answers({}, { 5: "match" })).days;
    expect(sat[5]!.title).toBe("Mecz");
    expect(sat[6]!.session).toBe("recovery"); // dzień po meczu
    const wed = plan(answers({}, { 2: "match" })).days;
    expect(wed[2]!.title).toBe("Mecz");
    expect(wed.map((d) => d.session)).not.toEqual(sat.map((d) => d.session));
  });
  it("cel dodaje sesję: szybkość → sprint, siła → trening siłowy, wytrzymałość → bieg; powrót po przerwie nie dodaje sesji", () => {
    const base = (goal: Answers["goals"]) => kinds(answers({ goals: goal, season: "preseason" }));
    const count = (k: string, g: Answers["goals"]) => base(g).filter((s) => s === k).length;
    expect(count("sprint", ["speed"])).toBeGreaterThan(count("sprint", ["return"]));
    expect(count("strength", ["strength"])).toBeGreaterThan(count("strength", ["return"]));
    expect(count("run", ["endurance"])).toBeGreaterThan(count("run", ["return"]));
    expect(base(["speed"])).not.toEqual(base(["endurance"]));
  });
  it("trening klubowy zajmuje dni: w dniu klubowym jest klub (z maks. jedną sesją indywidualną), a bez klubu te dni są dla sesji indywidualnych", () => {
    const club = plan(answers({}, { 1: "club", 3: "club", 5: "match" })).days;
    expect(club[1]!.title).toBe("Klub");
    expect(club[3]!.title).toBe("Klub");
    for (const d of club) expect(d.session === null || typeof d.session === "string").toBe(true);
    const noClub = plan(answers({}, { 5: "match" })).days;
    expect(noClub[1]!.title).not.toBe("Klub");
  });
  it("dni zajęte (nie mogę) nigdy nie dostają treningu", () => {
    const a = answers({}, { 5: "match", 0: "off", 1: "off", 3: "off" });
    const days = plan(a).days;
    for (const i of [0, 1, 3]) { expect(days[i]!.title).toBe("Zajęty"); expect(days[i]!.session).toBeNull(); }
    expect(dayIndexes(a, "off")).toEqual([0, 1, 3]);
  });
  it("wiek, staż siłowy i „mało dni na siłownię” trafiają do profilu, z którego plan wylicza poziom i warianty sesji", () => {
    const young = buildProfile(answers({ limited: false, years: 0, age: 16 }))!;
    const vet = buildProfile(answers({ limited: true, years: 8, age: 24 }))!;
    expect([young.limitedGymAccess, vet.limitedGymAccess]).toEqual([false, true]);
    expect(levelOf(young.age, young.strengthYears)).not.toBe(levelOf(vet.age, vet.strengthYears));
  });
  it("przerwa między sezonami: zaznaczony sparing jest w planie, a sesje biegowe lżejsze", () => {
    const days = plan(answers({ season: "offseason" }, { 5: "match" })).days;
    expect(days.some((d) => d.title === "Sparing")).toBe(true);
    const prof = buildProfile(answers({ season: "offseason", goals: ["endurance"] }))!;
    const real = planForProfile(prof, weekStartOf(TODAY)).days.map((d) => d.session).filter((s) => s && (s.kind === "run" || s.kind === "sprint"));
    expect(real.length).toBeGreaterThan(0);
    expect(real.every((s) => s!.variant === "light")).toBe(true);
  });
  it("zmiana którejkolwiek odpowiedzi o układzie tygodnia zmienia podgląd (nic nie jest „na sztywno”)", () => {
    const base = answers({}, { 0: "club", 5: "match" });
    const variants = [answers({}, { 0: "club", 4: "match" }), answers({}, { 0: "club", 2: "club", 5: "match" }), answers({ goals: ["endurance"] }, { 0: "club", 5: "match" }), answers({}, { 0: "club", 5: "match", 3: "off" })];
    for (const v of variants) expect(JSON.stringify(plan(v).days)).not.toBe(JSON.stringify(plan(base).days));
    expect(sessionCount(plan(base).days)).toBeGreaterThan(2);
    expect(sessionCount(plan(base).days)).toBe(plan(base).days.filter((d) => d.session && d.session !== "recovery" && d.title !== "Mecz").length);
  });
});

describe("onboarding: gdzie możesz ćwiczyć trafia do profilu (bez osobnych dni na siłownię)", () => {
  const strengthIdx = (a: Answers) => plan(a).days.map((d, i) => (d.session === "strength" ? i : -1)).filter((i) => i >= 0);
  it("miejsca treningu (siłownia, boisko, bieżnia, własny ciężar) zapisują się w profilu, a profil nie ma pola z dniami siłowni", () => {
    const p = buildProfile(answers({ equipment: ["gym", "field", "track", "bodyweight"], years: 3 }, { 5: "match" }))!;
    expect(p.equipment).toEqual(["gym", "field", "track", "bodyweight"]);
    expect(p).not.toHaveProperty("gymWeekdays");
    expect(validateStep(5, answers({ equipment: [] }))).toBeNull();
    expect(validateStep(5, answers({ equipment: ["track"] }))).toBeNull();
  });
  it("„kilka razy w tygodniu” bez siłowni w sprzęcie jest ignorowane (nie zapisujemy ograniczenia, którego nie ma); z siłownią nie wymaga niczego więcej", () => {
    expect(buildProfile(answers({ equipment: ["field", "track"], limited: true }, { 5: "match" }))).toMatchObject({ limitedGymAccess: false });
    expect(buildProfile(answers({ equipment: ["gym", "field"], limited: true }, { 5: "match" }))).toMatchObject({ limitedGymAccess: true });
    expect(validateStep(5, answers({ equipment: ["gym"], limited: true }))).toBeNull();
  });
  it("dzień po meczu dla siły: jedyny wolny dzień po meczu działa dopiero od 2 lat stażu (podgląd = silnik)", () => {
    const only = (years: number) => answers({ years, equipment: ["gym"], limited: true }, { 2: "match", 0: "off", 1: "off", 4: "off", 5: "off", 6: "off" }); // wolny tylko czwartek = dzień po meczu
    expect(strengthIdx(only(1))).toEqual([]);
    expect(strengthIdx(only(2))).toEqual([3]);
  });
  it("podgląd ignoruje zgłoszenia „nie mogę” zapisane na urządzeniu (zależy tylko od odpowiedzi)", () => {
    const a = answers({ years: 3 }, { 5: "match" });
    const before = JSON.stringify(plan(a).days);
    const store = new Map<string, string>([["bw:guest:skippedDays", JSON.stringify([{ date: "2026-11-18", since: "2026-11-18" }])]]);
    (globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined, key: () => null, length: 1 } as Storage;
    try { expect(JSON.stringify(plan(a).days)).toBe(before); } finally { delete (globalThis as unknown as { localStorage?: Storage }).localStorage; }
  });
  it("opis „co zrozumieliśmy” wymienia miejsca treningu", () => {
    expect(understood(answers({ equipment: ["gym", "track", "bodyweight"], limited: true }, { 5: "match" }))).toContain("Ćwiczysz: na siłowni, na bieżni, z własnym ciężarem");
  });
});

describe("onboarding: opis „co zrozumieliśmy”", () => {
  it("każde zdanie wynika z konkretnej odpowiedzi, po polsku", () => {
    const u = understood(answers({ goals: ["speed", "strength"], equipment: ["gym", "field"] }, { 0: "club", 2: "club", 5: "match", 6: "off" }));
    expect(u).toEqual([
      "Mecz w sobotę", "Trening w klubie: poniedziałek, środa", "Cel: szybkość i siła", "Dni, w które nie możesz: 1", "Ćwiczysz: na siłowni, na boisku",
    ]);
    expect(understood(answers({ season: "offseason" }))[0]).toBe("Przerwa między sezonami: lżej");
    expect(understood(answers({}, { 1: "match", 4: "match" }))[0]).toBe("Mecz we wtorek i w piątek");
  });
});

describe("zapamiętany onboarding (po przeładowaniu karty)", () => {
  it("przywraca krok i odpowiedzi, a odpowiedzi z pamięci przechodzą walidację", () => {
    const a = answers({ equipment: ["gym"] }, { 1: "club" });
    const d = restoreDraft(JSON.parse(JSON.stringify({ step: 4, a })));
    expect(d?.step).toBe(4);
    expect(d?.a).toMatchObject({ name: "Kuba", position: "pomocnik", goals: ["speed"], season: "inseason", league: "IV liga", equipment: ["gym"] });
    expect(d?.a.days[1]).toBe("club");
  });
  it("uszkodzone lub obce dane nie przywracają niczego i nie wywracają aplikacji", () => {
    for (const bad of [null, undefined, 5, "x", [], {}, { step: 0, a: {} }, { step: 99, a: {} }, { step: 2.5, a: {} }, { step: 2 }, { step: 2, a: null }]) expect(restoreDraft(bad), JSON.stringify(bad)).toBeNull();
  });
  it("pojedyncze złe pola wracają do wartości początkowych, reszta zostaje", () => {
    const d = restoreDraft({ step: 3, a: { name: "Ola", age: 7, weight: "x", position: "trener", goals: ["speed", "speed", "xx", "strength", "endurance"], league: "Liga Mistrzów", days: ["free"], equipment: ["gym", "ufo"] } })!;
    expect(d.a).toMatchObject({ name: "Ola", age: 18, weight: 75, goals: ["speed", "strength"], equipment: ["gym"] });
    expect(d.a.position).toBeUndefined();
    expect(d.a.league).toBeUndefined();
    expect(d.a.days).toEqual(initialAnswers().days);
  });
});

describe("odpowiedź „Inne” w pytaniu o to, co przeszkadza", () => {
  it("jest poprawną odpowiedzią, nie zmienia podpowiedzi celu i przechodzi zapis szkicu", () => {
    expect(buildProfile(answers({ goals: [], feelNow: ["other", "stamina"] }))!.goal).toBe("endurance");
    expect(restoreDraft({ step: 2, a: { feelNow: ["other", "xx"] } })?.a.feelNow).toEqual(["other"]);
  });
});

describe("wzrost w onboardingu (opcjonalny, tylko na urządzeniu)", () => {
  it("nie trafia do profilu, który może być synchronizowany", () => {
    const p = buildProfile(answers({ height: 182 }, { 5: "match" }))!;
    expect(p).not.toHaveProperty("heightCm");
    expect(JSON.stringify(p)).not.toContain("182");
  });
  it("szkic: wzrost wraca, null (nie podano) zostaje, śmieci wracają do domyślnego", () => {
    expect(restoreDraft({ step: 1, a: { name: "Ola", height: 181 } })!.a.height).toBe(181);
    expect(restoreDraft({ step: 1, a: { name: "Ola", height: null } })!.a.height).toBeNull();
    expect(restoreDraft({ step: 1, a: { name: "Ola", height: "x" } })!.a.height).toBe(175);
    expect(restoreDraft({ step: 1, a: { name: "Ola", height: 20 } })!.a.height).toBe(175);
  });
});
