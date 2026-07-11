import { describe, it, expect } from "vitest";
import { flatToStructured } from "./strengthBlocks";
import type { ExerciseItem } from "./types";

/**
 * Test regresji modułu Plan.
 *
 * Zamraża strukturę i nazwy sekcji ekranu jednostki treningowej, aby żadna
 * praca nad innymi modułami (np. Vision Lab) nie zmieniła po cichu wyglądu Planu.
 */

const mk = (name: string): ExerciseItem => ({
  name,
  prescription: "3 × 8",
  rest: "90 s",
  cue: "Kontrola ruchu.",
});

describe("regresja Planu — sekcje jednostki treningowej", () => {
  const sections = {
    warmup: [mk("Mobilizacja bioder")],
    main: [mk("Przysiad ze sztangą")],
    accessory: [mk("Plank")],
    footballTransfer: [mk("Sprint z piłką")],
    cooldown: [mk("Rozciąganie")],
  };

  it("zachowuje kolejność i pełne nazwy sekcji", () => {
    const structured = flatToStructured(sections);
    expect(structured.map((s) => s.title)).toEqual([
      "Rozgrzewka",
      "Część główna",
      "Część dodatkowa / stabilizacja",
      "Transfer piłkarski",
      "Wyciszenie",
    ]);
  });

  it("pomija puste sekcje, zachowując kolejność pozostałych", () => {
    const structured = flatToStructured({
      warmup: [mk("Mobilizacja")],
      main: [mk("Przysiad")],
      accessory: [],
      footballTransfer: [],
      cooldown: [mk("Rozciąganie")],
    });
    expect(structured.map((s) => s.title)).toEqual([
      "Rozgrzewka",
      "Część główna",
      "Wyciszenie",
    ]);
  });

  it("przenosi serie/powtórzenia, przerwy i wskazówki do ćwiczeń", () => {
    const structured = flatToStructured(sections);
    const first = structured[0].blocks[0].exercises[0];
    expect(first.name).toBe("Mobilizacja bioder");
    expect(first.reps).toBe("3 × 8");
    expect(first.restAfterExercise).toBe("90 s");
    expect(first.cue).toBe("Kontrola ruchu.");
  });

  it("nie skraca ani nie ucina pełnych nazw ćwiczeń", () => {
    const longName = "Przyjęcie cofniętej piłki pod presją z obrotem i podaniem o ścianę";
    const structured = flatToStructured({
      warmup: [],
      main: [mk(longName)],
      accessory: [],
      footballTransfer: [],
      cooldown: [],
    });
    expect(structured[0].blocks[0].exercises[0].name).toBe(longName);
  });
});
