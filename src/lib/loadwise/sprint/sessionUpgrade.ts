import { createRampBlock } from "./rampProtocol";
import type { SprintSession } from "./types";

function isLegacyRamp(title: string, id: string): boolean {
  const value = `${id} ${title}`.toLocaleLowerCase("pl-PL");
  return value.includes("ramp") || value.includes("przygotowanie do sprintu");
}

/** Zamienia wyłącznie stary, jednoelementowy opis RAMP na 6 prowadzonych kroków. */
export function upgradeSprintSession(session: SprintSession): SprintSession {
  return {
    ...session,
    blocks: session.blocks.map((block) => {
      if (!isLegacyRamp(block.title, block.id) || block.exercises.length > 1) {
        return block;
      }
      return createRampBlock(block.number, block.id);
    }),
  };
}

