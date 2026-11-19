import { describe, expect, it } from "vitest";
import { ALL_CARDS, CARD_BY_KEY, PHRASE_CARDS, SLOGAN_CARDS, WORD_CARDS, cardsOf } from "./cards";
import { SLOGAN_COUNT, WORD_COUNT, sloganIds, wordIds } from "./meta";
import { normalizeText } from "./match";
import { emptyDoc, parseDoc, recordCard, setLevel, summarize, dueCardCount, mergeRemote, pendingRows } from "./progress";
import { currentCard, deckQueue, dueQueue, flashScore, isFlashFinished, nextFlash, progressOfCard, rate, startFlash } from "./flash";
import { addDays } from "./srs";

const D0 = "2026-11-19";
let t = 1;
const tick = () => ++t;
const refs = ALL_CARDS.map((c) => ({ id: c.id, deck: c.deck, level: c.level }));

describe("fiszki: treści", () => {
  it("talie mają zadeklarowaną liczbę kart; identyfikatory stałe, unikalne i zgodne z formatem akceptowanym w bazie", () => {
    expect(WORD_CARDS.length).toBe(WORD_COUNT);
    expect(SLOGAN_CARDS.length).toBe(SLOGAN_COUNT);
    expect(WORD_CARDS.map((c) => c.id)).toEqual(wordIds());
    expect(SLOGAN_CARDS.map((c) => c.id)).toEqual(sloganIds());
    expect(PHRASE_CARDS.length).toBeGreaterThanOrEqual(72);
    for (const c of ALL_CARDS) expect(c.id, c.id).toMatch(/^[a-z0-9-]{1,40}$/);
    expect(new Set(Object.keys(CARD_BY_KEY)).size).toBe(ALL_CARDS.length);
  });
  it("każda karta ma angielski tekst, polskie znaczenie, notatkę i poziom; teksty angielskie nie powtarzają się w obrębie talii", () => {
    for (const c of ALL_CARDS) {
      expect(c.en.trim().length, c.id).toBeGreaterThan(1);
      expect(c.pl.trim().length, c.id).toBeGreaterThan(2);
      expect(c.note.trim().length, c.id).toBeGreaterThan(8);
      expect([1, 2, 3]).toContain(c.level);
    }
    for (const deck of ["phrases", "words", "slogans"] as const) {
      const en = cardsOf(deck).map((c) => normalizeText(c.en));
      expect(new Set(en).size, deck).toBe(en.length);
    }
  });
  it("słownictwo i hasła obejmują wszystkie poziomy oraz bramkarzy; brak odnośników i danych kontaktowych", () => {
    for (const deck of [WORD_CARDS, SLOGAN_CARDS]) expect(new Set(deck.map((c) => c.level))).toEqual(new Set([1, 2, 3]));
    expect(WORD_CARDS.filter((c) => c.role === "gk").length).toBeGreaterThanOrEqual(5);
    for (const c of ALL_CARDS) expect(JSON.stringify(c)).not.toMatch(/https?:|@|www\./i);
  });
  it("karty zwrotów są dokładnie zwrotami z lekcji (to samo ID, ten sam tekst)", () => {
    for (const c of PHRASE_CARDS) expect(c.id).toMatch(/^[a-z0-9-]+-\d{2}$/);
    expect(PHRASE_CARDS.find((c) => c.id === "partners-01")).toMatchObject({ en: "Man on!", deck: "phrases" });
  });
});

describe("fiszki: sesja i harmonogram", () => {
  it("kolejka talii: najpierw na terminie, potem niewidziane według poziomu trudności; limit sesji", () => {
    let d = emptyDoc();
    const q0 = deckQueue(d, refs, "words", D0, 3, 10);
    expect(q0).toHaveLength(10);
    expect(q0.every((c) => c.deck === "words" && c.level === 3)).toBe(true); // poziom 3: zaawansowane najpierw
    expect(deckQueue(setLevel(d, 1, tick()), refs, "words", D0, 1, 10).every((c) => c.level === 1)).toBe(true);
    d = recordCard(d, "words", "w-30", true, D0, tick());
    const tomorrow = addDays(D0, 1);
    expect(deckQueue(d, refs, "words", tomorrow, 1, 5)[0]!.id).toBe("w-30"); // karta na terminie idzie pierwsza
    expect(deckQueue(d, refs, "words", D0, 1, 5).map((c) => c.id)).not.toContain("w-30"); // jeszcze nie na terminie, a są niewidziane
  });
  it("ocena „Wiem” przesuwa kartę o etap (powtórka jutro), „Jeszcze nie” cofa ją i dokłada na koniec sesji (raz)", () => {
    const q = deckQueue(emptyDoc(), refs, "slogans", D0, 1, 3);
    let s = startFlash(q, "deck", "slogans", D0)!;
    let d = emptyDoc();
    const r1 = rate(d, s, true, D0, tick()); d = r1.doc; s = nextFlash(r1.session);
    expect(progressOfCard(d, q[0]!)).toMatchObject({ stage: 1, due: addDays(D0, 1) });
    const r2 = rate(d, s, false, D0, tick()); d = r2.doc; s = nextFlash(r2.session);
    expect(r2.requeued).toBe(true);
    expect(progressOfCard(d, q[1]!)).toMatchObject({ stage: 0, due: addDays(D0, 1), wrong: 1 });
    expect(s.items).toHaveLength(4);
    const r3 = rate(d, s, true, D0, tick()); d = r3.doc; s = nextFlash(r3.session);
    const r4 = rate(d, s, false, D0, tick()); d = r4.doc; s = nextFlash(r4.session); // powtórka: błąd po raz drugi nie dokłada kolejnej karty
    expect(r4.requeued).toBe(false);
    expect(s.items).toHaveLength(4);
    expect(isFlashFinished(s)).toBe(true);
    expect(flashScore(s)).toEqual({ known: 2, total: 3 });
  });
  it("podwójne kliknięcie i przejście bez oceny nie liczą się; ocena nie wymaga zmiany talii", () => {
    const q = deckQueue(emptyDoc(), refs, "words", D0, 1, 2);
    let s = startFlash(q, "deck", "words", D0)!;
    expect(nextFlash(s).idx).toBe(0); // bez oceny nie ma przejścia
    const a = rate(emptyDoc(), s, true, D0, tick());
    const b = rate(a.doc, a.session, false, D0, tick());
    expect(b.applied).toBe(false);
    expect(b.doc).toBe(a.doc);
    expect(progressOfCard(b.doc, q[0]!)).toMatchObject({ seen: 1, correct: 1, wrong: 0 });
    s = nextFlash(a.session);
    expect(currentCard(s)!.id).toBe(q[1]!.id);
  });
  it("wielokrotna nauka tej samej talii tego samego dnia nie przesuwa karty przez kolejne etapy", () => {
    let d = emptyDoc();
    for (let i = 0; i < 5; i++) d = recordCard(d, "words", "w-01", true, D0, tick());
    expect(d.cards["w-01"]).toMatchObject({ stage: 1, due: addDays(D0, 1), seen: 5 });
  });
  it("karty zwrotów zapisują się jako zwroty z lekcji (jedno źródło prawdy), słowa i hasła osobno", () => {
    let d = recordCard(emptyDoc(), "phrases", "partners-01", true, D0, tick());
    d = recordCard(d, "words", "w-01", true, D0, tick());
    d = recordCard(d, "slogans", "s-01", false, D0, tick());
    expect(Object.keys(d.phrases)).toEqual(["partners-01"]);
    expect(Object.keys(d.cards).sort()).toEqual(["s-01", "w-01"]);
    expect(d.dirty.sort()).toEqual(["card:s-01", "card:w-01", "phrase:partners-01"]);
  });
  it("powtórka fiszek na dziś obejmuje tylko słowa i hasła na terminie; Start liczy powtórki z ćwiczeń i fiszek razem", () => {
    let d = recordCard(emptyDoc(), "words", "w-01", true, D0, tick());
    d = recordCard(d, "slogans", "s-02", true, D0, tick());
    d = recordCard(d, "phrases", "partners-01", true, D0, tick());
    const tomorrow = addDays(D0, 1);
    expect(dueQueue(d, refs, D0)).toEqual([]);
    expect(dueQueue(d, refs, tomorrow).map((c) => c.id).sort()).toEqual(["s-02", "w-01"]);
    expect(dueCardCount(d, tomorrow)).toBe(2);
    const sum = summarize(d, tomorrow);
    expect(sum).toMatchObject({ dueExercises: 1, dueCards: 2, dueToday: 3, cardsSeen: 2 });
    expect(startFlash([], "due", undefined, D0)).toBeNull();
  });
  it("zapis, odczyt i łączenie z kontem obejmują fiszki; nieznane identyfikatory kart są odrzucane", () => {
    let d = recordCard(emptyDoc(), "words", "w-05", true, D0, tick());
    expect(parseDoc(JSON.parse(JSON.stringify(d)))).toEqual(d);
    const raw = JSON.parse(JSON.stringify(d));
    raw.cards["w-99"] = raw.cards["w-05"];
    raw.cards["../x"] = raw.cards["w-05"];
    expect(Object.keys(parseDoc(raw).cards)).toEqual(["w-05"]);
    const row = pendingRows(d).find((r) => r.item === "card:w-05")!;
    const merged = mergeRemote(emptyDoc(), [{ item: "card:w-05", data: row.data }, { item: "card:w-99", data: row.data }]);
    expect(Object.keys(merged.doc.cards)).toEqual(["w-05"]);
  });
});
