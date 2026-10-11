/** Instrukcje skipów uzgodnione z trenerem, 11.10.2026. */
export const SKIP_LANDING = "Ląduj na śródstopiu pod biodrem — nie przed ani za sobą.";

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
      "Kolano do biodra; rama 90° w biodrze, kolanie i kostce.",
      "Ściągnij stopę mocno w dół pod biodro.",
      "Zmieniaj nogi; ręce pracują przeciwnie.",
    ],
    setup: "Tułów pionowo, wzrok przed siebie, stopa zadarta.",
    focus: "Rama 90° i mocno pod siebie.",
    errors: ["Stopa lądująca przed lub za biodrem", "Lądowanie na całej stopie"],
    imageAlt: "Skip A z boku: pozycja A jednej nogi, przejście i pozycja A drugiej nogi.",
  },
  b_skip: {
    exerciseId: "b_skip",
    title: "Skip B",
    steps: [
      "Unieś kolano jak w skipie A.",
      "Wysuń podudzie w przód, około 40° od pionu.",
      "Grzebnij mocno w dół pod biodro i zmień nogę.",
    ],
    setup: "Tułów pionowo, barki luźne, ręce pracują przeciwnie do nóg.",
    focus: "Pozycja A → wysunięcie → grzebnięcie pod biodro.",
    errors: ["Kontakt stopy przed lub za biodrem", "Lądowanie na całej stopie"],
    imageAlt: "Skip B z boku: pozycja A, wysunięcie podudzia w przód i powrót pod biodro.",
  },
  c_skip: {
    exerciseId: "c_skip",
    title: "Skip C",
    steps: [
      "Pięta do pośladka, kolano lekko w przód.",
      "But nie wychodzi za pośladek; stopa bez skręcania.",
      "Ściągnij stopę mocno w dół tą samą linią i zmień nogę.",
    ],
    setup: "Tułów pionowo; pięta porusza się pod biodrem, a stopa pozostaje bez rotacji.",
    focus: "Pięta do pośladka i mocno w dół tą samą linią.",
    errors: ["But wychodzący za tylną linię pośladka", "Skręcanie stopy na boki"],
    imageAlt:
      "Skip C z boku: pięta do pośladka jednej nogi, przejście i druga noga; but w obrysie pośladka.",
  },
  d_skip: {
    exerciseId: "d_skip",
    title: "Skip D",
    steps: [
      "Pracuj na zmianę prostymi nogami, palce stóp w górę.",
      "Tułów pionowo lub lekko w przód — nie odchylaj się w tył.",
      "Odbijaj się mocno; nogi mijają się pod biodrami.",
    ],
    setup: "Proste kolano, ruch z biodra; tułów pionowo lub lekko w przód.",
    focus: "Prosta noga, stabilny tułów, mocne odbicie.",
    errors: ["Odchylanie tułowia do tyłu", "Kontakt stopy przed lub za biodrem"],
    imageAlt: "Skip D z boku: naprzemienna praca prostych nóg i dwie fazy przejściowe w powietrzu.",
  },
};

/** Dokładne ID; warianty z dodatkowymi odbiciami zachowują własną instrukcję. */
export function getSkipGuide(exerciseId: string | null | undefined): SkipGuide | null {
  const id = exerciseId?.trim();
  return id && Object.hasOwn(SKIP_GUIDES, id) ? SKIP_GUIDES[id] : null;
}
