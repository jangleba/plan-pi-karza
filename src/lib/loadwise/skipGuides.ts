/** Educational cues; joint angles refer to the named phase, not the entire drill. */
export const SKIP_LANDING = "Sprowadzaj stopę blisko pod biodro. Przyjmuj kontakt sprężyście od przodu stopy; pozwól pięcie naturalnie opaść.";

export interface SkipGuide {
  exerciseId: string;
  title: string;
  steps: readonly [string, string, string];
  setup: string;
  focus: string;
  errors: readonly string[];
  imageAlt: string;
}

export const SKIP_GUIDES: Readonly<Record<string, SkipGuide>> = {
  a_skip: {
    exerciseId: "a_skip",
    title: "Skip A",
    steps: [
      "Unieś udo w okolice poziomu; w uniesionej nodze kolano zegnij mniej więcej do kąta prostego.",
      "Ściągnij stopę mocno w dół pod biodro.",
      "Zmieniaj nogi; ręce pracują przeciwnie.",
    ],
    setup: "Tułów pionowo, wzrok przed siebie, stopa zadarta.",
    focus: "Pozycja A w uniesieniu; potem płynne sprowadzenie stopy.",
    errors: ["Sięganie stopą daleko przed ciało", "Odchylanie tułowia dla uniesienia kolana"],
    imageAlt: "Skip A z boku: pozycja A jednej nogi, przejście i pozycja A drugiej nogi.",
  },
  b_skip: {
    exerciseId: "b_skip",
    title: "Skip B",
    steps: [
      "Unieś kolano jak w skipie A.",
      "Płynnie otwórz podudzie w przód, bez szarpnięcia i blokowania kolana.",
      "Grzebnij mocno w dół pod biodro i zmień nogę.",
    ],
    setup: "Tułów pionowo, barki luźne, ręce pracują przeciwnie do nóg.",
    focus: "Pozycja A → wysunięcie → grzebnięcie pod biodro.",
    errors: ["Dalekie kopnięcie zamiast płynnej sekwencji", "Blokowanie kolana przy otwarciu"],
    imageAlt: "Skip B z boku: pozycja A, wysunięcie podudzia w przód i powrót pod biodro.",
  },
  c_skip: {
    exerciseId: "c_skip",
    title: "Skip C",
    steps: [
      "Zegnij kolano, kierując piętę w stronę pośladka, bez wymuszania dotknięcia.",
      "Biodra wysoko, tułów stabilny; stopa nie skręca na boki.",
      "Ściągnij stopę mocno w dół tą samą linią i zmień nogę.",
    ],
    setup: "Tułów pionowo; pięta wraca blisko ciała, a stopa pozostaje bez rotacji.",
    focus: "Pięta do pośladka i mocno w dół tą samą linią.",
    errors: ["Wymuszanie dotknięcia pośladka kosztem ustawienia tułowia", "Skręcanie stopy na boki"],
    imageAlt:
      "Skip C z boku: pięta do pośladka jednej nogi, przejście i druga noga; but w obrysie pośladka.",
  },
  d_skip: {
    exerciseId: "d_skip",
    title: "Skip D",
    steps: [
      "Pracuj na zmianę prawie prostymi nogami, bez blokowania kolan; palce stóp w górę.",
      "Tułów pionowo lub lekko w przód — nie odchylaj się w tył.",
      "Odbijaj się mocno; nogi mijają się pod biodrami.",
    ],
    setup: "Prawie proste, miękkie kolano; ruch z biodra, stabilny tułów.",
    focus: "Ruch z biodra, bez przeprostu kolana.",
    errors: ["Odchylanie tułowia do tyłu", "Kontakt stopy przed lub za biodrem"],
    imageAlt: "Skip D z boku: naprzemienna praca prostych nóg i dwie fazy przejściowe w powietrzu.",
  },
};

/** Dokładne ID; warianty z dodatkowymi odbiciami zachowują własną instrukcję. */
export function getSkipGuide(exerciseId: string | null | undefined): SkipGuide | null {
  const id = exerciseId?.trim();
  return id && Object.hasOwn(SKIP_GUIDES, id) ? SKIP_GUIDES[id] : null;
}
