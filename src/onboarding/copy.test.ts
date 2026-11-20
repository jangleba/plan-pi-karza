import { describe, expect, it } from "vitest";
import { BUTTON, DAY_LABEL, EQUIPMENT, GOALS, INTRO, LABEL, POSITIONS, PREVIEW, SEASONS, STEP_HINT, STEP_TITLE, yearsText } from "./copy";
import { FEEL_NOW } from "../engine";
import { understood, initialAnswers } from "./answers";

const ALL = () => JSON.stringify([INTRO, STEP_TITLE, STEP_HINT, GOALS, SEASONS, EQUIPMENT, DAY_LABEL, LABEL, BUTTON, PREVIEW, FEEL_NOW, POSITIONS.map((p) => p[1])]);

describe("onboarding: język", () => {
  it("teksty nie zawierają form zależnych od płci ani wcześniejszych, niezręcznych sformułowań", () => {
    const t = ALL();
    for (const bad of ["Szybszy", "Silniejszy", "Wytrzymalszy", "Za wolny", "pary w końcówce", "Mam mało dni na siłownię", "Masa ciała\"],", "Jak chcesz się czuć", "wolny → klub"]) expect(t, bad).not.toContain(bad);
  });
  it("celów i okresów nadal jest tyle samo i mają te same wartości co w silniku planu (plan się nie zmienił)", () => {
    expect(GOALS.map((g) => g[0])).toEqual(["speed", "strength", "endurance", "return"]);
    expect(SEASONS.map((s) => s[0])).toEqual(["preseason", "inseason", "offseason"]);
    expect(EQUIPMENT.map((e) => e[0])).toEqual(["gym", "field", "track", "bodyweight"]);
    expect(FEEL_NOW.map((f) => f[0])).toEqual(["slow", "duels", "stamina"]);
    expect(POSITIONS.map((p) => p[0])).toEqual(["bramkarz", "obronca", "pomocnik", "skrzydlowy", "napastnik"]);
  });
  it("opisy celów mówią prawdę o wpływie na plan: dodatkowa sesja tylko, gdy jest miejsce; powrót łagodzi pierwsze tygodnie", () => {
    const d = Object.fromEntries(GOALS.map((g) => [g[0], g[2]]));
    for (const k of ["speed", "strength", "endurance"]) expect(d[k]).toMatch(/gdy jest miejsce/);
    expect(d.return).toMatch(/lżejsze/);
  });
  it("odmiana lat: mniej niż rok, 1 rok, 2–4 lata, 5+ lat", () => {
    expect([0, 1, 2, 3, 4, 5, 12].map(yearsText)).toEqual(["mniej niż rok", "1 rok", "2 lata", "3 lata", "4 lata", "5 lat", "12 lat"]);
  });
  it("ekran powitalny i podgląd nie opisują, jak „układamy tydzień”; hasło jest krótkie", () => {
    const t = JSON.stringify([INTRO, PREVIEW]);
    for (const bad of ["ułożymy", "Układam", "układa", "ułożę"]) expect(t, bad).not.toContain(bad);
    expect(INTRO.tagline.length).toBeLessThanOrEqual(32);
  });
  it("pytanie o miejsca treningu rozdziela boisko i bieżnię, a „kilka razy w tygodniu” prowadzi do wyboru dni", () => {
    expect(EQUIPMENT.map((e) => e[1])).toEqual(["Siłownia", "Boisko", "Bieżnia", "Własny ciężar"]);
    expect(LABEL.limited).toMatch(/tylko kilka razy w tygodniu/);
    expect(LABEL.gymDays).toMatch(/dni/);
    expect(LABEL.gymDaysAfterMatch).toMatch(/2 lat/);
  });
  it("informacja o wieku 16+ jest widoczna przy pytaniu o wiek", () => {
    expect(LABEL.ageNote).toMatch(/16 lat/);
  });
  it("ekran układania planu nie wymyśla niczego, gdy odpowiedzi są puste", () => {
    expect(understood(initialAnswers())).toEqual([]);
  });
});
