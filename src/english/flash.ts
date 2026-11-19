/** Sesja fiszek jako czyste funkcje: kolejka kart, ocena „wiem / jeszcze nie” i harmonogram powtórek (ten sam co w ćwiczeniach). */
import { levelRank, recordCard, type EnglishDoc } from "./progress";
import { isDue, type PhraseProgress } from "./srs";
import type { Deck } from "./cards";
import type { Level } from "./types";

/** Minimalny opis karty potrzebny do ułożenia kolejki (bez treści). */
export interface CardRef { id: string; deck: Deck; level: Level }

export interface FlashItem { deck: Deck; id: string; retry?: true }
export interface FlashSession {
  /** „deck” – nauka wybranej talii; „due” – powtórka fiszek na terminie (słowa i hasła). */
  scope: "deck" | "due";
  deck?: Deck;
  items: FlashItem[];
  idx: number;
  day: string;
  /** Indeks ostatnio ocenionej karty (ochrona przed podwójnym kliknięciem); -1 = żadna. */
  answered: number;
  /** Ocena za pierwszym razem: „talia:id” → czy znał. */
  firstTry: Record<string, boolean>;
}

export const progressOfCard = (doc: EnglishDoc, c: Pick<CardRef, "deck" | "id">): PhraseProgress | undefined => (c.deck === "phrases" ? doc.phrases[c.id] : doc.cards[c.id]);

/**
 * Nauka talii: najpierw karty na terminie (najbardziej spóźnione), potem jeszcze niewidziane (według poziomu trudności i kolejności w talii),
 * a gdy to za mało – pozostałe od najwcześniejszego terminu. Do `limit` kart.
 */
export function deckQueue(doc: EnglishDoc, cards: CardRef[], deck: Deck, day: string, pref: Level | null, limit = 10): CardRef[] {
  const inDeck = cards.filter((c) => c.deck === deck);
  const due = inDeck.filter((c) => { const p = progressOfCard(doc, c); return p && isDue(p, day); })
    .sort((a, b) => progressOfCard(doc, a)!.due.localeCompare(progressOfCard(doc, b)!.due) || a.id.localeCompare(b.id));
  const unseen = inDeck.filter((c) => !progressOfCard(doc, c)).sort((a, b) => levelRank(pref, a.level) - levelRank(pref, b.level));
  const rest = inDeck.filter((c) => { const p = progressOfCard(doc, c); return p && !isDue(p, day); })
    .sort((a, b) => progressOfCard(doc, a)!.due.localeCompare(progressOfCard(doc, b)!.due));
  return [...due, ...unseen, ...rest].slice(0, limit);
}

/** Powtórka fiszek spoza lekcji (słowa, hasła), które są na terminie. */
export function dueQueue(doc: EnglishDoc, cards: CardRef[], day: string, limit = 15): CardRef[] {
  return cards.filter((c) => c.deck !== "phrases").filter((c) => { const p = progressOfCard(doc, c); return p && isDue(p, day); })
    .sort((a, b) => progressOfCard(doc, a)!.due.localeCompare(progressOfCard(doc, b)!.due) || a.id.localeCompare(b.id)).slice(0, limit);
}

export function startFlash(queue: CardRef[], scope: "deck" | "due", deck: Deck | undefined, day: string): FlashSession | null {
  if (!queue.length) return null;
  return { scope, ...(deck ? { deck } : {}), items: queue.map((c) => ({ deck: c.deck, id: c.id })), idx: 0, day, answered: -1, firstTry: {} };
}

export const currentCard = (s: FlashSession): FlashItem | null => s.items[s.idx] ?? null;
export const isFlashFinished = (s: FlashSession): boolean => s.idx >= s.items.length;

/**
 * Ocena bieżącej karty. Powtórne wywołanie dla tej samej karty (podwójne kliknięcie) niczego nie zmienia.
 * „Jeszcze nie” dokłada kartę raz na koniec sesji i kieruje ją na powtórkę następnego dnia.
 */
export function rate(doc: EnglishDoc, s: FlashSession, known: boolean, day: string, now: number): { doc: EnglishDoc; session: FlashSession; applied: boolean; requeued: boolean } {
  const it = currentCard(s);
  if (!it || s.answered === s.idx) return { doc, session: s, applied: false, requeued: false };
  const requeued = !known && !it.retry;
  const session: FlashSession = {
    ...s, answered: s.idx,
    firstTry: it.retry ? s.firstTry : { ...s.firstTry, [`${it.deck}:${it.id}`]: known },
    items: requeued ? [...s.items, { deck: it.deck, id: it.id, retry: true }] : s.items,
  };
  return { doc: recordCard(doc, it.deck, it.id, known, day, now), session, applied: true, requeued };
}

/** Dalej – dopiero po ocenie bieżącej karty. */
export function nextFlash(s: FlashSession): FlashSession {
  return s.answered === s.idx ? { ...s, idx: s.idx + 1 } : s;
}

export const flashScore = (s: FlashSession): { known: number; total: number } => {
  const v = Object.values(s.firstTry);
  return { known: v.filter(Boolean).length, total: v.length };
};
