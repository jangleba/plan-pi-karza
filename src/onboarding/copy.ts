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
    "Każdego dnia wiesz, co masz robić",
    "Sześć krótkich pytań, około minuty",
  ],
  ageNote: "Aplikacja jest dla osób, które ukończyły 16 lat.",
  start: "Zaczynamy",
};

export const STEP_TITLE = ["", "O Tobie", "Na boisku", "Twój cel", "Sezon", "Trening", "Twój tydzień"] as const;
export const STEP_HINT = [
  "",
  "Tyle wystarczy, aby dobrać spersonalizowane obciążenia.",
  "Określ swoją pozycję i zaznacz, co chcesz poprawić w swojej grze.",
  "W treningach ważne jest określenie, do czego się dąży. Określ maksymalnie dwa swoje cele. Twój pierwszy wybór będzie wiodący, natomiast drugi będzie pełnił rolę uzupełnienia pierwszego.",
  "Wskaż, w jakim momencie sezonu się znajdujesz, i określ swoją ligę.",
  "Określ, jak długo ćwiczysz i do jakich miejsc masz dostęp.",
  "Określ swoją dostępność: w jakie dni jesteś zajęty, kiedy trenujesz w klubie i kiedy grasz mecz. Pozwoli nam to dopasować treningi do Twoich potrzeb.",
] as const;

export const POSITIONS: Array<[Position, string]> = [
  ["bramkarz", "Bramkarz"], ["obronca", "Obrońca"], ["pomocnik", "Pomocnik"], ["skrzydlowy", "Skrzydłowy"], ["napastnik", "Napastnik"],
];

export const GOALS: Array<[SeasonGoal, string, string]> = [
  ["speed", "Szybkość", "Szybsze starty i zrywy. + trening sprintu, gdy w tygodniu zostaje wolny dzień."],
  ["strength", "Siła", "Wygrywanie pojedynków. + trening siłowy, gdy w tygodniu zostaje wolny dzień."],
  ["endurance", "Wytrzymałość", "Siły na całe spotkanie. + bieganie, gdy w tygodniu zostaje wolny dzień."],
  ["return", "Powrót po przerwie", "Spokojne wejście w rytm: pierwsze dwa tygodnie są lżejsze."],
];

export const SEASONS: Array<[Season, string, string]> = [
  ["preseason", "Przygotowanie do sezonu", "Budujemy formę przed startem rozgrywek."],
  ["inseason", "Trwa sezon", "Plan układa się wokół meczów."],
  ["offseason", "Przerwa między sezonami", "Utrzymujemy formę, bez meczów i lżej."],
];

export const EQUIPMENT: Array<[Equipment, string]> = [["gym", "Siłownia"], ["field", "Boisko"], ["track", "Bieżnia"]];

export const DAY_LABEL: Record<DayState, string> = { free: "wolny", club: "klub", match: "mecz", off: "zajęty" };
export const dayHelp = (offseason: boolean): string => (offseason ? "Zmień kolor kafelka, klikając w niego ponownie: wolny, klub, zajęty." : "Zmień kolor kafelka, klikając w niego ponownie: wolny, klub, mecz, zajęty.");

export const LABEL = {
  name: "Jak masz na imię?",
  namePlaceholder: "Imię",
  age: "Wiek",
  weight: "Masa ciała",
  height: "Wzrost",
  heightNote: "Wzrost jest opcjonalny: służy tylko do przeliczenia skali w pomiarze skoku z nagrania i zostaje wyłącznie na Twoim urządzeniu.",
  heightSkip: "Wolę nie podawać",
  heightAdd: "Podaj wzrost",
    ageNote: "Aplikacja jest dla osób, które ukończyły 16 lat.",
  position: "Na jakiej pozycji grasz?",
  feel: "Co Tobie najbardziej przeszkadza w grze? (możesz zaznaczyć kilka)",
  feelOtherNote: "Plan układamy z trzech obszarów: szybkości, siły i wytrzymałości. Cel wybierzesz w następnym kroku.",
  season: "W którym momencie sezonu jesteś?",
  league: "W jakiej grasz lidze?",
  leagueEmpty: "Wybierz poziom rozgrywek",
  years: "Od jak dawna ćwiczysz?",
  equipment: "Do jakich miejsc masz dostęp? (opcjonalnie, zawsze wliczamy własny ciężar)",
};

export const BUTTON = { next: "Dalej", done: "Gotowe", back: "Wstecz" };

export const PREVIEW = {
  title: "Podgląd tygodnia",
  note: "Podgląd zmienia się razem z Twoimi odpowiedziami.",
  building: "Twój plan jest prawie gotowy",
  soon: "za chwilę zaczynamy",
};

export const yearsText = (v: number): string => (v === 0 ? "mniej niż rok" : v === 1 ? "1 rok" : v >= 2 && v <= 4 ? `${v} lata` : `${v} lat`);
