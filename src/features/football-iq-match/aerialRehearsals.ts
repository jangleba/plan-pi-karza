import type { IQRole } from "./journeyTypes";
import type { RunningModel } from "./mixamo";
import type { MatchPlayer, Point } from "./types";
import { createAerialSequence } from "./aerialSequence";

type Rehearsal = {
  role: IQRole;
  title: string;
  controlled: "passer" | "header" | "receiver";
  delivery: "lofted" | "cross";
  positions: readonly [Point, Point, Point, Point];
  cues: readonly [string, string, string, string];
};
// Prepared playback layouts, NOT extra playable IQ scenarios. They deliberately
// do not enter journeyBank/history before real-asset and decision-flow review.
const layouts: Rehearsal[] = [
  {
    role: "gk",
    title: "Długa piłka i zgranie",
    controlled: "passer",
    delivery: "lofted",
    positions: [
      { x: 50, y: 123 },
      { x: 37, y: 69 },
      { x: 58, y: 62 },
      { x: 42, y: 62 },
    ],
    cues: [
      "Zobacz ustawienie napastnika.",
      "Zagraj w jego strefę.",
      "Partner zbiera zgranie.",
      "Podejdź za akcją.",
    ],
  },
  {
    role: "cb",
    title: "Główka do bocznego sektora",
    controlled: "header",
    delivery: "lofted",
    positions: [
      { x: 48, y: 30 },
      { x: 52, y: 87 },
      { x: 80, y: 95 },
      { x: 55, y: 79 },
    ],
    cues: [
      "Sprawdź lot i rywala.",
      "Zajmij miejsce przed wybiciem.",
      "Skieruj główkę do boku.",
      "Odtwórz linię obrony.",
    ],
  },
  {
    role: "fb",
    title: "Dośrodkowanie i dalsze wsparcie",
    controlled: "passer",
    delivery: "cross",
    positions: [
      { x: 86, y: 40 },
      { x: 55, y: 25 },
      { x: 36, y: 24 },
      { x: 57, y: 17 },
    ],
    cues: [
      "Sprawdź wbiegającego partnera.",
      "Dośrodkuj poza pierwszego obrońcę.",
      "Partner zgrywa do środka.",
      "Zostań opcją do powrotu.",
    ],
  },
  {
    role: "six",
    title: "Zbierz drugą piłkę",
    controlled: "receiver",
    delivery: "lofted",
    positions: [
      { x: 43, y: 111 },
      { x: 48, y: 63 },
      { x: 66, y: 68 },
      { x: 51, y: 57 },
    ],
    cues: [
      "Oceń miejsce pojedynku.",
      "Ustaw się pod zgranie.",
      "Przyjmij poza doskokiem.",
      "Znajdź pierwsze podanie.",
    ],
  },
  {
    role: "eight",
    title: "Drugie tempo po zgraniu",
    controlled: "receiver",
    delivery: "lofted",
    positions: [
      { x: 28, y: 97 },
      { x: 53, y: 54 },
      { x: 68, y: 47 },
      { x: 56, y: 48 },
    ],
    cues: [
      "Zobacz ruch napastnika.",
      "Podejdź pod drugą piłkę.",
      "Otwórz ciało do przodu.",
      "Wykorzystaj wolny korytarz.",
    ],
  },
  {
    role: "ten",
    title: "Główka na trzeciego",
    controlled: "receiver",
    delivery: "lofted",
    positions: [
      { x: 72, y: 85 },
      { x: 51, y: 40 },
      { x: 32, y: 36 },
      { x: 48, y: 34 },
    ],
    cues: [
      "Sprawdź partnera i zgranie.",
      "Wyjdź poza cień obrońcy.",
      "Przyjmij piłkę z główki.",
      "Uruchom dalszego partnera.",
    ],
  },
  {
    role: "wing",
    title: "Dalszy słupek i zgranie",
    controlled: "header",
    delivery: "cross",
    positions: [
      { x: 16, y: 38 },
      { x: 71, y: 31 },
      { x: 53, y: 27 },
      { x: 72, y: 20 },
    ],
    cues: [
      "Kontroluj piłkę i obrońcę.",
      "Zmień tempo na dalszy słupek.",
      "Zgraj głową do partnera.",
      "Szukaj kolejnej przestrzeni.",
    ],
  },
  {
    role: "nine",
    title: "Wyprzedź i zgraj głową",
    controlled: "header",
    delivery: "cross",
    positions: [
      { x: 84, y: 37 },
      { x: 50, y: 29 },
      { x: 34, y: 25 },
      { x: 49, y: 18 },
    ],
    cues: [
      "Sprawdź obrońcę za plecami.",
      "Wyprzedź go ruchem do piłki.",
      "Zgraj do wolnego partnera.",
      "Rusz po odegraniu.",
    ],
  },
];
export const aerialRehearsals = layouts.flatMap((layout) =>
  [false, true].map((mirrored) => ({
    ...layout,
    id: `aerial-ready-${layout.role}-${mirrored ? "left" : "right"}`,
    positions: layout.positions.map((p) => ({ x: mirrored ? 100 - p.x : p.x, y: p.y })),
  })),
);

export function buildAerialRehearsal(
  id: string,
  assets: Pick<RunningModel, "aerial" | "aerialStatus">,
) {
  const layout = aerialRehearsals.find((r) => r.id === id);
  if (!layout) throw new Error("Nieznana sekwencja przygotowawcza.");
  const [passer, header, receiver, headerAt] = layout.positions;
  const players: MatchPlayer[] = [
    {
      id: "passer",
      team: "home",
      number: layout.role === "gk" ? 1 : 6,
      role: "Podający",
      ...passer,
    },
    { id: "header", team: "home", number: 9, role: "Zgrywający", ...header },
    { id: "receiver", team: "home", number: 8, role: "Wsparcie", ...receiver },
  ].map(
    (p) =>
      ({
        ...p,
        controlled: p.id === layout.controlled,
        goalkeeper: layout.role === "gk" && p.id === "passer",
      }) as MatchPlayer,
  );
  return createAerialSequence(
    players,
    {
      passerId: "passer",
      headerId: "header",
      receiverId: "receiver",
      headerAt,
      delivery: layout.delivery,
    },
    assets,
  );
}
