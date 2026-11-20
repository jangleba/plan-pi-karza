/**
 * Teksty onboardingu (po polsku, bez form zależnych od płci: rzeczowniki i czasowniki w 1. osobie bez rodzaju).
 * Wszystkie odpowiedzi nadal wybierają te same wartości co wcześniej (klucze „speed”, „preseason” itd.), więc plan się nie zmienia.
 */
import type { Equipment, Position, Season, SeasonGoal } from "../engine";
import type { DayState } from "./answers";

export const INTRO = {
  tagline: "Trenuj mądrzej. Graj lepiej.",
  promises: [
    "Trening dopasowany do Twojego wieku i stażu",
    "W każdym dniu wiesz, co robić",
    "Sześć krótkich pytań, około minuty",
  ],
  start: "Zaczynamy",
};

export const STEP_TITLE = ["", "O Tobie", "Na boisku", "Twój cel", "Sezon", "Trening", "Twój tydzień"] as const;
export const STEP_HINT = [
  "",
  "Tyle wystarczy, żeby dobrać obciążenia.",
  "Pozycja i to, co chcesz poprawić.",
  "Pierwszy wybór to cel główny, drugi jest dodatkowy.",
  "W jakim momencie jesteś i gdzie grasz.",
  "Od czego zależą ćwiczenia w Twoim planie.",
  "Zaznacz, kiedy trenujesz w klubie, grasz i nie możesz.",
] as const;

export const POSITIONS: Array<[Position, string]> = [
  ["bramkarz", "Bramkarz"], ["obronca", "Obrońca"], ["pomocnik", "Pomocnik"], ["skrzydlowy", "Skrzydłowy"], ["napastnik", "Napastnik"],
];

export const GOALS: Array<[SeasonGoal, string, string]> = [
  ["speed", "Szybkość", "Szybsze starty i zrywy. Dodajemy sprint, gdy jest miejsce w tygodniu."],
  ["strength", "Siła", "Wygrywanie pojedynków. Dodajemy trening siłowy, gdy jest miejsce."],
  ["endurance", "Wytrzymałość", "Siły na całe spotkanie. Dodajemy bieganie, gdy jest miejsce."],
  ["return", "Powrót po przerwie", "Spokojne wejście w rytm: pierwsze dwa tygodnie są lżejsze."],
];

export const SEASONS: Array<[Season, string, string]> = [
  ["preseason", "Przygotowanie do sezonu", "Budujemy formę przed startem rozgrywek."],
  ["inseason", "Trwa sezon", "Plan układa się wokół meczów."],
  ["offseason", "Przerwa między sezonami", "Utrzymujemy formę, bez meczów i lżej."],
];

export const EQUIPMENT: Array<[Equipment, string]> = [["gym", "Siłownia"], ["field", "Boisko"], ["track", "Bieżnia"], ["bodyweight", "Własny ciężar"]];

export const DAY_LABEL: Record<DayState, string> = { free: "wolny", club: "klub", match: "mecz", off: "zajęty" };
export const dayHelp = (offseason: boolean): string => (offseason ? "Dotknij dnia, żeby zmienić: wolny, klub, zajęty." : "Dotknij dnia, żeby zmienić: wolny, klub, mecz, zajęty.");

export const LABEL = {
  name: "Jak masz na imię?",
  namePlaceholder: "Imię",
  age: "Wiek",
  weight: "Masa ciała",
  ageNote: "Aplikacja jest dla osób, które ukończyły 16 lat.",
  position: "Na jakiej pozycji grasz?",
  feel: "Co najbardziej Ci przeszkadza w grze? (możesz zaznaczyć kilka)",
  season: "W którym momencie sezonu jesteś?",
  league: "W jakiej lidze grasz?",
  leagueEmpty: "Wybierz poziom rozgrywek",
  years: "Od jak dawna ćwiczysz siłowo?",
  equipment: "Gdzie możesz ćwiczyć? (możesz zaznaczyć kilka)",
  limited: "Na siłownię mogę chodzić tylko kilka razy w tygodniu",
  limitedHint: "Dzień po meczu może być wtedy dniem na siłę (od 2 lat stażu siłowego).",
};

export const BUTTON = { next: "Dalej", done: "Gotowe", back: "Wstecz" };

export const PREVIEW = {
  title: "Podgląd tygodnia",
  note: "Podgląd zmienia się razem z Twoimi odpowiedziami.",
  building: "Twój plan jest prawie gotowy",
  soon: "za chwilę zaczynamy",
};

export const yearsText = (v: number): string => (v === 0 ? "mniej niż rok" : v === 1 ? "1 rok" : v >= 2 && v <= 4 ? `${v} lata` : `${v} lat`);
