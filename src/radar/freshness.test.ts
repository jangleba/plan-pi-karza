import { describe, expect, it } from "vitest";
import { evaluateListing, listingFreshness, matchesOnly, warsawDayEndExclusive, warsawInstant, warsawStartOfDay } from "../../supabase/functions/_shared/radar/index.ts";
import { NOW, daysAgo, hoursAgo, listing, player, session, years } from "./fixtures.ts";

const live = (l = listing({ sessions: [session("2026-11-25", years(2011))] }), now = NOW) => listingFreshness(l, now);
const ok = () => listing({ sessions: [session("2026-11-25", years(2011))] });

describe("strefa czasowa Europe/Warsaw", () => {
  it("czas zimowy UTC+1, letni UTC+2, przełączenie w nocy", () => {
    expect(new Date(warsawStartOfDay("2026-11-25")).toISOString()).toBe("2026-11-24T23:00:00.000Z");
    expect(new Date(warsawStartOfDay("2026-07-01")).toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(new Date(warsawStartOfDay("2026-03-29")).toISOString()).toBe("2026-03-28T23:00:00.000Z"); // dzień zmiany na letni
    expect(new Date(warsawStartOfDay("2026-03-30")).toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(new Date(warsawStartOfDay("2026-10-25")).toISOString()).toBe("2026-10-24T22:00:00.000Z"); // dzień zmiany na zimowy
    expect(new Date(warsawInstant("2026-11-25", 18, 30)).toISOString()).toBe("2026-11-25T17:30:00.000Z");
  });
  it("dzień zmiany czasu ma 23 lub 25 godzin", () => {
    expect((warsawDayEndExclusive("2026-03-29") - warsawStartOfDay("2026-03-29")) / 3_600_000).toBe(23);
    expect((warsawDayEndExclusive("2026-10-25") - warsawStartOfDay("2026-10-25")) / 3_600_000).toBe(25);
  });
});

describe("aktualność ogłoszeń", () => {
  it("świeże ogłoszenie z przyszłą sesją jest aktualne", () => expect(live().live).toBe(true));

  it("po 48 godzinach bez poprawnego sprawdzenia źródła przestaje być rekomendowane", () => {
    expect(live(listing({ sessions: ok().sessions, sourceCheckedAt: hoursAgo(47.9) })).live).toBe(true);
    const r = live(listing({ sessions: ok().sessions, sourceCheckedAt: hoursAgo(48.1) }));
    expect([r.live, r.reason]).toEqual([false, "source_stale"]);
    expect(live(listing({ sessions: ok().sessions, sourceCheckedAt: null })).reason).toBe("source_stale");
  });

  it("termin zgłoszeń podany datą obejmuje cały dzień lokalny, a godzin nie wymyślamy", () => {
    const closes = new Date(warsawDayEndExclusive("2026-11-19")).toISOString(); // koniec 19.11 lokalnie = 2026-11-19T23:00Z
    const l = listing({ sessions: [session("2026-11-25", years(2011))], signupClosesAt: closes });
    expect(listingFreshness(l, Date.parse("2026-11-19T22:59:59Z")).live).toBe(true); // 23:59:59 lokalnie
    expect(listingFreshness(l, Date.parse("2026-11-19T23:00:00Z")).reason).toBe("deadline_passed"); // północ lokalna
  });

  it("po rozpoczęciu sesji przestaje być rekomendowana; sesja z godziną liczy od tej godziny, sama data – od początku dnia", () => {
    const withTime = listing({ sessions: [session("2026-11-19", years(2011), { startsAt: "2026-11-19T17:00:00Z" })] });
    expect(listingFreshness(withTime, Date.parse("2026-11-19T16:59:00Z")).live).toBe(true);
    expect(listingFreshness(withTime, Date.parse("2026-11-19T17:00:00Z")).reason).toBe("no_live_sessions");
    const dateOnly = listing({ sessions: [session("2026-11-20", years(2011))] });
    expect(listingFreshness(dateOnly, Date.parse("2026-11-19T22:59:00Z")).live).toBe(true);
    expect(listingFreshness(dateOnly, Date.parse("2026-11-19T23:00:00Z")).live).toBe(false);
  });

  it("przeszła sesja nie zasłania przyszłej tego samego ogłoszenia", () => {
    const l = listing({ sessions: [session("2026-11-10", years(2011)), session("2026-11-25", years(2011))] });
    expect(live(l).liveSessions.map((s) => s.date)).toEqual(["2026-11-25"]);
  });

  it("odwołana sesja, zamknięte/odwołane/zapełnione zapisy i wycofane ogłoszenia nie są rekomendowane", () => {
    expect(live(listing({ sessions: [session("2026-11-25", years(2011), { status: "cancelled" })] })).reason).toBe("no_live_sessions");
    for (const st of ["closed", "cancelled", "full"] as const) expect(live(listing({ sessions: ok().sessions, signupStatus: st })).reason).toBe(st);
    for (const status of ["withdrawn", "expired", "pending_review", "duplicate"] as const) expect(live(listing({ sessions: ok().sessions, status })).reason).toBe("not_published");
  });

  it("brak informacji o zapisach nie oznacza, że są otwarte, ale też nie wyłącza oferty", () => {
    expect(live(listing({ sessions: ok().sessions, signupStatus: "unknown" })).live).toBe(true);
  });

  it("nabór bezterminowy wymaga potwierdzenia organizatora co najwyżej po 7 dniach", () => {
    const l = (confirmed: string | null, checked = hoursAgo(1)) => listing({ indefinite: true, eligibility: years(2011), organizerConfirmedAt: confirmed, sourceCheckedAt: checked });
    expect(listingFreshness(l(daysAgo(6.9)), NOW).live).toBe(true);
    expect(listingFreshness(l(daysAgo(7.1)), NOW).reason).toBe("unconfirmed_indefinite");
    expect(listingFreshness(l(null), NOW).reason).toBe("unconfirmed_indefinite");
    // ponowne pobranie tej samej starej strony odnawia source_checked_at, ale NIE organizer_confirmed_at
    expect(listingFreshness(l(daysAgo(8), hoursAgo(0.1)), NOW).reason).toBe("unconfirmed_indefinite");
    // a samo potwierdzenie bez poprawnego sprawdzenia źródła też nie wystarcza
    expect(listingFreshness(l(hoursAgo(1), hoursAgo(60)), NOW).reason).toBe("source_stale");
  });

  it("ważność jest sprawdzana przy odczycie wyników: ogłoszenie przeterminowane między uruchomieniami zadania nie trafia do „Dla Ciebie”", () => {
    const l = listing({ sessions: [session("2026-11-25", years(2011))] });
    const inTwoDays = NOW + 49 * 3_600_000; // zadanie odświeżania nie zadziałało
    expect(matchesOnly([evaluateListing(l, player(), NOW)])).toHaveLength(1);
    expect(matchesOnly([evaluateListing(l, player(), inTwoDays)])).toHaveLength(0);
  });

  it("NEEDS_INFORMATION i NO_MATCH nigdy nie trafiają do „Dla Ciebie”", () => {
    const evals = [
      evaluateListing(listing({ sessions: [session("2026-11-25", { categoryLabel: "U17" })] }), player(), NOW),
      evaluateListing(listing({ sessions: [session("2026-11-25", years(2005))] }), player(), NOW),
      evaluateListing(listing({ sessions: [session("2026-11-25", years(2011))] }), player(), NOW),
    ];
    expect(evals.map((e) => e.result)).toEqual(["NEEDS_INFORMATION", "NO_MATCH", "MATCH"]);
    expect(matchesOnly(evals)).toHaveLength(1);
  });
});
