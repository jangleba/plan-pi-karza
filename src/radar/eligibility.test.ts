import { describe, expect, it } from "vitest";
import { ageRangeOn, checkEligibility, evaluateListing, qualifySession, sortEvaluations } from "../../supabase/functions/_shared/radar/index.ts";
import type { AgeLimit, Eligibility } from "../../supabase/functions/_shared/radar/index.ts";
import { NOW, listing, player, session, years } from "./fixtures.ts";

const q = (elig: Eligibility | null, facts = player(), date = "2026-11-25") => checkEligibility(elig, facts, date);

describe("roczniki", () => {
  it("lista „2010 i 2012” nie obejmuje rocznika 2011", () => {
    const e = years(2010, 2012);
    expect(q(e, player({ birthDate: "2011-05-10" })).outcome).toBe("fail");
    expect(q(e, player({ birthDate: "2010-01-01" })).outcome).toBe("pass");
    expect(q(e, player({ birthDate: "2012-12-31" })).outcome).toBe("pass");
  });
  it("zakres 2012–2013 jest włączny i nie obejmuje 2011 ani 2014", () => {
    const e: Eligibility = { birthYears: [{ op: "range", from: 2012, to: 2013 }] };
    for (const [y, o] of [[2011, "fail"], [2012, "pass"], [2013, "pass"], [2014, "fail"]] as const) expect(q(e, player({ birthDate: `${y}-06-01` })).outcome).toBe(o);
  });
  it("„2010 i młodsi” = rok urodzenia >= 2010, „2010 i starsi” = <= 2010", () => {
    const younger: Eligibility = { birthYears: [{ op: "gte", year: 2010 }] }, older: Eligibility = { birthYears: [{ op: "lte", year: 2010 }] };
    expect(q(younger, player({ birthYear: 2010, birthDate: null })).outcome).toBe("pass");
    expect(q(younger, player({ birthYear: 2009, birthDate: null })).outcome).toBe("fail");
    expect(q(younger, player({ birthYear: 2015, birthDate: null })).outcome).toBe("pass");
    expect(q(older, player({ birthYear: 2010, birthDate: null })).outcome).toBe("pass");
    expect(q(older, player({ birthYear: 2011, birthDate: null })).outcome).toBe("fail");
    expect(q(older, player({ birthYear: 2001, birthDate: null })).outcome).toBe("pass");
  });
  it("sam rocznik wystarcza, by rozstrzygnąć regułę roczników (bez dnia urodzin)", () => {
    expect(q(years(2011), player({ birthDate: null, birthYear: 2011 })).outcome).toBe("pass");
  });
  it("brak daty/roku urodzenia = NEEDS_INFORMATION, nie 1 stycznia", () => {
    const r = q(years(2011), player({ birthDate: null, birthYear: null }));
    expect(r.outcome).toBe("unknown");
    expect(r.reasons).toContain("birth_year_missing");
  });
});

describe("limit wieku i data odniesienia", () => {
  const ref = (date: string): AgeLimit["ref"] => ({ type: "date", date });
  const lte17 = (date: string): Eligibility => ({ ageLimits: [{ op: "lte", age: 17, ref: ref(date) }] });

  it("urodziny przesuwają wiek dokładnie w dniu urodzin", () => {
    expect(ageRangeOn({ birthDate: "2009-11-25" }, "2026-11-24")).toEqual([16, 16]);
    expect(ageRangeOn({ birthDate: "2009-11-25" }, "2026-11-25")).toEqual([17, 17]);
    expect(ageRangeOn({ birthDate: "2009-11-25" }, "2027-11-24")).toEqual([17, 17]);
    expect(ageRangeOn({ birthDate: "2009-11-25" }, "2027-11-25")).toEqual([18, 18]);
  });
  it("operatory graniczne: lte 17 dla osoby, która kończy 18 lat w dniu odniesienia", () => {
    const f = player({ birthDate: "2008-12-31" });
    expect(q(lte17("2026-12-30"), f).outcome).toBe("pass"); // dzień przed 18. urodzinami: 17 lat
    expect(q(lte17("2026-12-31"), f).outcome).toBe("fail"); // w dniu urodzin: 18 lat
  });
  it("wszystkie operatory", () => {
    const f = player({ birthDate: "2009-01-01" }); // 17 lat 2026-11-25
    const op = (o: AgeLimit["op"], age: number) => q({ ageLimits: [{ op: o, age, ref: ref("2026-11-25") }] }, f).outcome;
    expect([op("lt", 17), op("lt", 18), op("lte", 17), op("gt", 17), op("gt", 16), op("gte", 17), op("gte", 18), op("eq", 17), op("eq", 16)])
      .toEqual(["fail", "pass", "pass", "fail", "pass", "pass", "fail", "pass", "fail"]);
  });
  it("data wskazana przez organizatora ma znaczenie – to samo dziecko raz pasuje, raz nie", () => {
    const f = player({ birthDate: "2009-06-15" });
    expect(q(lte17("2027-06-14"), f).outcome).toBe("pass"); // jeszcze 17 lat
    expect(q(lte17("2027-06-15"), f).outcome).toBe("fail"); // w dniu urodzin ma już 18
  });
  it("„wiek na dzień sesji” używa daty konkretnej sesji, a nie dzisiejszej", () => {
    const e: Eligibility = { ageLimits: [{ op: "lte", age: 16, ref: { type: "session_start" } }] };
    const f = player({ birthDate: "2009-11-26" });
    expect(q(e, f, "2026-11-25").outcome).toBe("pass"); // 16 lat
    expect(q(e, f, "2026-11-26").outcome).toBe("fail"); // 17 lat
  });
  it("nieokreślona data odniesienia = NEEDS_INFORMATION (nie zakładamy dziś ani początku wydarzenia)", () => {
    const r = q({ ageLimits: [{ op: "lte", age: 17, ref: { type: "unspecified" } }] });
    expect(r.outcome).toBe("unknown");
    expect(r.reasons).toEqual(["age_ref_unspecified"]);
  });
  it("sam rok urodzenia, gdy wiek zależy od dnia urodzin = NEEDS_INFORMATION; gdy nie zależy – rozstrzyga", () => {
    const e = lte17("2026-11-25");
    const yearOnly = (y: number) => player({ birthDate: null, birthYear: y });
    // rocznik 2008: 17 lub 18 lat w dniu 2026-11-25 → zależy od urodzin
    expect(q(e, yearOnly(2008)).outcome).toBe("unknown");
    expect(q(e, yearOnly(2008)).reasons).toEqual(["needs_birthday"]);
    // rocznik 2009: 16 lub 17 lat → zawsze <= 17
    expect(q(e, yearOnly(2009)).outcome).toBe("pass");
    // rocznik 2007: 18 lub 19 lat → zawsze > 17
    expect(q(e, yearOnly(2007)).outcome).toBe("fail");
  });
  it("urodzony 29 lutego: w roku niewysokosowym obie konwencje (28.02 i 1.03) muszą dać ten sam wynik", () => {
    expect(ageRangeOn({ birthDate: "2008-02-29" }, "2027-02-28")).toEqual([18, 19]);
    expect(ageRangeOn({ birthDate: "2008-02-29" }, "2027-03-01")).toEqual([19, 19]);
    expect(q({ ageLimits: [{ op: "lte", age: 18, ref: ref("2027-02-28") }] }, player({ birthDate: "2008-02-29" })).outcome).toBe("unknown");
  });
  it("roczniki i wiek razem: oba warunki muszą być spełnione", () => {
    const e: Eligibility = { birthYears: [{ op: "range", from: 2008, to: 2010 }], ageLimits: [{ op: "lte", age: 16, ref: { type: "date", date: "2026-11-25" } }] };
    expect(q(e, player({ birthDate: "2010-03-01" })).outcome).toBe("pass");
    expect(q(e, player({ birthDate: "2008-03-01" })).outcome).toBe("fail"); // rocznik ok, ale 18 lat
  });
});

describe("kategorie, niejednoznaczność, wyjątki", () => {
  it("samo „U17” lub „junior” bez potwierdzonych zasad nie daje MATCH", () => {
    expect(q({ categoryLabel: "U17" }).outcome).toBe("unknown");
    expect(q({ categoryLabel: "junior" }).reasons).toEqual(["category_only"]);
  });
  it("brak informacji o wieku blokuje rekomendację", () => {
    expect(q(null).outcome).toBe("unknown");
    expect(q({}).outcome).toBe("unknown");
    expect(q({}).reasons).toEqual(["age_unknown"]);
  });
  it("oznaczona niejednoznaczność blokuje, ale pewne wykluczenie nadal jest NO_MATCH", () => {
    expect(q({ ...years(2011), ambiguous: "napisano „roczniki 2011/12”" }).outcome).toBe("unknown");
    expect(q({ ...years(2005), ambiguous: "x" }).outcome).toBe("fail");
  });
  it("wyjątek za zgodą nie jest automatycznie spełniony", () => {
    const r = q({ ...years(2010), consentException: "młodsi za zgodą trenera" }, player({ birthDate: "2012-01-01" }));
    expect(r.outcome).toBe("fail");
    expect(r.reasons).toEqual(["birth_year_out", "consent_exception"]);
  });
});

describe("kwalifikacja sesji: pozycja, tryb, rodzaj, odległość", () => {
  const ses = session("2026-11-25", years(2011));
  const base = () => listing({ sessions: [ses] });

  it("wszystko potwierdzone = MATCH", () => {
    const r = qualifySession(base(), ses, player());
    expect(r.result).toBe("MATCH");
    expect(r.distanceKm).toBe(0);
  });
  it("oferta wyłącznie bramkarska nie pasuje do gracza z pola; nieznana pozycja wymaga uzupełnienia", () => {
    const gk = listing({ sessions: [ses], positions: { scope: "only", positions: ["bramkarz"] } });
    expect(qualifySession(gk, ses, player({ position: "pomocnik" })).result).toBe("NO_MATCH");
    expect(qualifySession(gk, ses, player({ position: "pomocnik" })).reasons).toEqual(["position_out"]);
    expect(qualifySession(gk, ses, player({ position: "bramkarz" })).result).toBe("MATCH");
    expect(qualifySession(gk, ses, player({ position: null })).result).toBe("NEEDS_INFORMATION");
  });
  it("nieznane ograniczenia pozycji w ogłoszeniu ≠ oferta dla wszystkich", () => {
    const r = qualifySession(listing({ sessions: [ses], positions: { scope: "unknown" } }), ses, player());
    expect(r.result).toBe("NEEDS_INFORMATION");
    expect(r.reasons).toEqual(["listing_position_unknown"]);
  });
  it("zgłoszenie drużynowe nie trafia do indywidualnych rekomendacji; nieznany tryb wymaga informacji", () => {
    expect(qualifySession(listing({ sessions: [ses], signupMode: "team_only" }), ses, player()).result).toBe("NO_MATCH");
    expect(qualifySession(listing({ sessions: [ses], signupMode: "unknown" }), ses, player()).result).toBe("NEEDS_INFORMATION");
  });
  it("pewne wykluczenie wygrywa z brakiem danych", () => {
    const r = qualifySession(listing({ sessions: [ses], signupMode: "unknown", positions: { scope: "only", positions: ["napastnik"] } }), ses, player());
    expect(r.result).toBe("NO_MATCH");
  });
  it("wybrane rodzaje ofert zawężają wynik", () => {
    expect(qualifySession(base(), ses, player({ kinds: ["nabor"] })).result).toBe("NO_MATCH");
    expect(qualifySession(base(), ses, player({ kinds: ["nabor", "testy"] })).result).toBe("MATCH");
  });
  it("odległość: poza promieniem NO_MATCH; brak współrzędnych nie jest zgadywany; cała Polska nie wymaga współrzędnych", () => {
    const far = listing({ sessions: [ses], city: "Gdańsk", lat: 54.352, lon: 18.649 });
    expect(qualifySession(far, ses, player({ radiusKm: 100 })).result).toBe("NO_MATCH");
    const d = qualifySession(far, ses, player({ radiusKm: 200 })).distanceKm!;
    expect(d).toBeGreaterThan(400);
    expect(qualifySession(far, ses, player({ radiusKm: null })).result).toBe("MATCH");
    const unknown = listing({ sessions: [ses], lat: null, lon: null });
    expect(qualifySession(unknown, ses, player({ radiusKm: 100 })).result).toBe("NEEDS_INFORMATION");
    expect(qualifySession(unknown, ses, player({ radiusKm: 100 })).distanceKm).toBeNull();
    expect(qualifySession(unknown, ses, player({ radiusKm: null })).result).toBe("MATCH");
  });
  it("brak miejscowości przy ograniczonym promieniu = brak danych profilu", () => {
    expect(qualifySession(base(), ses, player({ place: null })).reasons).toEqual(["place_missing"]);
  });
  it("zwiększenie promienia nigdy nie poszerza dozwolonego wieku", () => {
    const old = listing({ sessions: [session("2026-11-25", years(2008))] });
    for (const radiusKm of [25, 50, 100, 200, null]) {
      const r = qualifySession(old, old.sessions[0]!, player({ radiusKm, birthDate: "2011-05-10" }));
      expect(r.result).toBe("NO_MATCH");
      expect(r.reasons).toContain("birth_year_out");
    }
  });
});

describe("osobne sesje jednego ogłoszenia", () => {
  const l = listing({
    sessions: [session("2026-11-24", { birthYears: [{ op: "range", from: 2012, to: 2013 }] }), session("2026-11-25", years(2014))],
  });
  it("roczniki 2012–2013 → tylko sesja 24.11; rocznik 2014 → tylko 25.11; rocznik 2011 → żadna", () => {
    const e1 = evaluateListing(l, player({ birthDate: "2012-04-01" }), NOW);
    expect(e1.result).toBe("MATCH");
    expect(e1.matching.map((m) => m.session.date)).toEqual(["2026-11-24"]);
    const e2 = evaluateListing(l, player({ birthDate: "2014-04-01" }), NOW);
    expect(e2.matching.map((m) => m.session.date)).toEqual(["2026-11-25"]);
    expect(evaluateListing(l, player({ birthDate: "2011-04-01" }), NOW).result).toBe("NO_MATCH");
  });
  it("sesja bez zasad wieku nie dziedziczy zasad innej sesji", () => {
    const m = listing({ sessions: [session("2026-11-24", years(2012)), session("2026-11-25", null)] });
    const e = evaluateListing(m, player({ birthDate: "2012-04-01" }), NOW);
    expect(e.matching.map((x) => x.session.date)).toEqual(["2026-11-24"]);
  });
});

describe("sortowanie po kwalifikacji", () => {
  it("domyślnie odległość, potem termin, przy remisie stabilnie po id", () => {
    const a = listing({ id: "a", city: "Kraków", sessions: [session("2026-11-30", years(2011))] });
    const b = listing({ id: "b", city: "Kraków", sessions: [session("2026-11-26", years(2011))] });
    const c = listing({ id: "c", lat: 50.2, lon: 19.5, sessions: [session("2026-11-21", years(2011))] });
    const d = listing({ id: "d", city: "Kraków", sessions: [session("2026-11-26", years(2011))] });
    const evals = [a, b, c, d].map((x) => evaluateListing(x, player(), NOW));
    expect(sortEvaluations(evals).map((e) => e.listing.id)).toEqual(["b", "d", "a", "c"]);
    expect(sortEvaluations(evals, "date").map((e) => e.listing.id)).toEqual(["c", "b", "d", "a"]);
    expect(sortEvaluations([...evals].reverse()).map((e) => e.listing.id)).toEqual(["b", "d", "a", "c"]);
  });
});
