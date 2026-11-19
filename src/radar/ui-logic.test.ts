import { describe, expect, it } from "vitest";
import type { Profile } from "../engine";
import { evaluateListing } from "../../supabase/functions/_shared/radar/index.ts";
import type { Eligibility } from "../../supabase/functions/_shared/radar/index.ts";
import { audienceText, eligibilityNotes, freshnessLines, REASON_TEXT } from "./format";
import { DEFAULT_PREFS } from "./prefs";
import { criteriaParts, needsOrganizerCheck, playerFacts, visibleList } from "./state";
import { NOW, listing, session, years } from "./fixtures";

const profile = { name: "Jan", position: "pomocnik" } as unknown as Profile;
const facts = (over: Partial<typeof DEFAULT_PREFS> = {}) => playerFacts(profile, { birthDate: "2011-05-10" }, { ...DEFAULT_PREFS, place: { name: "Kraków", lat: 50.061, lon: 19.937 }, ...over });
const evalOf = (elig: Eligibility, over: Partial<typeof DEFAULT_PREFS> = {}) => {
  const ses = session("2026-11-25", elig);
  return evaluateListing(listing({ sessions: [ses] }), facts(over), NOW);
};

describe("kategoria rozgrywek w kryteriach radaru", () => {
  it("domyślnie brak filtra kategorii; wybór zawodnika trafia do dopasowania i do opisu kryteriów", () => {
    expect(facts().category).toBeNull();
    expect(criteriaParts(facts()).some((p) => p.startsWith("kategoria"))).toBe(false);
    expect(facts({ category: "female" }).category).toBe("female");
    expect(criteriaParts(facts({ category: "female" }))).toContain("kategoria: dziewczęta");
  });
});

describe("oferty „do sprawdzenia u organizatora”", () => {
  it("wyjątek za zgodą przy zgodnym roczniku nie jest MATCH i nie trafia na listę dopasowań, ale jest jawnie pokazany do sprawdzenia", () => {
    const e = evalOf({ ...years(2011), consentException: "udział po akceptacji trenera" });
    expect(e.result).toBe("NEEDS_INFORMATION");
    expect(visibleList([e], { kinds: [], freeOnly: false, sort: "distance" })).toHaveLength(0);
    expect(needsOrganizerCheck([e])).toHaveLength(1);
  });
  it("brak informacji o kategorii przy wybranej kategorii → do sprawdzenia; pasująca kategoria → MATCH", () => {
    const none = evalOf(years(2011), { category: "female" });
    expect(none.result).toBe("NEEDS_INFORMATION");
    expect(needsOrganizerCheck([none])).toHaveLength(1);
    expect(evalOf({ ...years(2011), audience: "female" }, { category: "female" }).result).toBe("MATCH");
  });
  it("braki w profilu (np. rocznik) NIE są „do sprawdzenia u organizatora”; pewne wykluczenie też nie", () => {
    const f = { ...facts(), birthDate: null, birthYear: null };
    const missing = evaluateListing(listing({ sessions: [session("2026-11-25", years(2011))] }), f, NOW);
    expect(needsOrganizerCheck([missing])).toHaveLength(0);
    expect(needsOrganizerCheck([evalOf({ ...years(2011), audience: "male" }, { category: "female" })])).toHaveLength(0); // NO_MATCH
  });
  it("każdy powód z tej sekcji ma czytelny opis dla użytkownika", () => {
    expect(REASON_TEXT.consent_exception).toMatch(/organizator/);
    expect(REASON_TEXT.audience_missing).toMatch(/kategori/);
  });
});

describe("teksty o zasadach i aktualności", () => {
  it("notatki: kategoria, wyjątek za zgodą (z zakresem) i dokumenty przy zapisie są widoczne", () => {
    expect(audienceText("female")).toBe("kategoria: dziewczęta/kobiety");
    expect(audienceText("unknown")).toBeNull();
    const n = eligibilityNotes({ ...years(2011), audience: "male", consentException: "młodsi za zgodą trenera", consentScope: "outside_base", requiredDocuments: ["zgoda rodzica"] });
    expect(n).toEqual(["kategoria: chłopcy/mężczyźni", "wyjątek za zgodą organizatora: „młodsi za zgodą trenera” (dotyczy osób spoza podanych kryteriów)", "przy zapisie: zgoda rodzica"]);
    expect(eligibilityNotes({ ...years(2011), consentException: "x" })[0]).toMatch(/sprawdź u organizatora, czy dotyczy także Ciebie/);
    expect(eligibilityNotes(null)).toEqual([]);
  });
  it("data aktualizacji strony i potwierdzenie organizatora to osobne, jasno nazwane wiersze", () => {
    const l = listing({ pageUpdatedAt: new Date(NOW - 5 * 3_600_000).toISOString(), organizerConfirmedAt: null, organizerConfirmation: null });
    const only = freshnessLines(l, NOW);
    expect(only).toHaveLength(1);
    expect(only[0]).toMatch(/strona zaktualizowana/);
    expect(only[0]).toMatch(/to nie potwierdzenie organizatora/);
    expect(only.join()).not.toMatch(/potwierdzone przez organizatora/);
    const both = freshnessLines({ ...l, organizerConfirmedAt: new Date(NOW - 3_600_000).toISOString(), organizerConfirmation: { method: "admin_contact", evidence: "e-mail" } }, NOW);
    expect(both).toHaveLength(2);
    expect(both[1]).toMatch(/potwierdzone przez organizatora.*kontakt z organizatorem zapisany przez nas/);
    expect(freshnessLines(listing({ organizerConfirmedAt: new Date(NOW - 3_600_000).toISOString() }), NOW)[0]).toMatch(/oświadczenie organizatora na stronie/);
  });
});
