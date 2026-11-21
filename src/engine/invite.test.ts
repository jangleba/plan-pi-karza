import { describe, expect, it } from "vitest";
import { LIMITS, buildIcs, clean, decodeInvite, encodeInvite, inviteText, inviteUrl, placeLabel, replyText, toLocalInput, whenLabel, type Invite } from "./invite";
import { ALL_DRILLS, drillById } from "./technique";

const IDS = ALL_DRILLS.map((d) => d.id);
const NOW = new Date("2026-11-21T10:00:00");
const base: Invite = { v: 1, drill: IDS[0]!, at: "2026-11-22T17:00", place: "orlik", where: "Orlik przy ul. Szkolnej", from: "Kuba", note: "Weź buty na sztuczną trawę" };

describe("zaproszenie przez link", () => {
  it("kodowanie i odczyt: pełny obieg, także z polskimi znakami", () => {
    const i: Invite = { ...base, where: "Łąki Żoliborskie – boisko „B”", from: "Żaneta", note: "Przynieś piłkę 🙂" };
    expect(decodeInvite(encodeInvite(i), IDS, NOW)).toEqual(i);
    expect(decodeInvite(encodeInvite({ v: 1, drill: IDS[1]!, at: "2026-12-01T08:30", place: "hall" }), IDS, NOW)).toEqual({ v: 1, drill: IDS[1]!, at: "2026-12-01T08:30", place: "hall" });
  });
  it("odrzuca śmieci, nieznane ćwiczenie, zły termin i zbyt długi parametr", () => {
    for (const bad of [null, undefined, "", "abc", "!!!", encodeInvite({ ...base, drill: "nie-ma-takiego" }), encodeInvite({ ...base, at: "jutro" }), encodeInvite({ ...base, at: "2026-02-31T17:00" }),
      encodeInvite({ ...base, at: "2030-01-01T10:00" }), encodeInvite({ ...base, at: "2020-01-01T10:00" }), encodeInvite({ ...base, v: 2 as never }), "x".repeat(LIMITS.url + 1)])
      expect(decodeInvite(bad as string, IDS, NOW), String(bad).slice(0, 30)).toBeNull();
    const notObject = btoa(JSON.stringify("tekst")).replace(/=+$/, "");
    expect(decodeInvite(notObject, IDS, NOW)).toBeNull();
  });
  it("dane z linku są oczyszczane i skracane (nie ufamy nadawcy)", () => {
    const evil = { ...base, where: "x".repeat(500), from: "<img src=x onerror=alert(1)>" + "y".repeat(100), note: "linia1\nlinia2‮\u0000   dużo   spacji", place: "wymyślone" as never };
    const d = decodeInvite(encodeInvite(evil), IDS, NOW)!;
    expect(d.where!.length).toBeLessThanOrEqual(LIMITS.where);
    expect(d.from!.length).toBeLessThanOrEqual(LIMITS.from);
    expect(d.note).toBe("linia1 linia2 dużo spacji");
    expect(d.place).toBe("other");
    expect(decodeInvite(encodeInvite({ ...base, where: "  ", from: "", note: undefined }), IDS, NOW)).not.toHaveProperty("where");
  });
  it("clean: pusty i nie-tekst dają undefined", () => {
    expect(clean("  ", 10)).toBeUndefined();
    expect(clean(5, 10)).toBeUndefined();
    expect(clean(" ab\tcd ", 10)).toBe("ab cd");
  });
  it("adres: dodaje parametr do adresu z zapytaniem i bez", () => {
    expect(inviteUrl("https://a.pl/", base)).toMatch(/^https:\/\/a\.pl\/\?invite=[\w-]+$/);
    expect(inviteUrl("https://a.pl/?x=1", base)).toMatch(/^https:\/\/a\.pl\/\?x=1&invite=[\w-]+$/);
    expect(inviteUrl("https://a.pl/", base).length).toBeLessThan(LIMITS.url);
  });
  it("najdłuższe możliwe zaproszenie mieści się w limicie adresu", () => {
    const max: Invite = { v: 1, drill: IDS[0]!, at: "2026-11-22T17:00", place: "other", where: "Ł".repeat(LIMITS.where), from: "Ż".repeat(LIMITS.from), note: "ą".repeat(LIMITS.note) };
    expect(encodeInvite(max).length).toBeLessThan(LIMITS.url);
    expect(decodeInvite(encodeInvite(max), IDS, NOW)).toEqual(max);
  });
});

describe("teksty i kalendarz", () => {
  const title = drillById(base.drill)!.title;
  it("termin po polsku z dniem tygodnia", () => {
    expect(whenLabel("2026-11-22T17:00")).toBe("niedziela, 22 listopada, 17:00");
    expect(whenLabel("2026-12-05T08:05")).toBe("sobota, 5 grudnia, 08:05");
  });
  it("miejsce: rodzaj z nazwą albo sam rodzaj", () => {
    expect(placeLabel({ place: "orlik", where: "przy szkole" })).toBe("Orlik: przy szkole");
    expect(placeLabel({ place: "hall" })).toBe("Hala");
  });
  it("wiadomość zawiera ćwiczenie, termin, miejsce, link i opcjonalnie imię i notatkę; bez imienia nie ma „Tu”", () => {
    const t = inviteText(base, title, "https://a.pl/?invite=abc");
    for (const part of ["Tu Kuba.", title, "niedziela, 22 listopada, 17:00", "Orlik: Orlik przy ul. Szkolnej", "Weź buty", "https://a.pl/?invite=abc"]) expect(t).toContain(part);
    expect(inviteText({ ...base, from: undefined, note: undefined }, title, "u")).not.toContain("Tu ");
  });
  it("odpowiedzi „będę” i „nie dam rady”", () => {
    expect(replyText("yes", base, title)).toMatch(/będę/);
    expect(replyText("no", base, title)).toMatch(/nie dam rady/);
  });
  it("plik .ics: poprawna struktura, godzina na godzinę, znaki specjalne zabezpieczone", () => {
    const ics = buildIcs({ ...base, note: "a, b; c\nd" }, "Ósemka; wokół, stożków", NOW);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("DTSTART:20261122T170000");
    expect(ics).toContain("DTEND:20261122T180000");
    expect(ics).toContain("SUMMARY:Trening z piłką: Ósemka\; wokół\\, stożków");
    expect(ics).toContain("DESCRIPTION:a\\, b\; c\\nd");
    expect(ics).toContain("DTSTAMP:20261121T");
    expect(toLocalInput(new Date("2026-11-22T17:00"))).toBe("2026-11-22T17:00");
  });
});
