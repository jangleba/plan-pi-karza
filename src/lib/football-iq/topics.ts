// Prosty, lokalny katalog tematów Football IQ.
// Bez backendu, bez AI, bez grywalizacji. Dane wyłącznie in-memory.

export type IQTopic = {
  id: string;
  title: string;
  subtitle: string;
  learn: {
    situation: string;
    cues: string[];
    rule: string;
  };
  setup: string[];
  fieldReps: number;
};

export const IQ_TOPICS: IQTopic[] = [
  {
    id: "scanning-before-reception",
    title: "Skanowanie przed przyjęciem",
    subtitle: "Zobacz zanim dostaniesz piłkę",
    learn: {
      situation:
        "Piłka jest w drodze do Ciebie. Zanim dojdzie, masz około sekundy, żeby odwrócić głowę i sprawdzić, co dzieje się wokół.",
      cues: [
        "Kto stoi za Twoimi plecami i po bokach.",
        "Gdzie jest wolna przestrzeń, w którą możesz się otworzyć.",
        "Która noga ustawia Cię twarzą do gry.",
      ],
      rule:
        "Skanuj zanim dostaniesz piłkę, nie po. Kierunek pierwszego kontaktu ustala Twoja głowa, nie stopa.",
    },
    setup: [
      "Postaw telefon poziomo za sobą, na wysokości bioder.",
      "Ustaw się plecami do telefonu, twarzą do ściany lub partnera.",
      "Podaj piłkę do ściany lub partnera.",
      "W trakcie ruchu piłki odwróć głowę i odczytaj bodziec z ekranu.",
      "Wykonaj przyjęcie, podanie lub prowadzenie zgodnie z tym, co zobaczyłeś.",
    ],
    fieldReps: 6,
  },
];

export function getTopic(id: string): IQTopic | undefined {
  return IQ_TOPICS.find((t) => t.id === id);
}
