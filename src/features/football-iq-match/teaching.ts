import type { ActionMode, Point, Scenario } from "./types";

export type TacticalLesson = {
  observe: string;
  when: string;
  why: string;
  transfer: string;
  cues: string[];
};
export type TeachingMarker = {
  letter: string;
  id: string;
  label: string;
  instruction: string;
  point: Point;
};

// Authored explanations for these simplified situations, not universal match prescriptions.
export const lessons: Record<string, TacticalLesson> = {
  "overload-switch-01": {
    observe: "Porównaj zagęszczenie obu stron i miejsce przed dalszym skrzydłowym.",
    when: "Gdy rywal przesunął się do piłki, a partner po drugiej stronie ma czas na przyjęcie.",
    why: "Zmiana strony przenosi akcję poza nacisk. Dopiero dalszy ruch wykorzystuje tę przestrzeń.",
    transfer:
      "Jako skrzydłowy sprawdź przestrzeń przed przyjęciem. Jako pomocnik szukaj dalszej strony i zachowaj wsparcie za piłką.",
    cues: ["Wolna strona", "Kontynuacja"],
  },
  "wall-pass-02": {
    observe: "Znajdź partnera do odegrania i wolne miejsce za obrońcą.",
    when: "Gdy obrońca zamyka prowadzenie, ale partner jest dostępny pod kątem.",
    why: "Po podaniu zmieniasz pozycję. Odegranie może ominąć obrońcę bez prowadzenia prosto na niego.",
    transfer:
      "Po oddaniu piłki rusz w dostępne miejsce, zamiast stać. Partner odgrywa wtedy, gdy widzi linię podania.",
    cues: ["Partner", "Za obrońcą", "Odegranie"],
  },
  "third-player-03": {
    observe: "Sprawdź pośrednika i odbiorcę, do którego bezpośrednie podanie jest zamknięte.",
    when: "Gdy rywal zasłania pierwszy kierunek, ale dwa krótsze podania mają otwarte linie.",
    why: "Pośrednik zmienia kąt zagrania. Trzeci zawodnik może otrzymać piłkę za pierwszą linią nacisku.",
    transfer:
      "Jako trzeci zawodnik przygotuj pozycję do przyjęcia. Jako pośrednik sprawdź odbiorcę jeszcze przed podaniem do Ciebie.",
    cues: ["Pośrednik", "Trzeci zawodnik", "Przestrzeń dalej"],
  },
  "counter-04": {
    observe: "Porównaj pozycję obrońcy z kierunkiem biegu wolnego partnera.",
    when: "Gdy masz miejsce na prowadzenie, partner daje szerokość, a obrońca musi wybrać kogo zamknąć.",
    why: "Prowadzenie może przyciągnąć obrońcę. Podanie ma sens zanim nacisk zamknie linię do partnera.",
    transfer:
      "Obserwuj decyzję obrońcy: gdy wychodzi do Ciebie, szukaj partnera; gdy pilnuje podania, sprawdź miejsce do prowadzenia.",
    cues: ["Przyciągnij rywala", "Uwolnij partnera", "Kontynuuj"],
  },
  "press-escape-05": {
    observe: "Znajdź wsparcie za piłką i wyjście po przeciwnej stronie nacisku.",
    when: "Gdy droga do przodu jest zamknięta, a partner z tyłu ma dostępny kąt do podania.",
    why: "Podanie wstecz może uwolnić piłkę spod nacisku i otworzyć inny kierunek.",
    transfer:
      "Pod piłką ustaw się tak, by widzieć posiadacza i dalszą stronę. Przed podaniem sprawdź, czy wsparcie nie jest kryte.",
    cues: ["Wsparcie z tyłu", "Poza naciskiem", "Wyjście"],
  },
  "overlap-06": {
    observe: "Sprawdź pas przy linii po zewnętrznej stronie skrzydłowego.",
    when: "Gdy skrzydłowy ma piłkę, a za bocznym obrońcą rywala pojawia się dostępny korytarz.",
    why: "Obieg dodaje opcję na zewnątrz i zmusza rywala do reagowania na drugiego zawodnika.",
    transfer:
      "Jako boczny obrońca dopasuj start do kontroli piłki partnera. Skrzydłowy podaje, gdy linia jest dostępna, a nie automatycznie po każdym obiegu.",
    cues: ["Obieg", "Podanie po ruchu", "Dalsza przestrzeń"],
  },
  "underlap-07": {
    observe:
      "Szukaj korytarza między bocznym a środkowym obrońcą, po wewnętrznej stronie skrzydłowego.",
    when: "Gdy rywal pilnuje szerokości, a wewnętrzny korytarz jest dostępny.",
    why: "Ruch do środka daje inny kąt podania i opcję bliżej centrum akcji.",
    transfer:
      "Zanim ruszysz, sprawdź partnera w tym korytarzu. Nie wbiegaj w tę samą przestrzeń; dopasuj ruch do posiadacza.",
    cues: ["Wewnętrzny korytarz", "Nowy kąt", "Kontynuacja"],
  },
  "support-angle-08": {
    observe: "Sprawdź, czy rywal stoi na linii między posiadaczem a partnerem.",
    when: "Gdy jesteś blisko piłki, ale rywal zasłania podanie do Ciebie.",
    why: "Kilka kroków w bok zmienia kąt i może utworzyć dostępną linię podania.",
    transfer:
      "Jako pomocnik wyjdź z cienia krycia, czyli z miejsca zasłoniętego przez rywala. Pokaż się pod kątem i przygotuj kolejne zagranie.",
    cues: ["Wyjdź z cienia", "Odbierz pod kątem", "Zmień stronę"],
  },
  "between-lines-09": {
    observe: "Znajdź partnera w przestrzeni między pomocą a obroną rywala.",
    when: "Gdy linia podania jest otwarta, a odbiorca może przyjąć bez natychmiastowego doskoku.",
    why: "Podanie za linię pomocy może ominąć kilku rywali, jeśli odbiorca ma możliwość kontynuacji.",
    transfer:
      "Jako odbiorca sprawdź rywala za plecami. Jeśli nie możesz się obrócić, zachowaj opcję odegrania do wsparcia.",
    cues: ["Między liniami", "Miejsce po przyjęciu"],
  },
  "switch-left-10": {
    observe: "Porównaj nacisk przy piłce z miejscem po dalszej stronie.",
    when: "Gdy rywale zagęścili jedną stronę, a partner po przeciwnej pozostaje dostępny.",
    why: "Zmiana kierunku może dać odbiorcy czas, którego brakuje po stronie nacisku.",
    transfer:
      "Utrzymuj szerokość, sprawdzaj ustawienie rywala i przygotuj pierwszy ruch po przyjęciu.",
    cues: ["Dalsza strona", "Miejsce do prowadzenia"],
  },
  "recycle-11": {
    observe: "Sprawdź bezpieczne wsparcie za piłką i szeroko ustawionego partnera.",
    when: "Gdy nie ma dostępnego podania do przodu, ale zespół ma możliwość odbudowy przez tył.",
    why: "Zachowanie piłki pozwala zmienić ustawienie i szukać kolejnej drogi zamiast wymuszać zagranie.",
    transfer:
      "Po cofnięciu piłki znów zaoferuj wsparcie. Odbudowa ataku wymaga nowego ustawienia, nie samego podania do tyłu.",
    cues: ["Zachowaj piłkę", "Nowy kierunek", "Progresja"],
  },
  "cutback-12": {
    observe: "Znajdź partnera dochodzącego przed pole, poza skupieniem obrońców przy bramce.",
    when: "Gdy masz piłkę z boku i wolną linię podania wstecz do przygotowanego odbiorcy.",
    why: "Podanie wstecz może wykorzystać przestrzeń poza pierwszą grupą obrońców.",
    transfer:
      "Odbiorca dopasowuje wejście do partnera z piłką. Posiadacz patrzy na ustawienie, zamiast zagrywać wstecz bez sprawdzenia.",
    cues: ["Wejście partnera", "Podanie wstecz"],
  },
  "through-13": {
    observe: "Sprawdź przestrzeń przed partnerem i możliwość minięcia linii rywala podaniem.",
    when: "Gdy partner może ruszyć do dostępnej przestrzeni, a tor piłki nie jest zamknięty.",
    why: "Podanie przed odbiorcę pozwala mu przyjąć w ruchu zamiast zatrzymywać się przy piłce.",
    transfer:
      "Dopasuj moment podania do startu partnera. Na prawdziwym boisku kontroluj też linię spalonego.",
    cues: ["Przed partnerem", "Kontynuacja w biegu"],
  },
  "cross-14": {
    observe: "Sprawdź dostępnego odbiorcę w polu i rywali na torze podania.",
    when: "Gdy odbiorca ma miejsce, a podanie górą daje dostęp do jego strefy.",
    why: "Wybierasz sposób dotarcia do partnera. Celem ćwiczenia jest właściwa opcja podania, bez potrzeby strzelania gola.",
    transfer:
      "Spójrz na ustawienie partnera przed dośrodkowaniem. Jeśli strefa jest zajęta, sprawdź wsparcie lub podanie wstecz.",
    cues: ["Dostępny odbiorca"],
  },
  "shot-15": {
    observe: "Porównaj wolne miejsce przed posiadaczem z ustawieniem rywali i partnerów.",
    when: "Gdy masz czas po przyjęciu i możesz poprawić pozycję, zanim wybierzesz zakończenie.",
    why: "Najpierw rozpoznajesz przestrzeń. Strzał jest jedną z możliwych decyzji i nie zastępuje celu taktycznego.",
    transfer:
      "Przed zakończeniem sprawdź partnera w lepszej pozycji i opcję prowadzenia. Nie wybieraj strzału tylko dlatego, że jesteś blisko bramki.",
    cues: ["Popraw pozycję"],
  },
  "press-16": {
    observe: "Sprawdź rywala z piłką i partnera za zawodnikiem doskakującym.",
    when: "Gdy możesz ograniczyć czas posiadacza, a partnerzy zabezpieczają przestrzeń za Tobą.",
    why: "Doskok działa jako część wspólnego ustawienia; samotne wyjście może otworzyć miejsce za obrońcą.",
    transfer:
      "Uzgodnij doskok z partnerem. W meczu reaguj na sygnał, np. niedokładne przyjęcie, i chroń groźną linię podania.",
    cues: ["Doskok do piłki"],
  },
  "cover-17": {
    observe: "Znajdź miejsce za partnerem, między piłką a własną bramką.",
    when: "Gdy partner wychodzi do posiadacza, a Ty możesz zabezpieczyć kierunek za nim.",
    why: "Asekuracja pozwala reagować, jeśli rywal ominie pierwszego obrońcę.",
    transfer:
      "Kontroluj piłkę i partnera, utrzymuj kontakt z linią. Dopasuj dystans do tempa akcji i miejsca, które trzeba chronić.",
    cues: ["Za partnerem"],
  },
  "mark-18": {
    observe: "Sprawdź odbiorcę rywala, linię podania i kierunek własnej bramki.",
    when: "Gdy ten odbiorca stanowi zagrożenie, a jego kontrolowanie nie odsłania ważniejszej przestrzeni.",
    why: "Ustawienie po stronie bramki pomaga reagować na przyjęcie lub ruch przeciwnika.",
    transfer:
      "Patrz na piłkę i rywala. Komunikuj przekazanie krycia; nie podążaj za nim bez oceny ustawienia zespołu.",
    cues: ["Kontrola odbiorcy"],
  },
};

export const actionAdvice: Record<ActionMode, { when: string; why: string }> = {
  pass: {
    when: "Partner jest dostępny, a rywal nie zamyka toru piłki.",
    why: "Zmieniasz posiadacza i kąt dalszej akcji.",
  },
  through: {
    when: "Przed partnerem jest miejsce i może on ruszyć do podania.",
    why: "Odbiór w biegu pomaga wykorzystać przestrzeń.",
  },
  cross: {
    when: "Dostępny partner jest w strefie, do której możesz zagrać górą.",
    why: "Wybierasz sposób dotarcia do odbiorcy, zamiast zagrywać w tłok.",
  },
  carry: {
    when: "Masz piłkę i wolny korytarz poza kierunkiem doskoku.",
    why: "Zajmujesz przestrzeń albo skłaniasz rywala do wyjścia.",
  },
  shot: {
    when: "Rozpoznałeś miejsce i opcje partnerów przed zakończeniem.",
    why: "To opcjonalny koniec planu. Ocena dotyczy wcześniejszego celu taktycznego, bez symulowania gola.",
  },
  hold: {
    when: "Masz czas i czekasz na pojawienie się dostępnej opcji.",
    why: "Dajesz partnerom czas na ruch, ale także rywalom na doskok.",
  },
  run: {
    when: "Partner ma piłkę, a Twój ruch może stworzyć nową opcję.",
    why: "Zmieniasz ustawienie bez piłki i otwierasz przestrzeń do zagrania.",
  },
  shift: {
    when: "Posiadacz potrzebuje partnera pod innym kątem lub za piłką.",
    why: "Oferujesz podanie i możliwość zachowania piłki.",
  },
  press: {
    when: "Możesz doskoczyć do piłki i masz zabezpieczenie za sobą.",
    why: "Ograniczasz czas rywala oraz jego dostępne kierunki.",
  },
  cover: {
    when: "Partner doskakuje, a przestrzeń za nim wymaga ochrony.",
    why: "Przygotowujesz reakcję na minięcie pierwszego obrońcy.",
  },
  mark: {
    when: "Odbiorca rywala stanowi zagrożenie w Twojej strefie.",
    why: "Utrudniasz przyjęcie i kontrolujesz jego ruch, zachowując ustawienie zespołu.",
  },
};

export function teachingMarkers(s: Scenario): TeachingMarker[] {
  const lesson = lessons[s.id];
  if (!lesson) return [];
  return s.referenceActions
    .filter((a) => a.type !== "shot")
    .slice(0, 3)
    .map((a, i) => ({
      id: `${s.id}-teach-${i}`,
      letter: String.fromCharCode(65 + i),
      label: lesson.cues[i] ?? "Kolejny ruch",
      instruction:
        a.type === "pass"
          ? `${a.delivery === "through" ? "Zagraj przed" : a.delivery === "cross" ? "Dośrodkuj do" : "Podaj do"} ${s.players.find((p) => p.id === a.targetId)?.number}${a.delivery === "through" ? " w biegu." : "."}`
          : `${s.players.find((p) => p.id === a.playerId)?.number}: ${a.type === "carry" ? "poprowadź piłkę w wolne miejsce." : a.type === "cover" ? "zabezpiecz przestrzeń za partnerem." : a.type === "press" ? "doskocz do rywala z piłką." : a.type === "mark" ? "kontroluj wskazanego odbiorcę." : a.type === "shift" ? "pokaż się pod innym kątem." : "rusz bez piłki w zaznaczoną przestrzeń."}`,
      point: { ...a.to },
    }));
}

export const quickObservations: Record<string, string> = {
  "overload-switch-01": "Znajdź miejsce po dalszej stronie.",
  "wall-pass-02": "Podaj i rusz za obrońcę.",
  "third-player-03": "Otwórz drogę przez pośrednika.",
  "counter-04": "Przyciągnij rywala i uwolnij partnera.",
  "press-escape-05": "Wyjdź przez wsparcie spod nacisku.",
  "overlap-06": "Stwórz opcję po zewnętrznej stronie.",
  "underlap-07": "Znajdź korytarz po wewnętrznej stronie.",
  "support-angle-08": "Wyjdź z cienia krycia.",
  "between-lines-09": "Znajdź partnera między liniami.",
  "switch-left-10": "Przenieś piłkę poza zagęszczenie.",
  "recycle-11": "Zachowaj piłkę i zmień kierunek.",
  "cutback-12": "Znajdź odbiorcę podania wstecz.",
  "through-13": "Zagraj przed partnera w biegu.",
  "cross-14": "Sprawdź odbiorcę przed dośrodkowaniem.",
  "shot-15": "Najpierw znajdź wolne miejsce.",
  "press-16": "Sprawdź doskok i wsparcie za sobą.",
  "cover-17": "Zabezpiecz przestrzeń za partnerem.",
  "mark-18": "Kontroluj odbiorcę i linię podania.",
};
