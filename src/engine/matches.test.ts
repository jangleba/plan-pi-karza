import { describe, expect, it } from "vitest";
import { formTone, matchDue, matchSummary, normalizeMatch, ratingTrend, resultOf, seasonStart, tagInsights } from "./matches";
import type { MatchEntry, MatchTag } from "./matches";

let n = 0;
const m = (date: string, over: Partial<MatchEntry> = {}): MatchEntry => ({
  id: `m${++n}`, date, gf: 1, ga: 0, minutes: 90, position: "pomocnik", rating: 7, goals: 0, assists: 0, well: [], badly: [], ...over,
});

describe("dziennik meczów – wpis", () => {
  it("wynik z bramek", () => {
    expect(resultOf({ gf: 2, ga: 1 })).toBe("W");
    expect(resultOf({ gf: 1, ga: 1 })).toBe("D");
    expect(resultOf({ gf: 0, ga: 3 })).toBe("L");
  });

  it("poprawia zakresy, przycina tagi i nie pozwala na ten sam tag po obu stronach", () => {
    const r = normalizeMatch(m("2026-10-04", {
      rating: 14, minutes: 200, goals: -2, gf: 99, opponent: "  Orzeł  ",
      well: ["passing", "passing", "touch", "duels", "speed"] as MatchTag[],
      badly: ["touch", "stamina", "comm"] as MatchTag[],
    }));
    expect(r.rating).toBe(10);
    expect(r.minutes).toBe(120);
    expect(r.goals).toBe(0);
    expect(r.gf).toBe(30);
    expect(r.opponent).toBe("Orzeł");
    expect(r.well).toEqual(["passing", "touch", "duels"]);
    expect(r.badly).toEqual(["stamina", "comm"]);
  });

  it("pusty przeciwnik znika, ocena nie spada poniżej 1", () => {
    const r = normalizeMatch(m("2026-10-04", { opponent: "  ", rating: 0 }));
    expect(r.opponent).toBeUndefined();
    expect(r.rating).toBe(1);
  });
});

describe("dziennik meczów – sezon", () => {
  it("sezon zaczyna się 1 sierpnia", () => {
    expect(seasonStart("2026-11-19")).toBe("2026-08-01");
    expect(seasonStart("2027-03-02")).toBe("2026-08-01");
    expect(seasonStart("2027-08-01")).toBe("2027-08-01");
    expect(seasonStart("2027-07-31")).toBe("2026-08-01");
  });

  it("podsumowanie liczy tylko bieżący sezon, minuty, gole, asysty i bilans", () => {
    const today = "2026-11-19";
    const list = [
      m("2026-05-01", { goals: 5 }), // poprzedni sezon
      m("2026-09-06", { gf: 2, ga: 0, goals: 1, assists: 1, rating: 8 }),
      m("2026-09-13", { gf: 1, ga: 1, minutes: 45, rating: 6 }),
      m("2026-09-20", { gf: 0, ga: 2, minutes: 0, rating: 5 }), // ławka
      m("2026-09-27", { gf: 3, ga: 2, goals: 2, rating: 9 }),
    ];
    const s = matchSummary(list, today);
    expect(s.count).toBe(4);
    expect(s.played).toBe(3);
    expect(s.minutes).toBe(90 + 45 + 0 + 90);
    expect(s.goals).toBe(3);
    expect(s.assists).toBe(1);
    expect([s.wins, s.draws, s.losses]).toEqual([2, 1, 1]);
    // ławka nie wchodzi do średniej oceny
    expect(s.avgRating).toBe(7.7);
    expect(s.form).toEqual(["W", "D", "L", "W"]);
  });

  it("forma to maks. 5 ostatnich meczów; wpisy z przyszłości są pomijane", () => {
    const list = Array.from({ length: 8 }, (_, i) => m(`2026-09-${String(i + 1).padStart(2, "0")}`, { gf: i % 2, ga: 0 }));
    list.push(m("2026-12-24"));
    const s = matchSummary(list, "2026-11-19");
    expect(s.count).toBe(8);
    expect(s.form).toHaveLength(5);
  });

  it("pusty dziennik: zera i brak średniej", () => {
    const s = matchSummary([], "2026-11-19");
    expect(s.count).toBe(0);
    expect(s.avgRating).toBeNull();
    expect(s.trend).toEqual([]);
  });

  it("trend oceny uśrednia mecze z jednego dnia (turniej) i obcina do 10 dni", () => {
    const list = [m("2026-09-06", { rating: 6 }), m("2026-09-06", { rating: 8 }), ...Array.from({ length: 12 }, (_, i) => m(`2026-10-${String(i + 1).padStart(2, "0")}`))];
    const t = ratingTrend(list);
    expect(t).toHaveLength(10);
    const day = ratingTrend([m("2026-09-06", { rating: 6 }), m("2026-09-06", { rating: 8 })]);
    expect(day).toEqual([{ date: "2026-09-06", value: 7 }]);
  });

  it("ton formy: wzrost zielony, spadek pomarańczowy/czerwony, mała próba neutralna", () => {
    const v = (...xs: number[]) => xs.map((value) => ({ value }));
    expect(formTone(v(6, 6, 6))).toBe("neutral");
    expect(formTone(v(6, 6, 6, 7, 7, 7))).toBe("green");
    expect(formTone(v(7, 7, 7, 6.5, 6.5, 6.5))).toBe("orange");
    expect(formTone(v(8, 8, 8, 6, 6, 6))).toBe("red");
    expect(formTone(v(7, 7, 7, 7, 7, 7))).toBe("neutral");
  });
});

describe("dziennik meczów – wnioski z tagów", () => {
  const today = "2026-11-19";

  it("powtarzający się słaby tag w ≥ 2 z 5 ostatnich meczów daje wniosek, dobry też", () => {
    const list = [
      m("2026-10-03", { badly: ["stamina"], well: ["passing"] }),
      m("2026-10-10", { badly: ["stamina", "duels"], well: ["passing", "touch"] }),
      m("2026-10-17", { badly: ["comm"], well: ["touch"] }),
      m("2026-10-24", { badly: ["stamina"], well: ["passing"] }),
      m("2026-10-31", {}),
    ];
    const r = tagInsights(list, today);
    expect(r).toEqual([
      { kind: "badly", tag: "stamina", n: 3, of: 5 },
      { kind: "well", tag: "passing", n: 3, of: 5 },
    ]);
  });

  it("mniej niż 3 mecze albo pojedyncze wystąpienia – brak wniosku", () => {
    expect(tagInsights([m("2026-10-03", { badly: ["stamina"] }), m("2026-10-10", { badly: ["stamina"] })], today)).toEqual([]);
    const spread = [
      m("2026-10-03", { badly: ["stamina"] }), m("2026-10-10", { badly: ["duels"] }), m("2026-10-17", { badly: ["comm"] }),
    ];
    expect(tagInsights(spread, today)).toEqual([]);
  });

  it("liczy tylko okno ostatnich 5 meczów", () => {
    const old = Array.from({ length: 4 }, (_, i) => m(`2026-09-0${i + 1}`, { badly: ["speed"] }));
    const recent = Array.from({ length: 5 }, (_, i) => m(`2026-10-0${i + 1}`));
    expect(tagInsights([...old, ...recent], today)).toEqual([]);
  });
});

describe("dziennik meczów – przypomnienie", () => {
  // 2026-11-19 to czwartek; 2026-11-15 niedziela (dow 6), 2026-11-17 wtorek (dow 1)
  it("przypomina o niezapisanym meczu z wczoraj lub przedwczoraj, nie o dzisiejszym", () => {
    expect(matchDue([2], [], "2026-11-19")).toBe("2026-11-18"); // środa wczoraj
    expect(matchDue([1], [], "2026-11-19")).toBe("2026-11-17"); // wtorek, przedwczoraj
    expect(matchDue([3], [], "2026-11-19")).toBeNull(); // czwartek = dziś
  });

  it("nie przypomina, gdy wpis już jest albo brak dnia meczowego", () => {
    expect(matchDue([2], [m("2026-11-18")], "2026-11-19")).toBeNull();
    expect(matchDue([], [], "2026-11-19")).toBeNull();
  });

  it("wybiera wczorajszy mecz przed przedwczorajszym", () => {
    expect(matchDue([1, 2], [], "2026-11-19")).toBe("2026-11-18");
    expect(matchDue([1, 2], [m("2026-11-18")], "2026-11-19")).toBe("2026-11-17");
  });
});
