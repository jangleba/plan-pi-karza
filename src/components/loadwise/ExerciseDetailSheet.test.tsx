import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExerciseTechniqueContent } from "./ExerciseDetailSheet";

describe("shared exercise technique content", () => {
  it("removes repeated step numbering while preserving meaningful titles, instructions and stop guidance", () => {
    const html = renderToStaticMarkup(
      <ExerciseTechniqueContent
        visual={<span />}
        exercise={{
          id: "technique-test",
          name: "Własny ruch techniczny",
          instructionSteps: [
            { title: "Krok 1", description: "Stań stabilnie." },
            { title: " Krok 2 ", description: "Wykonaj ruch powoli." },
            { title: "Kontrola kolana", description: "Utrzymaj kolano nad stopą." },
          ],
          contraindications: "Przerwij przy ostrym bólu.",
        }}
      />,
    );
    expect(html).not.toContain("Krok 1");
    expect(html).not.toContain("Krok 2");
    expect(html).toContain("Stań stabilnie.");
    expect(html).toContain("Wykonaj ruch powoli.");
    expect(html).toContain("Kontrola kolana");
    expect(html).toContain("Utrzymaj kolano nad stopą.");
    expect(html).toContain("Przerwij przy ostrym bólu.");
  });
});
