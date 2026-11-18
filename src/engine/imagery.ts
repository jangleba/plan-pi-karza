import type { Position } from "./profile";
import type { Vec } from "./iq";

/**
 * „Mecz w głowie”: prowadzona wizualizacja przed meczem (ok. 3 min).
 * Treści są MOJE (szkice), do przeglądu trenera. Trening wyobrażeniowy ma wsparcie
 * w literaturze psychologii sportu, ale konkretne scenariusze nie pochodzą z badań.
 * Współrzędne jak w IQ: atak w stronę x = 105.
 */
export interface ImageryStep {
  title: string;
  cue: string;
  seconds: number;
  /** Twoja ścieżka na tablicy (pierwszy punkt = start). */
  path?: Vec[];
  /** Ścieżka piłki (np. podanie, dośrodkowanie). */
  ball?: Vec[];
}

const BREATH: ImageryStep = {
  title: "Oddech",
  cue: "Zamknij oczy. Wdech nosem przez 4 sekundy, wydech ustami przez 6. Poczuj stopy na ziemi.",
  seconds: 30,
};

const CLOSE: ImageryStep = {
  title: "Słowo na mecz",
  cue: "Wybierz jedno słowo, które przypomni Ci o najważniejszym zadaniu (np. „skanuj”, „naprzód”, „spokój”). Powtórz je w myślach trzy razy.",
  seconds: 20,
};

const BY_POSITION: Record<Position, ImageryStep[]> = {
  pomocnik: [
    { title: "Skanowanie", cue: "Zanim piłka do Ciebie dotrze, dwa razy oglądasz się przez ramię. Widzisz wolnego kolegę i obrońcę za plecami.", seconds: 35, path: [{ x: 50, y: 34 }, { x: 54, y: 30 }] },
    { title: "Przyjęcie kierunkowe", cue: "Otwierasz ciało i pierwszym kontaktem prowadzisz piłkę do przodu. Od razu podanie progresywne między liniami.", seconds: 35, path: [{ x: 54, y: 30 }, { x: 60, y: 28 }], ball: [{ x: 60, y: 28 }, { x: 78, y: 36 }] },
    { title: "Reakcja po stracie", cue: "Tracisz piłkę. Natychmiast doskakujesz do rywala przez 5 sekund, odcinasz najbliższe podanie.", seconds: 35, path: [{ x: 62, y: 30 }, { x: 66, y: 34 }] },
    { title: "Druga linia", cue: "Akcja na skrzydle. Wbiegasz na skraj pola karnego w wolną strefę i czekasz na odegranie.", seconds: 35, path: [{ x: 70, y: 40 }, { x: 86, y: 36 }], ball: [{ x: 98, y: 14 }, { x: 86, y: 36 }] },
  ],
  obronca: [
    { title: "Linia razem", cue: "Patrzysz na partnerów z linii. Gdy rywal podaje do tyłu, wszyscy robicie krok do przodu jednocześnie.", seconds: 35, path: [{ x: 30, y: 30 }, { x: 34, y: 30 }] },
    { title: "Obrona 1 na 1", cue: "Schodzisz nisko, bokiem, na odległość ręki. Kierujesz rywala do linii bocznej i czekasz na jego błąd.", seconds: 35, path: [{ x: 28, y: 20 }, { x: 26, y: 14 }] },
    { title: "Wyprowadzenie", cue: "Odbierasz piłkę, podnosisz głowę i podajesz po ziemi do wolnego pomocnika między liniami.", seconds: 35, path: [{ x: 26, y: 30 }, { x: 30, y: 30 }], ball: [{ x: 30, y: 30 }, { x: 48, y: 36 }] },
    { title: "Stały fragment", cue: "Rzut rożny dla rywala. Masz swojego zawodnika, kontakt ręką, atakujesz piłkę w najwyższym punkcie.", seconds: 35, path: [{ x: 10, y: 30 }, { x: 7, y: 32 }], ball: [{ x: 0, y: 0 }, { x: 7, y: 32 }] },
  ],
  skrzydlowy: [
    { title: "Atak 1 na 1", cue: "Przyjmujesz przy linii, zwalniasz przed obrońcą i nagle przyspieszasz na zewnątrz.", seconds: 35, path: [{ x: 70, y: 6 }, { x: 84, y: 5 }] },
    { title: "Bieg za plecy", cue: "Boczny obrońca patrzy na piłkę. Startujesz za jego plecy w momencie, gdy kolega podnosi głowę.", seconds: 35, path: [{ x: 74, y: 10 }, { x: 92, y: 8 }], ball: [{ x: 66, y: 24 }, { x: 92, y: 8 }] },
    { title: "Dośrodkowanie po ziemi", cue: "Dochodzisz do linii końcowej i zagrywasz mocno po ziemi w strefę przed bramką, między bramkarza a obrońców.", seconds: 35, path: [{ x: 92, y: 8 }, { x: 100, y: 12 }], ball: [{ x: 100, y: 12 }, { x: 98, y: 30 }] },
    { title: "Powrót", cue: "Strata. Wracasz sprintem i zamykasz swoją stronę, zanim rywal przyspieszy.", seconds: 35, path: [{ x: 80, y: 10 }, { x: 55, y: 10 }] },
  ],
  napastnik: [
    { title: "Krótki słupek", cue: "Piłka na skrzydle. Wbiegasz przed obrońcę na krótki słupek w chwili dośrodkowania.", seconds: 35, path: [{ x: 88, y: 38 }, { x: 99, y: 30 }], ball: [{ x: 96, y: 8 }, { x: 99, y: 30 }] },
    { title: "Gra tyłem", cue: "Obrońca za Twoimi plecami. Zastawiasz piłkę ciałem i odgrywasz na jeden kontakt do nadbiegającego pomocnika.", seconds: 35, path: [{ x: 80, y: 34 }, { x: 79, y: 34 }], ball: [{ x: 79, y: 34 }, { x: 70, y: 38 }] },
    { title: "Timing biegu", cue: "Stoisz na linii ostatniego obrońcy. Ruszasz dokładnie w chwili podania, nie wcześniej.", seconds: 35, path: [{ x: 88, y: 34 }, { x: 98, y: 36 }], ball: [{ x: 70, y: 30 }, { x: 98, y: 36 }] },
    { title: "Pierwszy pressing", cue: "Rywal rozgrywa od tyłu. Biegniesz łukiem, odcinając podanie do drugiego obrońcy.", seconds: 35, path: [{ x: 80, y: 30 }, { x: 92, y: 24 }] },
  ],
  bramkarz: [
    { title: "Ustawienie", cue: "Strzał z boku pola karnego. Krok w stronę bliższego słupka, ciężar na przodzie stóp, ręce gotowe.", seconds: 35, path: [{ x: 3, y: 34 }, { x: 3, y: 31 }] },
    { title: "Wyjście do dośrodkowania", cue: "Wołasz „moja!”, wychodzisz na piłkę i łapiesz ją w najwyższym punkcie, kolano w górze.", seconds: 35, path: [{ x: 3, y: 34 }, { x: 8, y: 30 }], ball: [{ x: 16, y: 2 }, { x: 8, y: 30 }] },
    { title: "Gra nogą", cue: "Napastnik doskakuje. Spokojnie podajesz do obrońcy po stronie przeciwnej do pressingu.", seconds: 35, path: [{ x: 6, y: 34 }, { x: 6, y: 34 }], ball: [{ x: 6, y: 34 }, { x: 16, y: 54 }] },
    { title: "Komunikacja", cue: "Stały fragment. Głośno ustawiasz mur i obrońców: kto kryje kogo, gdzie strefa.", seconds: 35, path: [{ x: 3, y: 34 }, { x: 4, y: 34 }] },
  ],
};

export function imageryFor(position: Position): ImageryStep[] {
  return [BREATH, ...BY_POSITION[position], CLOSE];
}

export function totalSeconds(steps: ImageryStep[]): number {
  return steps.reduce((a, s) => a + s.seconds, 0);
}
