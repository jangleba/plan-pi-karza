import type { IQRole, JourneyDefinition } from "./journeyTypes";

export const ADVANCED_JOURNEY_BANK_VERSION = "2026-11-01.5";
const roles: IQRole[] = ["gk", "cb", "fb", "six", "eight", "ten", "wing", "nine"];
const names: Record<IQRole, string[]> = {
  gk: [
    "Wyprowadzenie przez trzeciego zawodnika",
    "Wciągnij pressing i zmień stronę",
    "Asekuracja przedpola i wyjście spod nacisku",
  ],
  cb: [
    "Wyprowadzenie poza cień napastnika",
    "Przyciągnięcie i diagonal na wolną stronę",
    "Osłoń środek przed wyjściem do rywala",
  ],
  fb: [
    "Boczny trójkąt: podanie i ruch w drugim tempie",
    "Przewaga przy linii czy zmiana strony?",
    "Doskok przy linii z osłoną półprzestrzeni",
  ],
  six: [
    "Trzeci zawodnik za linią pressingu",
    "Wciągnięcie szóstki i wyjście drugą stroną",
    "Doskok czy utrzymanie osłony przed stoperami?",
  ],
  eight: [
    "Odegraj i pojaw się za plecami pomocnika",
    "Przewaga w półprzestrzeni i wolna strona",
    "Nacisk na piłkę bez otwarcia środka",
  ],
  ten: [
    "Między liniami: ściana i trzeci zawodnik",
    "Zwiąż pomocnika przed zmianą strony",
    "Cień krycia przy doskoku do stopera",
  ],
  wing: [
    "Skrzydło: ściana, ruch i ponowne otwarcie",
    "Obieg, zejście do środka czy przeniesienie?",
    "Pressing skrzydłowego z zabezpieczeniem środka",
  ],
  nine: [
    "Zejście dziewiątki i wejście trzeciego",
    "Zwiąż stopera i uwolnij drugi sektor",
    "Zakrzywiony doskok i zamknięcie podania do szóstki",
  ],
};
const contexts = [
  "78′ · prowadzisz 1:0 · rywal naciska wysoko",
  "54′ · remis 0:0 · rywal pilnuje odbiorców",
  "82′ · przegrywasz 0:1 · rywal broni środka",
];
const concepts = ["third-player", "overload-switch", "press-cover"] as const;

/** Three different tactical problems per role, each with three pressure/score contexts. */
export const advancedJourneyBank: JourneyDefinition[] = roles.flatMap((role, roleIndex) =>
  concepts.flatMap((concept, topic) =>
    contexts.map((contextLabel, context) => ({
      id: `iqx-${role}-${topic}-${context}`,
      topicId: `iqx-${role}-${topic}`,
      title: names[role][topic],
      role,
      concept,
      pattern:
        concept === "third-player"
          ? "third-air"
          : concept === "overload-switch"
            ? "switch-air"
            : "defend-air",
      focus:
        concept === "third-player"
          ? "Oceń reakcję pressingu, linię do trzeciego zawodnika i moment ponownego wsparcia."
          : concept === "overload-switch"
            ? "Porównaj nacisk na piłkę, miejsce przy odbiorcy i zabezpieczenie ewentualnej straty."
            : "Sprawdź osłonę za plecami przed doskokiem; po odbiorze wybierz kierunek wyjścia.",
      context: context as 0 | 1 | 2,
      contextLabel,
      ordinal: roleIndex * 9 + topic * 3 + context,
      revision: 3 as const,
      delivery: concept === "overload-switch" ? "lofted" : "chip",
      steps:
        concept === "press-cover"
          ? ["cover", "mark", "press", "pass", "move", "pass"]
          : concept === "third-player"
            ? ["pass", "move", "pass", "move", "carry", "pass"]
            : [
                "carry",
                "pass",
                "move",
                "pass",
                "move",
                role === "gk" || role === "cb" || role === "six" ? "pass" : "finish",
              ],
    })),
  ),
);
